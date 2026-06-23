import { Hono } from "hono";
import type { Database } from "../db/index.js";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import { listPosts, getPageBySlug } from "./db.js";

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
    return c.json(post);
  });

  return app;
}
