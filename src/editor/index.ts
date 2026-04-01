import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import type { Database } from "../db/index.js";
import {
  pageFormSchema,
  viewFormSchema,
  siteTemplateFormSchema,
  loginFormSchema,
} from "../db/validation.js";
import {
  getPageById,
  deletePage,
  upsertPage,
  deleteContentView,
  upsertContentView,
  insertMedia,
  listMedia,
  getMediaById,
  deleteMediaRecord,
} from "../content/db.js";
import type { Page, PageKind, ContentView, ContentViewKind } from "../content/types.js";
import type { MediaStorage } from "../media/storage.js";
import {
  verifyEditorPassword,
  buildSessionCookie,
  buildClearSessionCookies,
} from "./auth.js";
import {
  getSiteTemplate,
  addSiteTemplateRevision,
  deleteSiteTemplateRevision,
  setCurrentSiteTemplateRevision,
} from "../shared/site-bundle.js";
import { getSiteSettings, setSiteSetting, deleteSiteSetting } from "../shared/site-settings.js";
import { validateTheme, themeHasScripts } from "../template/theme-io.js";
import { DEFAULT_TEMPLATE } from "../template/defaults.js";
import { notifySubscribers } from "../subscription/index.js";

export interface EditorRouterOptions {
  db: Database;
  storage?: MediaStorage;
  tenantId?: string;
  urlPrefix?: string;
}

/**
 * Editor / admin routes. Mount at /admin.
 *
 * Auth middleware should be applied by the caller (standalone.ts) so that
 * login and logout bypass it.
 */
export function createEditorRoutes(options: EditorRouterOptions): Hono {
  const { db, storage } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const urlPrefix = options.urlPrefix ?? "";
  const adminBase = `${urlPrefix}/admin`;
  const editorBase = `${adminBase}/editor`;

  const app = new Hono();

  // --- Login ---
  app.post(
    "/login",
    zValidator("form", loginFormSchema, (result, c) => {
      if (!result.success) {
        return c.redirect(`${adminBase}/login?error=1`);
      }
    }),
    async (c) => {
      const { password } = c.req.valid("form");

      if (!verifyEditorPassword(password)) {
        return c.redirect(`${adminBase}/login?error=1`);
      }

      c.header("Set-Cookie", buildSessionCookie(urlPrefix || "/"));
      return c.redirect(adminBase);
    }
  );

  // --- Logout ---
  app.get("/logout", (c) => clearSessionAndRedirect(c, adminBase));
  app.post("/logout", (c) => clearSessionAndRedirect(c, adminBase));

  // --- Media: list (JSON for the editor media picker) ---
  if (storage) {
    app.get("/media/list", async (c) => {
      const items = await listMedia(db, tenantId, (key) => storage.url(key));
      return c.json(items);
    });
  }

  // --- Site / Layout: save template ---
  const saveSiteTemplate = async (c: Context) => {
    const body = await c.req.parseBody();
    const parsed = siteTemplateFormSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
    }

    let template: unknown;
    try {
      template = JSON.parse(parsed.data.template);
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    await addSiteTemplateRevision(db, template as import("../template/types.js").SiteTemplateDefinition, tenantId);
    return c.redirect(`${adminBase}/layout`);
  };
  app.post("/site/save", saveSiteTemplate);
  app.post("/layout/save", saveSiteTemplate);

  // --- Revision: publish ---
  const publishRevision = async (c: Context) => {
    const revisionId = parseInt(c.req.param("id") ?? "0", 10);
    await setCurrentSiteTemplateRevision(db, revisionId, tenantId);
    return c.redirect(`${adminBase}/layout`);
  };
  app.post("/site/revision/use/:id", publishRevision);
  app.post("/layout/revision/use/:id", publishRevision);
  app.post("/layout/revision/publish/:id", publishRevision);

  // --- Revision: delete ---
  const deleteRevision = async (c: Context) => {
    const revisionId = parseInt(c.req.param("id") ?? "0", 10);
    await deleteSiteTemplateRevision(db, revisionId, tenantId);
    return c.redirect(`${adminBase}/layout`);
  };
  app.post("/site/revision/delete/:id", deleteRevision);
  app.post("/layout/revision/delete/:id", deleteRevision);

  // --- Page: save (create or update) ---
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

  // --- Content views: save ---
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

  // --- Page: delete ---
  app.post("/editor/delete/:id", async (c) => {
    const pageId = c.req.param("id");
    await deletePage(db, pageId, tenantId);
    return c.redirect(editorBase);
  });

  // --- Content views: delete ---
  app.post("/views/delete/:id", async (c) => {
    const viewId = c.req.param("id");
    await deleteContentView(db, viewId, tenantId);
    return c.redirect(`${adminBase}/views`);
  });

  // --- Media: upload ---
  if (storage) {
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

    // --- Media: delete ---
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
  }

  // --- Theme: export ---
  app.get("/theme/export", async (c) => {
    const template = (await getSiteTemplate(db, tenantId)) ?? DEFAULT_TEMPLATE;
    const filename = template.themeMeta?.name
      ? `${template.themeMeta.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`
      : "theme.json";
    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.body(JSON.stringify(template, null, 2));
  });

  // --- Theme: import ---
  app.post("/theme/import", async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;

    let raw: string;
    if (file instanceof File) {
      raw = await file.text();
    } else if (typeof body.theme === "string") {
      raw = body.theme;
    } else {
      return c.json({ error: "No theme data provided" }, 400);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const result = validateTheme(parsed);
    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }

    const revisionId = await addSiteTemplateRevision(db, result.theme, tenantId);
    const hasScripts = themeHasScripts(result.theme);

    const accept = c.req.header("accept") || "";
    if (accept.includes("application/json")) {
      return c.json({ revisionId, hasScripts });
    }
    return c.redirect(`${adminBase}/layout`);
  });

  // --- Custom token settings: save values ---
  app.post("/settings/tokens", async (c) => {
    const body = await c.req.parseBody();

    for (const [key, value] of Object.entries(body)) {
      if (!key.startsWith("token:") || typeof value !== "string") continue;
      const tokenKey = key.slice("token:".length);
      const settingKey = `custom_token:${tokenKey}`;

      if (value.trim() === "") {
        await deleteSiteSetting(db, tenantId, settingKey);
      } else {
        await setSiteSetting(db, tenantId, settingKey, value);
      }
    }

    const accept = c.req.header("accept") || "";
    if (accept.includes("application/json")) {
      return c.json({ ok: true });
    }
    return c.redirect(`${adminBase}/layout`);
  });

  // --- Custom token settings: get values (JSON) ---
  app.get("/settings/tokens", async (c) => {
    const settings = await getSiteSettings(db, tenantId);
    const tokens: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      if (key.startsWith("custom_token:")) {
        tokens[key.slice("custom_token:".length)] = value;
      }
    }
    return c.json(tokens);
  });

  return app;
}

function clearSessionAndRedirect(c: Context, adminBase: string): Response {
  for (const cookie of buildClearSessionCookies(adminBase)) {
    c.header("Set-Cookie", cookie, { append: true });
  }
  return c.redirect(adminBase);
}
