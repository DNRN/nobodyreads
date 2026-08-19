import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  insertMedia,
  listMedia,
  getMediaById,
  deleteMediaRecord,
} from "../../../content/db.js";
import { resolveEffectiveComfyConfig, isComfyConfigured } from "../../../api/ai/comfy/config.js";
import { generateImage } from "../../../api/ai/generate-image.js";
import { recordImageGeneration } from "../../../api/ai/metering.js";
import type { AdminModuleContext } from "./types.js";

export function createMediaRoutes(ctx: AdminModuleContext): Hono {
  const { db, storage, tenantId, adminBase, comfy } = ctx;
  const keyPrefix = ctx.keyPrefix ?? "";
  const app = new Hono();

  if (!storage) return app;

  app.get("/media/list", async (c) => {
    const items = await listMedia(db, tenantId, (key) => storage.url(key));
    return c.json(items);
  });

  app.post("/media/upload", async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    const mediaId = randomUUID();
    const ext = extname(file.name).toLowerCase() || "";
    const storageKey = `${keyPrefix}${mediaId}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const stored = await storage.put(storageKey, buffer, file.type);

    await insertMedia(
      db,
      {
        id: mediaId,
        storageKey,
        originalName: file.name,
        mimeType: file.type,
        size: buffer.length,
      },
      tenantId
    );

    const accept = c.req.header("accept") || "";
    if (accept.includes("application/json")) {
      return c.json({
        id: mediaId,
        url: stored.url,
        storageKey: stored.key,
        filename: file.name,
      });
    }
    return c.redirect(`${adminBase}/media`);
  });

  // Generate an image with AI straight into the library — same generator the
  // post editor's cover-image panel uses (`generate-cover-image.ts`), minus
  // the "cover" filename framing.
  app.post("/media/generate", async (c) => {
    const effectiveComfy = await resolveEffectiveComfyConfig(db, tenantId, comfy);
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
      const result = await generateImage({
        db,
        storage,
        tenantId,
        comfy: effectiveComfy,
        keyPrefix,
        prompt,
        width: body.width,
        height: body.height,
      });
      await recordImageGeneration(tenantId);
      return c.json(result);
    } catch (err) {
      console.error("Media image generation failed:", err);
      return c.json(
        { error: err instanceof Error ? err.message : "Image generation failed" },
        502,
      );
    }
  });

  app.post("/media/delete/:id", async (c) => {
    const mediaId = c.req.param("id");
    const m = await getMediaById(db, mediaId, tenantId, (k) =>
      storage.url(k)
    );
    if (m) {
      await storage.delete(m.storageKey);
      await deleteMediaRecord(db, mediaId, tenantId);
    }
    return c.redirect(`${adminBase}/media`);
  });

  return app;
}
