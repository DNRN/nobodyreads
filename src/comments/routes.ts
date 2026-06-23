import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import type { Database } from "../db/index.js";
import { getPageBySlug } from "../content/db.js";
import type { MemberIdentity, ResolveMember } from "../community/types.js";
import type { Comment } from "./types.js";
import {
  countRecentCommentsByMember,
  createComment,
  getCommentById,
  listComments,
  softDeleteComment,
} from "./db.js";

export interface CommentRouterOptions {
  db: Database;
  tenantId?: string;
  urlPrefix?: string;
  /** Maps a request to the current member; hosts plug in their own auth. */
  resolveMember: ResolveMember;
  /** Submissions allowed per member per minute (spam throttle). Default 5. */
  rateLimitPerMinute?: number;
  /** Returns true when the requester may remove any comment (post owner/admin). */
  canModerate?: (c: Context) => boolean | Promise<boolean>;
}

const createSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty").max(10000),
  parentId: z.string().trim().min(1).optional(),
});

function sameMember(a: MemberIdentity, b: MemberIdentity): boolean {
  return a.issuer === b.issuer && a.subject === b.subject;
}

/** Public view of a comment. Hides author + body for soft-deleted rows. */
function toPublic(comment: Comment, viewer: MemberIdentity | null) {
  const mine =
    viewer != null && !comment.deleted && sameMember(viewer, comment.author);
  return {
    id: comment.id,
    parentId: comment.parentId,
    authorName: comment.deleted ? null : comment.author.displayName,
    body: comment.deleted ? null : comment.body,
    createdAt: comment.createdAt,
    deleted: comment.deleted,
    mine,
  };
}

/**
 * Comment routes. Mount at /api.
 *
 * Routes:
 *   GET  /posts/:slug/comments  — list thread (public)
 *   POST /posts/:slug/comments  — create or reply (members only)
 *   POST /comments/:id/delete   — delete own (or any, when canModerate passes)
 */
export function createCommentRoutes(options: CommentRouterOptions): Hono {
  const { db, resolveMember } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const rateLimit = options.rateLimitPerMinute ?? 5;

  const app = new Hono();

  app.get("/posts/:slug/comments", async (c) => {
    const post = await getPageBySlug(db, c.req.param("slug"), "post", tenantId);
    if (!post) return c.json({ error: "not_found" }, 404);
    const viewer = await resolveMember(c);
    const comments = await listComments(db, tenantId, post.id);
    return c.json({
      commentsEnabled: post.commentsEnabled,
      comments: comments.map((cm) => toPublic(cm, viewer)),
    });
  });

  app.post(
    "/posts/:slug/comments",
    zValidator("json", createSchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "invalid", details: result.error.issues }, 400);
      }
    }),
    async (c) => {
      const post = await getPageBySlug(db, c.req.param("slug"), "post", tenantId);
      if (!post) return c.json({ error: "not_found" }, 404);
      if (!post.commentsEnabled) {
        return c.json({ error: "comments_disabled" }, 403);
      }

      const identity = await resolveMember(c);
      if (!identity) return c.json({ error: "unauthorized" }, 401);

      const recent = await countRecentCommentsByMember(db, tenantId, identity, 60);
      if (recent >= rateLimit) {
        return c.json({ error: "rate_limited" }, 429);
      }

      const { body, parentId } = c.req.valid("json");

      if (parentId) {
        const parent = await getCommentById(db, tenantId, parentId);
        if (!parent || parent.pageId !== post.id || parent.deleted) {
          return c.json({ error: "invalid_parent" }, 400);
        }
      }

      const created = await createComment(db, tenantId, {
        pageId: post.id,
        parentId: parentId ?? null,
        identity,
        body,
      });
      return c.json(toPublic(created, identity), 201);
    }
  );

  app.post("/comments/:id/delete", async (c) => {
    const existing = await getCommentById(db, tenantId, c.req.param("id"));
    if (!existing) return c.json({ error: "not_found" }, 404);
    if (existing.deleted) return c.json({ deleted: true });

    const identity = await resolveMember(c);
    const isAuthor = identity != null && sameMember(identity, existing.author);
    const canModerate = options.canModerate
      ? await options.canModerate(c)
      : false;

    if (!isAuthor && !canModerate) {
      return c.json({ error: identity ? "forbidden" : "unauthorized" }, identity ? 403 : 401);
    }

    await softDeleteComment(db, tenantId, existing.id);
    return c.json({ deleted: true });
  });

  return app;
}
