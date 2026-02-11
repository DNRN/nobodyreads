import type { IncomingMessage, ServerResponse } from "node:http";
import type { Client } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import { redirect, parseFormBody } from "../shared/http.js";
import {
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
  addSiteBundleRevision,
  deleteSiteBundleRevision,
  setCurrentSiteBundleRevision,
} from "../shared/site-bundle.js";

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
        return redirect(res, `${adminBase}/login`);
      }

      if (pathname === "/admin/login" && req.method === "POST") {
        const body = await parseFormBody(req);
        const password = body.password || "";

        if (!verifyEditorPassword(password)) {
          return redirect(res, `${adminBase}/login?error=1`);
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

    // --- GET admin routes are rendered by Astro ---
    if (req.method === "GET" && pathname.startsWith("/admin")) {
      return redirect(res, pathname);
    }

    if (
      (pathname === "/admin/site/save" || pathname === "/admin/layout/save") &&
      req.method === "POST"
    ) {
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
