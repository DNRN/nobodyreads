import { Hono } from "hono";
import OpenAI from "openai";
import { createThemeProvider } from "../../../api/ai/provider.js";
import { generateTheme } from "../../../api/ai/generate-theme.js";
import { createCollectionProvider } from "../../../api/ai/collection-provider.js";
import { generateCollection } from "../../../api/ai/generate-collection.js";
import {
  getTenantAiConfig,
  isAiConfigured,
  SETTING_AI_PROVIDER,
  SETTING_AI_MODEL,
  SETTING_AI_BASE_URL,
  SETTING_AI_API_KEY_ENC,
} from "../../../api/ai/config.js";
import { recordThemeGeneration } from "../../../api/ai/metering.js";
import { getSiteTemplate } from "../../../shared/site-bundle.js";
import {
  getSiteSettings,
  setSiteSetting,
  deleteSiteSetting,
} from "../../../shared/site-settings.js";
import { encryptSecret, isSecretsEncryptionAvailable } from "../../../shared/secrets.js";
import { DEFAULT_TEMPLATE } from "../../../template/defaults.js";
import { validateTheme } from "../../../template/theme-io.js";
import type { SiteTemplateDefinition } from "../../../template/types.js";
import type { AiProvider, AdminModuleContext } from "./types.js";

const AI_PROVIDERS: AiProvider[] = ["openai-compatible", "anthropic", "gemini", "local"];

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
    // A per-tenant BYO provider config in site_settings overrides the platform
    // default (ctx.ai). Either can serve the request; 503 only when neither
    // resolves to a usable config.
    const effectiveAi = (await getTenantAiConfig(db, tenantId)) ?? ai;
    if (!isAiConfigured(effectiveAi)) {
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
      const provider = createThemeProvider(effectiveAi);
      const result = await generateTheme(provider, current, prompt);
      if (!result.ok) {
        return c.json({ error: `Generated theme was invalid: ${result.error}` }, 400);
      }

      // Metering hook for per-plan generation limits (Phase 9). No-op today.
      await recordThemeGeneration(tenantId);
      return c.json({ template: result.template, diff: result.diff });
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        return c.json({ error: err.message }, err.status ?? 502);
      }
      console.error("AI theme generation failed:", err);
      return c.json({ error: "Failed to generate theme" }, 500);
    }
  });

  // --- BYO provider settings (per-tenant, stored in site_settings) ---
  // The API key is encrypted at rest and never returned to the client; the GET
  // reports only whether one is stored. This same surface + secrets util is
  // reused by later AI features (e.g. Phase 4 moderation).

  app.get("/ai/settings", async (c) => {
    const settings = await getSiteSettings(db, tenantId);
    return c.json({
      provider: settings[SETTING_AI_PROVIDER] ?? "",
      model: settings[SETTING_AI_MODEL] ?? "",
      baseURL: settings[SETTING_AI_BASE_URL] ?? "",
      hasKey: !!settings[SETTING_AI_API_KEY_ENC],
      // Whether the host can encrypt a BYO key at all (SETTINGS_ENC_KEY set).
      encryptionAvailable: isSecretsEncryptionAvailable(),
      // Whether a platform default exists, so the UI can say "using the free model".
      platformDefault: isAiConfigured(ai),
    });
  });

  app.post("/ai/settings", async (c) => {
    const body = await c.req.parseBody();
    const provider = String(body.provider ?? "").trim();
    const model = String(body.model ?? "").trim();
    const baseURL = String(body.baseURL ?? "").trim();
    const apiKey = String(body.apiKey ?? "").trim();
    const clear = body.clear != null;

    // Clearing reverts the tenant to the platform default.
    if (clear || (!provider && !model && !baseURL && !apiKey)) {
      await deleteSiteSetting(db, tenantId, SETTING_AI_PROVIDER);
      await deleteSiteSetting(db, tenantId, SETTING_AI_MODEL);
      await deleteSiteSetting(db, tenantId, SETTING_AI_BASE_URL);
      await deleteSiteSetting(db, tenantId, SETTING_AI_API_KEY_ENC);
      return c.json({ ok: true, cleared: true });
    }

    if (!AI_PROVIDERS.includes(provider as AiProvider)) {
      return c.json({ error: "Unknown provider" }, 400);
    }
    if (!model) {
      return c.json({ error: "A model is required" }, 400);
    }
    if (provider !== "local" && !apiKey) {
      // Allow keeping an already-stored key: only require one when none exists.
      const existing = await getSiteSettings(db, tenantId);
      if (!existing[SETTING_AI_API_KEY_ENC]) {
        return c.json({ error: "An API key is required for this provider" }, 400);
      }
    }

    await setSiteSetting(db, tenantId, SETTING_AI_PROVIDER, provider);
    await setSiteSetting(db, tenantId, SETTING_AI_MODEL, model);
    if (baseURL) {
      await setSiteSetting(db, tenantId, SETTING_AI_BASE_URL, baseURL);
    } else {
      await deleteSiteSetting(db, tenantId, SETTING_AI_BASE_URL);
    }
    if (apiKey) {
      if (!isSecretsEncryptionAvailable()) {
        return c.json({ error: "Secret encryption is not configured on this host" }, 503);
      }
      await setSiteSetting(db, tenantId, SETTING_AI_API_KEY_ENC, encryptSecret(apiKey));
    }
    return c.json({ ok: true });
  });

  /**
   * Draft a collection from a description.
   *
   * Generation only: nothing is stored. The client previews the draft and saves
   * it through the normal collection route, so an AI collection goes through
   * exactly the same door a hand-written one does.
   */
  app.post("/ai/collection", async (c) => {
    const effectiveAi = (await getTenantAiConfig(db, tenantId)) ?? ai;
    if (!isAiConfigured(effectiveAi)) {
      return c.json({ error: "AI is not configured" }, 503);
    }

    const body = await c.req.json<{ description?: string }>().catch(() => ({}) as { description?: string });
    const description = body.description?.trim();
    if (!description) {
      return c.json({ error: "Describe what you want to show first" }, 400);
    }

    try {
      const provider = createCollectionProvider(effectiveAi);
      const result = await generateCollection(provider, description);
      if (!result.ok) {
        return c.json({ error: result.error }, 400);
      }
      await recordThemeGeneration(tenantId);
      return c.json({ collection: result.collection });
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        return c.json({ error: err.message }, err.status ?? 502);
      }
      return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 502);
    }
  });

  return app;
}
