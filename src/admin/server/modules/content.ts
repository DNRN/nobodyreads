import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { randomUUID } from "node:crypto";
import { pageFormSchema } from "../../../db/validation.js";
import { getPageById, deletePage, upsertPage } from "../../../content/db.js";
import type { Page, PageKind } from "../../../content/types.js";
import { notifySubscribers } from "../../../subscription/index.js";
import type { AdminModuleContext } from "./types.js";

export function createContentRoutes(ctx: AdminModuleContext): Hono {
  const { db, tenantId, editorBase } = ctx;
  const app = new Hono();

  app.post(
    "/editor/save",
    zValidator("form", pageFormSchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "Validation failed", details: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const data = c.req.valid("form");

      const isNew = !data.id || data.id.trim() === "";
      const pageId = isNew ? randomUUID() : data.id!.trim();
      const now = new Date().toISOString();

      let wasPreviouslyPublished = false;
      let content = data.content;
      if (!isNew) {
        const existing = await getPageById(db, pageId, tenantId);
        wasPreviouslyPublished = existing?.published ?? false;
        if (!content && existing?.content) content = existing.content;
      }

      const p: Page = {
        id: pageId,
        slug: data.slug,
        title: data.title,
        content,
        excerpt: data.excerpt,
        tags: data.tags
          .split(",")
          .map((t: string) => t.trim())
          .filter(Boolean),
        date: data.date || now.slice(0, 10),
        updated: isNew ? undefined : now.slice(0, 10),
        published: data.published === "on",
        kind: data.kind as PageKind,
        nav:
          data.nav_label && data.nav_label.trim()
            ? {
                label: data.nav_label.trim(),
                order: parseInt(data.nav_order || "0", 10),
              }
            : undefined,
      };

      await upsertPage(db, p, tenantId);

      if (p.kind === "post" && p.published && !wasPreviouslyPublished) {
        notifySubscribers(db, tenantId, {
          title: p.title,
          slug: p.slug,
          excerpt: p.excerpt,
        }).catch((err) => console.error("Subscriber notification error:", err));
      }

      return c.redirect(`${editorBase}/${pageId}`);
    }
  );

  app.post("/editor/delete/:id", async (c) => {
    const pageId = c.req.param("id");
    await deletePage(db, pageId, tenantId);
    return c.redirect(editorBase);
  });

  return app;
}
