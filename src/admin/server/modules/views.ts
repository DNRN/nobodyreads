import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { randomUUID } from "node:crypto";
import { viewFormSchema } from "../../../db/validation.js";
import {
  deleteContentView,
  upsertContentView,
  validateCustomQuery,
} from "../../../content/db.js";
import type { ContentView, ContentViewKind } from "../../../content/types.js";
import type { AdminModuleContext } from "./types.js";

/**
 * URL prefixes these routes answer on, current spelling first.
 *
 * `/views/*` was the path before the rename to Collections. It stays mounted
 * because a self-hosting operator may have it in a bookmark, a reverse-proxy
 * rule or a script; redirects always land on the `/collections` URL.
 */
const PREFIXES = ["/collections", "/views"] as const;

/**
 * Collection mutation routes.
 *
 * The factory keeps its name deliberately: `content_view` is still the table and
 * `ContentView` still the type, so renaming a published export to follow a UI
 * label would break every consumer for no change in behaviour.
 */
export function createViewRoutes(ctx: AdminModuleContext): Hono {
  const { db, tenantId, adminBase } = ctx;
  const app = new Hono();

  const validateForm = zValidator("form", viewFormSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", details: result.error.issues }, 400);
    }
  });

  for (const prefix of PREFIXES) {
    app.post(`${prefix}/save`, validateForm, async (c) => {
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

    app.post(`${prefix}/delete/:id`, async (c) => {
      const viewId = c.req.param("id");
      await deleteContentView(db, viewId, tenantId);
      return c.redirect(`${adminBase}/collections`);
    });
  }

  return app;
}
