import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { randomUUID } from "node:crypto";
import { pageFormSchema } from "../../../db/validation.js";
import { getPageById, findPageByKind, deletePage, upsertPage } from "../../../content/db.js";
import { renderContent } from "../../../content/render.js";
import type { Page, PageKind } from "../../../content/types.js";
import { notifySubscribers } from "../../../subscription/index.js";
import type { AdminModuleContext } from "./types.js";

export function createContentRoutes(ctx: AdminModuleContext): Hono {
  const { db, tenantId, urlPrefix, editorBase } = ctx;
  const app = new Hono();

  // Server-side render of unsaved markdown for the editor's live preview.
  // Mirrors the public page pipeline so {{view:slug}} content views and
  // [[id]] links render faithfully — including unpublished views — which the
  // client-side `marked` pass cannot resolve (no DB / no SQL / no JS template).
  app.post("/editor/preview", async (c) => {
    let content = "";
    try {
      const body = (await c.req.json()) as { content?: unknown };
      if (typeof body.content === "string") content = body.content;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    try {
      const html = await renderContent(db, content, tenantId, urlPrefix, {
        includeDrafts: true,
        showMissingPlaceholders: true,
      });
      return c.json({ html });
    } catch (err) {
      console.error("Editor preview render error:", err);
      return c.json({ error: "Failed to render preview" }, 500);
    }
  });

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

      // A site has exactly one home page.
      if (data.kind === "home") {
        const existingHome = await findPageByKind(db, "home", tenantId);
        if (existingHome && existingHome.id !== pageId) {
          return c.json(
            { error: "A home page already exists", id: existingHome.id },
            409
          );
        }
      }

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
        notifySubscribers(
          db,
          tenantId,
          {
            title: p.title,
            slug: p.slug,
            excerpt: p.excerpt,
          },
          { email: ctx.email, siteUrl: ctx.siteUrl, siteName: ctx.siteName }
        ).catch((err) => console.error("Subscriber notification error:", err));
      }

      // AJAX saves (editor autosave / save button) ask for JSON and stay on the
      // page; plain form posts (no-JS fallback) get the usual redirect.
      if (c.req.header("accept")?.includes("application/json")) {
        return c.json({ ok: true, id: pageId, published: p.published });
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
