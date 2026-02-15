import type { IncomingMessage, ServerResponse } from "node:http";
import type { Client } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { transform } from "esbuild";
import { extname } from "node:path";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import { redirect, parseFormBody, parseMultipartBody, json } from "../shared/http.js";
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
  isAuthenticated,
  editorRequiresAuth,
  verifyEditorPassword,
  createEditorSession,
  clearEditorSession,
} from "./auth.js";
import {
  addSiteBundleRevision,
  deleteSiteBundleRevision,
  setCurrentSiteBundleRevision,
} from "../shared/site-bundle.js";
import { notifySubscribers } from "../subscription/index.js";

// --- Public API ---

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
) => Promise<void>;

export interface EditorRouterOptions {
  /** Database client. */
  db: Client;
  /** Media storage backend (local filesystem, GCS, etc.). */
  storage?: MediaStorage;
  /** Tenant ID to scope all queries to. Defaults to "_default". */
  tenantId?: string;
  /** URL prefix for all links, e.g. "/dennis". Defaults to "". */
  urlPrefix?: string;
  /**
   * If true, skip the built-in password auth (the caller is responsible
   * for verifying the user before delegating to the editor).
   */
  skipAuth?: boolean;
}

/**
 * Create the editor request handler.
 * Admin overview lives at /admin, editor lives at /admin/editor (relative to urlPrefix).
 *
 * Usage (single-user mode):
 *   createEditorRouter({ db })
 *   // editor at /admin, EDITOR_PASSWORD gate
 *
 * Usage (platform mode — tenant-scoped):
 *   createEditorRouter({ db, tenantId: tenant.id, urlPrefix: "/dennis", skipAuth: true })
 *   // editor at /dennis/admin, platform session auth handled by caller
 */
