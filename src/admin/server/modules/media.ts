import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  insertMedia,
  listMedia,
  getMediaById,
  deleteMediaRecord,
} from "../../../content/db.js";
import type { AdminModuleContext } from "./types.js";

export function createMediaRoutes(ctx: AdminModuleContext): Hono {
  const { db, storage, tenantId, adminBase } = ctx;
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
    const storageKey = `${mediaId}${ext}`;
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
        filename: file.name,
      });
    }
    return c.redirect(`${adminBase}/media`);
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
