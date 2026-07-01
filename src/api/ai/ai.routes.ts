import { Hono } from "hono";
import OpenAI from "openai";
import type { Database } from "../../db/index.js";
import { DEFAULT_TENANT_ID } from "../../shared/types.js";
import { AIGenerate } from "./ai.js";

export interface AiApiOptions {
	db: Database;
	tenantId?: string;
	/** OpenAI API key — required for all AI routes. */
	openaiApiKey: string;
}

/**
 * AI API group — per-tenant OpenAI-backed endpoints.
 * Mount at /api. Requires a valid openaiApiKey.
 *
 * Routes:
 *   (none yet — add per-feature routes here)
 */
export function createAiApiRoutes(options: AiApiOptions): Hono {
	const { openaiApiKey } = options;
	const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;

	const app = new Hono();

	app.get("/ai", async (c) => {
		return c.json("Hello World", 200);
	});

	app.post("/ai/theme", async (c) => {
		const body = await c.req.json<{ input: string }>();
		const { input } = body;

		try {
			const response = await AIGenerate.theme(input);
			return c.json(response);
		} catch (err) {
			if (err instanceof OpenAI.APIError) {
				return c.json({ error: err.message }, err.status ?? 502);
			}
			console.error("AI theme generation failed:", err);
			return c.json({ error: "Failed to generate theme" }, 500);
		}
	});

	// Guard: reject all AI routes if no key is configured
	app.use("/ai/*", async (c, next) => {
		if (!openaiApiKey) {
			return c.json({ error: "AI features not configured" }, 503);
		}
		return next();
	});

	return app;
}
