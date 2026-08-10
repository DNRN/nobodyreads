import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { randomUUID } from "node:crypto";
import { viewFormSchema } from "../../../db/validation.js";
import {
  deleteContentView,
  getContentViewById,
  upsertContentView,
  validateCustomQuery,
  executeCustomViewQuery,
  listPostsForView,
} from "../../../content/db.js";
import { renderPostListView } from "../../../content/templates.js";
import { createMediaStorage } from "../../../media/storage.js";
import {
  renderCollectionTemplate,
  validateCollectionTemplate,
} from "../../../content/collection-template.js";
import type { ContentView, ContentViewKind } from "../../../content/types.js";
import type { AdminModuleContext } from "./types.js";

/**
 * Collection mutation routes.
 *
 * The factory keeps its name deliberately: `content_view` is still the table and
 * `ContentView` still the type, so renaming a published export to follow a UI
 * label would break every consumer for no change in behaviour.
 */
export function createViewRoutes(ctx: AdminModuleContext): Hono {
  const { db, tenantId, adminBase, urlPrefix } = ctx;
  const app = new Hono();

  const validateForm = zValidator("form", viewFormSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", details: result.error.issues }, 400);
    }
  });

  app.post("/collections/save", validateForm, async (c) => {
    const data = c.req.valid("form");
    const isNew = !data.id || data.id.trim() === "";
    const viewId = isNew ? randomUUID() : data.id!.trim();
    const now = new Date().toISOString().slice(0, 10);

    const kind: ContentViewKind = data.kind;

    let config: ContentView["config"];
    if (kind === "custom") {
      // Reject at save time, not only at render time — a custom collection's
      // query runs server-side and its rows land on a public page.
      const queryError = validateCustomQuery(data.query ?? "");
      if (queryError) {
        return c.json({ error: "Validation failed", details: [{ message: queryError }] }, 400);
      }

      // Same reasoning for the other half: a template that does not parse
      // renders as an error box on a public page, so it is refused here rather
      // than discovered by a reader.
      const templateError = validateCollectionTemplate(data.template ?? "");
      if (templateError) {
        return c.json({ error: "Validation failed", details: [{ message: templateError }] }, 400);
      }

      config = {
        query: data.query ?? "",
        template: data.template ?? "",
      };
    } else {
      const parsedLimit = parseInt(data.limit ?? "", 10);
      const limit =
        Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.max(1, Math.min(200, parsedLimit))
          : undefined;
      config = { order: "newest" as const, limit };
    }

    const view: ContentView = {
      id: viewId,
      slug: data.slug,
      title: data.title,
      kind,
      config,
      published: data.published === "on",
      updated: isNew ? undefined : now,
    };

    await upsertContentView(db, view, tenantId);
    return c.redirect(`${adminBase}/collections/${viewId}`);
  });

  /**
   * Render a candidate collection without saving it.
   *
   * The create screen's live preview. Both halves go through the same checks a
   * save does — the preview must not be able to run something the saved
   * collection could not.
   */
  app.post("/collections/preview", async (c) => {
    const body = await c.req
      .json<{ kind?: string; query?: string; template?: string; limit?: number }>()
      .catch(() => ({}) as { kind?: string; query?: string; template?: string; limit?: number });

    // A built-in post list has no query to check — it is rendered by the same
    // code the published page uses.
    if (body.kind === "post_list") {
      const posts = await listPostsForView(db, tenantId, { limit: body.limit });
      const storage = createMediaStorage();
      const html = renderPostListView(posts, {
        urlPrefix,
        mediaUrl: (key) => storage.url(key),
      });
      return c.json({ html, rowCount: posts.length });
    }

    const query = body.query?.trim() ?? "";
    const template = body.template ?? "";

    const queryError = validateCustomQuery(query);
    if (queryError) return c.json({ error: queryError }, 400);

    const templateError = validateCollectionTemplate(template);
    if (templateError) return c.json({ error: templateError }, 400);

    try {
      const rows = await executeCustomViewQuery(db, query, tenantId);
      const html = renderCollectionTemplate(template, { rows, urlPrefix });
      return c.json({ html, rowCount: rows.length });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Preview failed" }, 400);
    }
  });

  app.post("/collections/duplicate/:id", async (c) => {
    const source = await getContentViewById(db, c.req.param("id"), tenantId);
    if (!source) return c.redirect(`${adminBase}/collections`);

    const id = randomUUID();
    // A copy starts as a draft: two collections cannot share a slug, and the
    // copy is not the one anybody's pages are embedding.
    await upsertContentView(
      db,
      {
        ...source,
        id,
        slug: `${source.slug}-copy`.slice(0, 60),
        title: `${source.title} (copy)`,
        published: false,
      },
      tenantId,
    );
    return c.redirect(`${adminBase}/collections/${id}`);
  });

  app.post("/collections/delete/:id", async (c) => {
    const viewId = c.req.param("id");
    await deleteContentView(db, viewId, tenantId);
    return c.redirect(`${adminBase}/collections`);
  });

  return app;
}