export function createEditorRouter(options: EditorRouterOptions): RequestHandler {
  const { db, storage, skipAuth = false } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const urlPrefix = options.urlPrefix ?? "";
  const adminBase = `${urlPrefix}/admin`;
  const editorBase = `${adminBase}/editor`;

  return async (req, res, pathname) => {
    // --- Logout (allow even if not authenticated) ---
    if (pathname === "/admin/logout" && (req.method === "POST" || req.method === "GET")) {
      clearEditorSession(res, adminBase);
      return redirect(res, adminBase);
    }

    // --- Login routes (only when using built-in auth) ---

    if (!skipAuth) {
      if (pathname === "/admin/login" && req.method === "GET") {
        return redirect(res, `${adminBase}/login`);
      }

      if (pathname === "/admin/login" && req.method === "POST") {
        const body = await parseFormBody(req);
        const password = body.password || "";

        if (!verifyEditorPassword(password)) {
          return redirect(res, `${adminBase}/login?error=1`);
        }

        createEditorSession(res, urlPrefix || "/");
        return redirect(res, adminBase);
      }

      // --- Auth guard for all other /admin routes ---

      if (!isAuthenticated(req)) {
        if (editorRequiresAuth()) {
          return redirect(res, `${adminBase}/login`);
        }
      }
    }

    // --- Media: list (JSON API for the media picker) ---
    if (pathname === "/admin/media/list" && req.method === "GET" && storage) {
      const items = await listMedia(db, tenantId, (key) => storage.url(key));
      return json(res, items);
    }

    // --- GET admin routes are rendered by Astro ---
    if (req.method === "GET" && pathname.startsWith("/admin")) {
      return redirect(res, pathname);
    }

    if (
      (pathname === "/admin/site/save" || pathname === "/admin/layout/save") &&
      req.method === "POST"
    ) {
      const body = await parseFormBody(req);
      const tsSource = body.ts || "";

      // Transpile TypeScript → JavaScript using esbuild
      let compiledJs = "";
      if (tsSource.trim()) {
        try {
          const result = await transform(tsSource, {
            loader: "ts",
            target: "es2020",
            format: "esm",
          });
          compiledJs = result.code;
        } catch (err: unknown) {
          // Return the error to the client so the user can fix it
          const message =
            err instanceof Error ? err.message : "TypeScript compilation failed";
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
          return;
        }
      }

      await addSiteBundleRevision(
        db,
        {
          html: body.html || "",
          css: body.css || "",
          js: compiledJs,
          ts: tsSource,
        },
        tenantId
      );
      return redirect(res, `${adminBase}/layout`);
    }

    const useRevisionMatch =
      pathname.match(/^\/admin\/site\/revision\/use\/(\d+)$/) ||
      pathname.match(/^\/admin\/layout\/revision\/use\/(\d+)$/);
    if (useRevisionMatch && req.method === "POST") {
      const revisionId = parseInt(useRevisionMatch[1], 10);
      await setCurrentSiteBundleRevision(db, revisionId, tenantId);
      return redirect(res, `${adminBase}/layout`);
    }

    const deleteRevisionMatch =
      pathname.match(/^\/admin\/site\/revision\/delete\/(\d+)$/) ||
      pathname.match(/^\/admin\/layout\/revision\/delete\/(\d+)$/);
    if (deleteRevisionMatch && req.method === "POST") {
      const revisionId = parseInt(deleteRevisionMatch[1], 10);
      await deleteSiteBundleRevision(db, revisionId, tenantId);
      return redirect(res, `${adminBase}/layout`);
    }

    // --- Save (create or update) ---

    if (pathname === "/admin/editor/save" && req.method === "POST") {
      const body = await parseFormBody(req);

      const isNew = !body.id || body.id.trim() === "";
      const pageId = isNew ? randomUUID() : body.id.trim();
      const now = new Date().toISOString();

      // Check if this is a draft→published transition (for subscriber notifications)
      let wasPreviouslyPublished = false;
      let content = body.content ?? "";
      if (!isNew) {
        const existing = await getPageById(db, pageId, tenantId);
        wasPreviouslyPublished = existing?.published ?? false;
        // When updating: preserve existing content if request has no content (missing or empty),
        // so we never overwrite with empty due to truncation or client bugs.
        if (!content && existing?.content) content = existing.content;
      }

      const page: Page = {
        id: pageId,
        slug: (body.slug || "").trim().toLowerCase(),
        title: (body.title || "").trim(),
        content,
        excerpt: (body.excerpt || "").trim(),
        tags: (body.tags || "")
          .split(",")
          .map((t: string) => t.trim())
          .filter(Boolean),
        date: body.date || now.slice(0, 10),
        updated: isNew ? undefined : now.slice(0, 10),
        published: body.published === "on",
        kind: (body.kind || "post") as PageKind,
        nav:
          body.nav_label && body.nav_label.trim()
            ? { label: body.nav_label.trim(), order: parseInt(body.nav_order || "0", 10) }
            : undefined,
      };

      await upsertPage(db, page, tenantId);

      // Notify subscribers when a post is newly published (draft → published)
      if (page.kind === "post" && page.published && !wasPreviouslyPublished) {
        notifySubscribers(db, tenantId, {
          title: page.title,
          slug: page.slug,
          excerpt: page.excerpt,
        }).catch((err) => console.error("Subscriber notification error:", err));
      }

      return redirect(res, `${editorBase}/${pageId}`);
    }

    // --- Content views: save (create or update) ---

    if (pathname === "/admin/views/save" && req.method === "POST") {
      const body = await parseFormBody(req);
      const isNew = !body.id || body.id.trim() === "";
      const viewId = isNew ? randomUUID() : body.id.trim();
      const now = new Date().toISOString().slice(0, 10);

      const kind: ContentViewKind =
        body.kind === "custom" ? "custom" : "post_list";

      let config: ContentView["config"];
      if (kind === "custom") {
        config = {
          query: body.query || "",
          template: body.template || "",
        };
      } else {
        const parsedLimit = parseInt(body.limit || "", 10);
        const limit =
          Number.isFinite(parsedLimit) && parsedLimit > 0
            ? Math.max(1, Math.min(200, parsedLimit))
            : undefined;
        config = { order: "newest" as const, limit };
      }

      const view: ContentView = {
        id: viewId,
        slug: (body.slug || "").trim().toLowerCase(),
        title: (body.title || "").trim(),
        kind,
        config,
        published: body.published === "on",
        updated: isNew ? undefined : now,
      };

      await upsertContentView(db, view, tenantId);
      return redirect(res, `${adminBase}/views/${viewId}`);
    }

    // --- Delete ---

    const deleteMatch = pathname.match(/^\/admin\/editor\/delete\/([a-zA-Z0-9_-]+)$/);
    if (deleteMatch && req.method === "POST") {
      const pageId = deleteMatch[1];
      await deletePage(db, pageId, tenantId);
      return redirect(res, editorBase);
    }

    // --- Content views: delete ---

    const deleteViewMatch = pathname.match(/^\/admin\/views\/delete\/([a-zA-Z0-9_-]+)$/);
    if (deleteViewMatch && req.method === "POST") {
      const viewId = deleteViewMatch[1];
      await deleteContentView(db, viewId, tenantId);
      return redirect(res, `${adminBase}/views`);
    }

    // --- Media: upload ---

    if (pathname === "/admin/media/upload" && req.method === "POST" && storage) {
      const { files } = await parseMultipartBody(req);
      const file = files[0];
      if (!file) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No file uploaded" }));
        return;
      }

      const mediaId = randomUUID();
      const ext = extname(file.filename).toLowerCase() || "";
      const storageKey = `${mediaId}${ext}`;

      const stored = await storage.put(storageKey, file.data, file.mimeType);

      await insertMedia(
        db,
        {
          id: mediaId,
          storageKey,
          originalName: file.filename,
          mimeType: file.mimeType,
          size: file.data.length,
        },
        tenantId
      );

      // If the request accepts JSON (editor AJAX), return JSON; otherwise redirect
      const accept = req.headers.accept || "";
      if (accept.includes("application/json")) {
        return json(res, { id: mediaId, url: stored.url, filename: file.filename });
      }
      return redirect(res, `${adminBase}/media`);
    }

    // --- Media: delete ---

    const deleteMediaMatch = pathname.match(/^\/admin\/media\/delete\/([a-zA-Z0-9_-]+)$/);
    if (deleteMediaMatch && req.method === "POST" && storage) {
      const mediaId = deleteMediaMatch[1];
      const media = await getMediaById(db, mediaId, tenantId, (k) =>
        storage.url(k)
      );
      if (media) {
        await storage.delete(media.storageKey);
        await deleteMediaRecord(db, mediaId, tenantId);
      }
      return redirect(res, `${adminBase}/media`);
    }

    // --- 404 fallback ---
    return redirect(res, adminBase);
  };
}
