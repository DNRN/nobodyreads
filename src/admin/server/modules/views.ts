import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { randomUUID } from "node:crypto";
import { viewFormSchema } from "../../../db/validation.js";
import { deleteContentView, upsertContentView } from "../../../content/db.js";
import type { ContentView, ContentViewKind } from "../../../content/types.js";
import type { AdminModuleContext } from "./types.js";

export function createViewRoutes(ctx: AdminModuleContext): Hono {
  const { db, tenantId, adminBase } = ctx;
  const app = new Hono();

  app.post(
    "/views/save",
    zValidator("form", viewFormSchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "Validation failed", details: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const data = c.req.valid("form");
      const isNew = !data.id || data.id.trim() === "";
      const viewId = isNew ? randomUUID() : data.id!.trim();
      const now = new Date().toISOString().slice(0, 10);

      const kind: ContentViewKind = data.kind;

      let config: ContentView["config"];
      if (kind === "custom") {
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
      return c.redirect(`${adminBase}/views/${viewId}`);
    }
  );

  app.post("/views/delete/:id", async (c) => {
    const viewId = c.req.param("id");
    await deleteContentView(db, viewId, tenantId);
    return c.redirect(`${adminBase}/views`);
  });

  return app;
}
