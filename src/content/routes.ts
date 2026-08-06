import { Hono } from "hono";
import type { Database } from "../db/index.js";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import { listPosts, getPageBySlug } from "./db.js";
// The one place `content/` reaches into `payments/`. The invariant that matters
// — `content/db.ts` never imports `payments/`, so a page *query* can never gate
// itself — is untouched: this is a delivery boundary, where the Phase 5a design
// says redaction belongs. `teaser.ts` is a leaf (its only `content/` import is
// type-only), so there is no runtime cycle. Redaction cannot live one layer up
// in `createPublicApiRoutes` because hosts mount this router directly.
import { buildTeaser } from "../payments/teaser.js";

export interface BlogApiOptions {
  db: Database;
  tenantId?: string;
}

/**
 * JSON API for blog content. Mount at /api.
 *
 * Routes:
 *   GET /posts       — list all published posts
 *   GET /posts/:slug — get a single post by slug
 */
export function createBlogApiRoutes(options: BlogApiOptions): Hono {
  const { db } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;

  const app = new Hono();

  app.get("/posts", async (c) => {
    const posts = await listPosts(db, tenantId);
    return c.json(posts);
  });

  app.get("/posts/:slug", async (c) => {
    const slug = c.req.param("slug");
    const post = await getPageBySlug(db, slug, "post", tenantId);
    if (!post) return c.json({ error: "Post not found" }, 404);

    // Gated posts return the teaser here **unconditionally** — even for a reader
    // who has paid.
    //
    // This router composes into `createPublicApiRoutes`, whose documented
    // contract is "no member identity required". Threading `resolveMember` in
    // would invert that contract and leave the leak one forgotten option away;
    // as written, the endpoint fails closed *by construction* — there is no
    // identity here to get wrong.
    //
    // If an entitled-reader JSON body is ever needed it belongs in the
    // *interface* API group, which already carries `resolveMember`. Explicitly
    // out of scope for Phase 5a.
    if (post.accessTier !== "public") {
      return c.json({ ...post, content: buildTeaser(post), gated: true });
    }

    return c.json(post);
  });

  return app;
}
