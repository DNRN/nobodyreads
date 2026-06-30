import { Hono } from "hono";
import type { Database } from "../db/index.js";
import { DEFAULT_TENANT_ID } from "../shared/types.js";

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

  app.use('/ai', async (c, next) => {
    return c.json('Hello World', 200);
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
