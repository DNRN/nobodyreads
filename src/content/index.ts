import type { IncomingMessage, ServerResponse } from "node:http";
import type { Client } from "@libsql/client";
import type { LayoutFn } from "./types.js";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import { html, json } from "../shared/http.js";
import {
  listPosts,
  getPageBySlug,
  getPageByKind,
  getNavItems,
} from "./db.js";
import { resolveLinks, renderMarkdown } from "./render.js";
import {
  defaultLayout,
  homePage,
  postPage,
  contentPage,
  notFoundPage,
} from "./templates.js";

// --- Public API ---

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
) => Promise<void>;

export interface BlogRouterOptions {
  /** Database client (shared with platform). */
  db: Client;
  /** Tenant ID to scope all queries to. Defaults to "_default". */
  tenantId?: string;
  /** URL prefix for all links, e.g. "/dennis". Defaults to "". */
  urlPrefix?: string;
  /** Custom layout function. Defaults to the blog's built-in layout. */
  layout?: LayoutFn;
}

/** Resolve [[id]] links in markdown and render to HTML. */
async function renderPageContent(
  db: Client,
  markdown: string,
  tenantId: string,
  urlPrefix: string
): Promise<string> {
  const resolved = await resolveLinks(db, markdown, tenantId, urlPrefix);
  return renderMarkdown(resolved);
}

/**
 * Create a blog request handler scoped to a specific tenant.
 *
 * Usage (standalone):
 *   const blog = createBlogRouter({ db });
 *   // handles /, /posts/:slug, /:slug, /api/posts
 *
 * Usage (platform — tenant blog):
 *   const blog = createBlogRouter({ db, tenantId: tenant.id, urlPrefix: "/dennis" });
 *
 * Usage (platform — with custom layout):
 *   const blog = createBlogRouter({ db, tenantId, layout: myPlatformLayout });
 */
export function createBlogRouter(options: BlogRouterOptions): RequestHandler {
  const { db, urlPrefix = "" } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const layout = options.layout ?? defaultLayout;

  return async (req, res, pathname) => {
    // --- Home page ---
    if (pathname === "/" && req.method === "GET") {
      const [page, posts, navItems] = await Promise.all([
        getPageByKind(db, "home", tenantId),
        listPosts(db, tenantId),
        getNavItems(db, tenantId),
      ]);

      if (!page) {
        return html(res, notFoundPage(layout, navItems, urlPrefix), 404);
      }

      const htmlBody = page.content.trim()
        ? await renderPageContent(db, page.content, tenantId, urlPrefix)
        : undefined;

      return html(res, homePage(layout, page, posts, navItems, htmlBody, urlPrefix), 200, {
        noAiTraining: page.seo?.noAiTraining,
      });
    }

    // --- Blog post: /posts/:slug ---
    const postMatch = pathname.match(/^\/posts\/([a-z0-9-]+)$/);
    if (postMatch && req.method === "GET") {
      const [page, navItems] = await Promise.all([
        getPageBySlug(db, postMatch[1], "post", tenantId),
        getNavItems(db, tenantId),
      ]);
      if (!page) return html(res, notFoundPage(layout, navItems, urlPrefix), 404);

      const htmlBody = await renderPageContent(db, page.content, tenantId, urlPrefix);
      return html(res, postPage(layout, page, htmlBody, navItems, urlPrefix), 200, {
        noAiTraining: page.seo?.noAiTraining,
      });
    }

    // --- Static page: /:slug (about, uses, etc.) ---
    const pageMatch = pathname.match(/^\/([a-z0-9-]+)$/);
    if (pageMatch && req.method === "GET") {
      const [page, navItems] = await Promise.all([
        getPageBySlug(db, pageMatch[1], "page", tenantId),
        getNavItems(db, tenantId),
      ]);

      if (page) {
        const htmlBody = await renderPageContent(db, page.content, tenantId, urlPrefix);
        return html(res, contentPage(layout, page, htmlBody, navItems, urlPrefix), 200, {
          noAiTraining: page.seo?.noAiTraining,
        });
      }
      // Fall through to 404
    }

    // --- JSON API ---
    if (pathname === "/api/posts" && req.method === "GET") {
      const posts = await listPosts(db, tenantId);
      return json(res, posts);
    }

    const apiPostMatch = pathname.match(/^\/api\/posts\/([a-z0-9-]+)$/);
    if (apiPostMatch && req.method === "GET") {
      const post = await getPageBySlug(db, apiPostMatch[1], "post", tenantId);
      if (!post) return json(res, { error: "Post not found" }, 404);
      return json(res, post);
    }

    // --- 404 ---
    const navItems = await getNavItems(db, tenantId);
    html(res, notFoundPage(layout, navItems, urlPrefix), 404);
  };
}
