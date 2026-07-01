import { Hono } from "hono";
import OpenAI from "openai";
import { AIGenerate } from "../../../api/ai/ai.js";
import { getSiteTemplate } from "../../../shared/site-bundle.js";
import { DEFAULT_TEMPLATE } from "../../../template/defaults.js";
import { applyThemeDiff } from "../../../template/ai-theme.js";
import { validateTheme } from "../../../template/theme-io.js";
import type { SiteTemplateDefinition } from "../../../template/types.js";
import type { AdminModuleContext } from "./types.js";

/**
 * AI theming routes (per-tenant). Generation only — it never persists. The
 * client previews the returned template and saves through the existing
 * `/layout/save` route (a draft revision the author publishes from Design).
 *
 * Routes (mounted under the tenant admin base):
 *   POST /ai/generate  { prompt, base? } -> { template, diff }
 *
 * `base` is an optional template to diff against instead of the stored one,
 * which is how follow-up prompts refine the current (unsaved) preview.
 */
export function createAiRoutes(ctx: AdminModuleContext): Hono {
  const { db, tenantId, ai } = ctx;
  const app = new Hono();

  app.post("/ai/generate", async (c) => {
    if (!ai?.apiKey || !ai.baseURL || !ai.model) {
      return c.json({ error: "AI theming is not configured" }, 503);
    }

    const body = await c
      .req.json<{ prompt?: string; base?: SiteTemplateDefinition }>()
      .catch(() => ({}) as { prompt?: string; base?: SiteTemplateDefinition });
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return c.json({ error: "A prompt is required" }, 400);
    }

    // Refine the client's current preview when it sends a valid base; otherwise
    // start from the stored template (or the default for a fresh tenant).
    let current = (await getSiteTemplate(db, tenantId)) ?? DEFAULT_TEMPLATE;
    if (body.base) {
      const baseValidation = validateTheme(body.base);
      if (baseValidation.ok) current = baseValidation.theme;
    }

    try {
      const diff = await AIGenerate(ai.apiKey, ai.baseURL, ai.model).theme(prompt);
      const merged = applyThemeDiff(current, diff);

      const validation = validateTheme(merged);
      if (!validation.ok) {
        return c.json({ error: `Generated theme was invalid: ${validation.error}` }, 400);
      }

      return c.json({ template: validation.theme, diff });
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
