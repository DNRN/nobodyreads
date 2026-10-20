import { Hono } from "hono";
import OpenAI from "openai";
import type { Database } from "../../db/index.js";
import type { AiProviderConfig } from "../../admin/server/modules/types.js";
import { DEFAULT_TENANT_ID } from "../../shared/types.js";
import { isAiConfigured } from "./config.js";
import { createThemeProvider, type AIThemeProvider } from "./provider.js";

export interface AiApiOptions {
	db: Database;
	tenantId?: string;
	/**
	 * Resolved AI provider config — from the environment via
	 * {@link resolveAiProviderConfig}, or per-tenant via `getTenantAiConfig`.
	 * When absent or unusable, every AI route answers 503: AI is optional.
	 */
	ai?: AiProviderConfig;
}

/**
 * AI API group — per-tenant AI endpoints. Mount at /api.
 *
 * Routes:
 *   GET  /ai       — availability probe
 *   POST /ai/theme — generate a ThemeDiff from a natural-language prompt
 */
export function createAiApiRoutes(options: AiApiOptions): Hono {
	const { ai } = options;
	const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;

	const app = new Hono();

	// The provider object is built on the first guarded request, not at mount:
	// `new OpenAI` throws at construction when credentials are missing, and
	// this factory runs at standalone boot. The guard below is the only path
	// that constructs it.
	let themeProvider: AIThemeProvider | undefined;

	// Guard: reject all AI routes when no usable provider is configured.
	app.use("/ai/*", async (c, next) => {
		if (!themeProvider) {
			if (!isAiConfigured(ai)) {
				return c.json({ error: "AI features not configured" }, 503);
			}
			themeProvider = createThemeProvider(ai);
		}
		return next();
	});

	app.get("/ai", async (c) => {
		return c.json("AI Gen configured", 200);
	});

	app.post("/ai/theme", async (c) => {
		const body = await c.req.json<{ input: string }>();
		const { input } = body;

		try {
			// The /ai/* guard has constructed the provider by the time handlers run.
			const response = await themeProvider!.generateThemeDiff(input);
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
