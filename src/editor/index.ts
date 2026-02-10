import type { IncomingMessage, ServerResponse } from "node:http";
import type { Client } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import { html, redirect, parseFormBody } from "../shared/http.js";
import {
  listAllPages,
  getPageById,
  deletePage,
  upsertPage,
} from "../content/db.js";
import type { Page, PageKind } from "../content/types.js";
import {
  isAuthenticated,
  editorRequiresAuth,
  verifyEditorPassword,
  createEditorSession,
  clearEditorSession,
} from "./auth.js";
import {
  adminOverviewPage,
  editorLoginPage,
  editorListPage,
  editorPage,
  siteEditorPage,
} from "./templates.js";
import {
  addSiteBundleRevision,
  deleteSiteBundleRevision,
  getCurrentSiteBundleRevisionId,
  getSiteBundle,
  listSiteBundleRevisions,
  setCurrentSiteBundleRevision,
} from "../shared/site-bundle.js";
import { DEFAULT_SITE_CSS } from "../shared/site-style.js";

// --- Public API ---

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
) => Promise<void>;

export interface EditorRouterOptions {
  /** Database client. */
  db: Client;
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
  const { db, skipAuth = false } = options;
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
        if (!editorRequiresAuth()) return redirect(res, adminBase);
        return html(res, editorLoginPage(undefined, urlPrefix));
      }

      if (pathname === "/admin/login" && req.method === "POST") {
        const body = await parseFormBody(req);
        const password = body.password || "";

        if (!verifyEditorPassword(password)) {
          return html(res, editorLoginPage("Incorrect password.", urlPrefix));
        }

        createEditorSession(res, adminBase);
        return redirect(res, adminBase);
      }

      // --- Auth guard for all other /admin routes ---

      if (!isAuthenticated(req)) {
        if (editorRequiresAuth()) {
          return redirect(res, `${adminBase}/login`);
        }
      }
    }

    // --- Page listing ---

    if (pathname === "/admin" && req.method === "GET") {
      return html(res, adminOverviewPage(urlPrefix));
    }

    if (pathname === "/admin/site" && req.method === "GET") {
      const bundle = await getSiteBundle(db, tenantId);
      const revisions = await listSiteBundleRevisions(db, tenantId);
      const currentRevisionId = await getCurrentSiteBundleRevisionId(db, tenantId);
      return html(res, siteEditorPage(bundle, revisions, currentRevisionId, urlPrefix));
    }

    if (pathname === "/admin/site/save" && req.method === "POST") {
      const body = await parseFormBody(req);
      await addSiteBundleRevision(
        db,
        {
          html: body.html || "",
          css: body.css || "",
          js: body.js || "",
        },
        tenantId
      );
      return redirect(res, `${adminBase}/site`);
    }

    if (pathname === "/admin/site/use-minimal" && req.method === "POST") {
      const bundle = await getSiteBundle(db, tenantId);
      await addSiteBundleRevision(
        db,
        {
          html: bundle?.html ?? "",
          css: DEFAULT_SITE_CSS,
          js: bundle?.js ?? "",
        },
        tenantId
      );
      return redirect(res, `${adminBase}/site`);
    }

    const useRevisionMatch = pathname.match(/^\/admin\/site\/revision\/use\/(\d+)$/);
    if (useRevisionMatch && req.method === "POST") {
      const revisionId = parseInt(useRevisionMatch[1], 10);
      await setCurrentSiteBundleRevision(db, revisionId, tenantId);
      return redirect(res, `${adminBase}/site`);
    }

    const deleteRevisionMatch = pathname.match(/^\/admin\/site\/revision\/delete\/(\d+)$/);
    if (deleteRevisionMatch && req.method === "POST") {
      const revisionId = parseInt(deleteRevisionMatch[1], 10);
      await deleteSiteBundleRevision(db, revisionId, tenantId);
      return redirect(res, `${adminBase}/site`);
    }

    if (pathname === "/admin/editor" && req.method === "GET") {
      const pages = await listAllPages(db, tenantId);
      return html(res, editorListPage(pages, urlPrefix));
    }

    // --- New page form ---

    if (pathname === "/admin/editor/new" && req.method === "GET") {
      return html(res, editorPage(undefined, urlPrefix));
    }

    // --- Edit page form ---

    const editMatch = pathname.match(/^\/admin\/editor\/([a-zA-Z0-9_-]+)$/);
    if (editMatch && req.method === "GET") {
      const pageId = editMatch[1];
      // Don't match reserved sub-routes
      if (pageId === "new" || pageId === "save" || pageId === "login" || pageId === "delete") {
        // fall through
      } else {
        const page = await getPageById(db, pageId, tenantId);
        if (!page) {
          return redirect(res, editorBase);
        }
        return html(res, editorPage(page, urlPrefix));
      }
    }

    // --- Save (create or update) ---

    if (pathname === "/admin/editor/save" && req.method === "POST") {
      const body = await parseFormBody(req);

      const isNew = !body.id || body.id.trim() === "";
      const pageId = isNew ? randomUUID() : body.id.trim();
      const now = new Date().toISOString();

      // When updating: preserve existing content if request has no content (missing or empty),
      // so we never overwrite with empty due to truncation or client bugs.
      let content = body.content ?? "";
      if (!isNew && !content) {
        const existing = await getPageById(db, pageId, tenantId);
        if (existing?.content) content = existing.content;
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
      return redirect(res, `${editorBase}/${pageId}`);
    }

    // --- Delete ---

    const deleteMatch = pathname.match(/^\/admin\/editor\/delete\/([a-zA-Z0-9_-]+)$/);
    if (deleteMatch && req.method === "POST") {
      const pageId = deleteMatch[1];
      await deletePage(db, pageId, tenantId);
      return redirect(res, editorBase);
    }

    // --- 404 fallback ---
    return redirect(res, adminBase);
  };
}
