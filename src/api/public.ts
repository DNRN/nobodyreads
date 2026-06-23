import { Hono } from "hono";
import type { Database } from "../db/index.js";
import { createBlogApiRoutes } from "../content/routes.js";

export interface PublicApiOptions {
  db: Database;
  tenantId?: string;
}

/**
 * Public API group — read-only content, no member identity required.
 * Mount at `/api`. Composes the per-feature read routes into one app so the
 * read surface is visible in one place.
 *
 * Routes:
 *   GET /posts        — list published posts
 *   GET /posts/:slug  — single post by slug
 */
export function createPublicApiRoutes(options: PublicApiOptions): Hono {
  const app = new Hono();
  app.route("/", createBlogApiRoutes(options));
  return app;
}
