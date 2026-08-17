import { Hono } from "hono";
import { getTenantAiConfig, isAiConfigured } from "../../../api/ai/config.js";
import {
  getTenantComfyConfig,
  isComfyConfigured,
  SETTING_COMFY_BASE_URL,
  SETTING_COMFY_API_KEY_ENC,
} from "../../../api/ai/comfy/config.js";
import { generateCoverPrompt } from "../../../api/ai/generate-cover-prompt.js";
import { generateCoverImage } from "../../../api/ai/generate-cover-image.js";
import { recordCoverImageGeneration } from "../../../api/ai/metering.js";
import { getPageById } from "../../../content/db.js";
import {
  getSiteSettings,
  setSiteSetting,
  deleteSiteSetting,
} from "../../../shared/site-settings.js";
import { encryptSecret, isSecretsEncryptionAvailable } from "../../../shared/secrets.js";
import type { AdminModuleContext } from "./types.js";

/**
 * AI cover-image routes (per-tenant). Two-step, credit-conscious flow: draft a
 * prompt with the (cheap) text AI provider first, let the author edit it, then
 * spend Comfy Cloud credits only on explicit "Generate". Generation persists
 * straight to the tenant's media library (like an upload) — the author picks
 * whether to use it as the post's cover image through the existing
 * `seo_og_image` field, no new save path involved.
 *
 * Routes (mounted under the tenant admin base):
 *   POST /ai/cover-image/draft-prompt { postId } -> { prompt }
 *   POST /ai/cover-image/generate { prompt, width?, height? } -> { mediaId, url }
 *   GET  /ai/cover-image/settings -> BYO Comfy key status
 *   POST /ai/cover-image/settings -> save/clear BYO Comfy key
 */
export function createCoverImageRoutes(ctx: AdminModuleContext): Hono {
  const { db, tenantId, ai, comfy, storage, keyPrefix } = ctx;
  const app = new Hono();

  app.post("/ai/cover-image/draft-prompt", async (c) => {
    const effectiveAi = (await getTenantAiConfig(db, tenantId)) ?? ai;
    if (!isAiConfigured(effectiveAi)) {
      return c.json({ error: "AI is not configured" }, 503);
    }

    const body = await c.req.json<{ postId?: string }>().catch(() => ({}) as { postId?: string });
    const postId = body.postId?.trim();
    if (!postId) {
      return c.json({ error: "postId is required" }, 400);
    }

    const post = await getPageById(db, postId, tenantId);
    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    try {
      const prompt = await generateCoverPrompt(effectiveAi, {
        title: post.title,
        excerpt: post.excerpt,
        body: post.content,
      });
      return c.json({ prompt });
    } catch (err) {
      console.error("Cover image prompt drafting failed:", err);
      return c.json({ error: "Failed to draft a prompt" }, 502);
    }
  });

  app.post("/ai/cover-image/generate", async (c) => {
    if (!storage) {
      return c.json({ error: "Media storage is not configured" }, 503);
    }
    const effectiveComfy = (await getTenantComfyConfig(db, tenantId)) ?? comfy;
    if (!isComfyConfigured(effectiveComfy)) {
      return c.json({ error: "Image generation is not configured" }, 503);
    }

    const body = await c
      .req.json<{ prompt?: string; width?: number; height?: number }>()
      .catch(() => ({}) as { prompt?: string; width?: number; height?: number });
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return c.json({ error: "A prompt is required" }, 400);
    }

    try {
      const result = await generateCoverImage({
        db,
        storage,
        tenantId,
        comfy: effectiveComfy,
        keyPrefix,
        prompt,
        width: body.width,
        height: body.height,
      });
      await recordCoverImageGeneration(tenantId);
      return c.json(result);
    } catch (err) {
      console.error("Cover image generation failed:", err);
      return c.json(
        { error: err instanceof Error ? err.message : "Image generation failed" },
        502,
      );
    }
  });

  // --- BYO Comfy Cloud key (per-tenant, stored in site_settings) ---
  // Same encrypted-at-rest shape as the AI theming settings in `ai.ts`.

  app.get("/ai/cover-image/settings", async (c) => {
    const settings = await getSiteSettings(db, tenantId);
    return c.json({
      baseUrl: settings[SETTING_COMFY_BASE_URL] ?? "",
      hasKey: !!settings[SETTING_COMFY_API_KEY_ENC],
      encryptionAvailable: isSecretsEncryptionAvailable(),
      platformDefault: isComfyConfigured(comfy),
    });
  });

  app.post("/ai/cover-image/settings", async (c) => {
    const body = await c.req.parseBody();
    const baseUrl = String(body.baseUrl ?? "").trim();
    const apiKey = String(body.apiKey ?? "").trim();
    const clear = body.clear != null;

    if (clear || (!baseUrl && !apiKey)) {
      await deleteSiteSetting(db, tenantId, SETTING_COMFY_BASE_URL);
      await deleteSiteSetting(db, tenantId, SETTING_COMFY_API_KEY_ENC);
      return c.json({ ok: true, cleared: true });
    }

    if (apiKey) {
      if (!isSecretsEncryptionAvailable()) {
        return c.json({ error: "Secret encryption is not configured on this host" }, 503);
      }
      await setSiteSetting(db, tenantId, SETTING_COMFY_API_KEY_ENC, encryptSecret(apiKey));
    }
    if (baseUrl) {
      await setSiteSetting(db, tenantId, SETTING_COMFY_BASE_URL, baseUrl);
    } else {
      await deleteSiteSetting(db, tenantId, SETTING_COMFY_BASE_URL);
    }
    return c.json({ ok: true });
  });

  return app;
}
