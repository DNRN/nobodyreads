import { Hono } from "hono";
import OpenAI from "openai";
import type { Database } from "../../db/index.js";
import { DEFAULT_TENANT_ID } from "../../shared/types.js";
import { createThemeProvider, type AIThemeProvider } from "./provider.js";

export interface AiApiOptions {
	db: Database;
	tenantId?: string;
	/** OpenAI API key — required for all AI routes. */
	openaiApiKey: string;
	openaiBaseRoute: string;
}

/**
 * AI API group — per-tenant OpenAI-backed endpoints.
 * Mount at /api. Requires a valid openaiApiKey.
 *
 * Routes:
 *   (none yet — add per-feature routes here)
 */
export function createAiApiRoutes(options: AiApiOptions): Hono {
	const { openaiApiKey, openaiBaseRoute } = options;
	const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;

	const app = new Hono();

	// Guard: reject all AI routes if no key is configured
	app.use("/ai/*", async (c, next) => {
		if (!openaiApiKey) {
			return c.json({ error: "AI features not configured" }, 503);
		}
		if (!openaiBaseRoute) {
			return c.json({ error: "AI features not configured" }, 503);
		}
		return next();
	});

	// OpenAI-compatible provider for the standalone /api/ai/theme endpoint.
	// Built lazily on first use: the OpenAI client throws at construction when
	// credentials are missing, and this factory runs at standalone boot. AI is
	// optional (see the 503 guard), so a missing key must surface as a request
	// error, not kill startup.
	let themeProvider: AIThemeProvider | undefined;
	const getThemeProvider = (): AIThemeProvider => {
		themeProvider ??= createThemeProvider({
			provider: "openai-compatible",
			apiKey: openaiApiKey,
			baseURL: openaiBaseRoute,
			model: process.env.AI_THEME_MODEL ?? "",
		});
		return themeProvider;
	};

	app.get("/ai", async (c) => {
		return c.json("AI Gen configured", 200);
	});

	app.post("/ai/theme", async (c) => {
		const body = await c.req.json<{ input: string }>();
		const { input } = body;

		try {
			const response = await getThemeProvider().generateThemeDiff(input);
			return c.json(response);
		} catch (err) {
			if (err instanceof OpenAI.APIError) {
				return c.json({ error: err.message }, err.status ?? 502);
			}
			console.error("AI theme generation failed:", err);
			return c.json({ error: "Failed to generate theme" }, 500);
		}
	});

	return app;
}
