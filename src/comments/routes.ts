import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import type { Database } from "../db/index.js";
import { getPageBySlug } from "../content/db.js";
import type { MemberIdentity, ResolveMember } from "../community/types.js";
import type { AiProviderConfig } from "../admin/server/modules/types.js";
import { reviewComment } from "../moderation/pipeline.js";
import { enqueueModerationFlag } from "../moderation/db.js";
import type { RulesetSource } from "../moderation/ruleset.js";
import type { FlaggedCommentEvent } from "../moderation/types.js";
import type { Comment } from "./types.js";
import {
  countRecentCommentsByMember,
  createComment,
  getCommentById,
  listComments,
  softDeleteComment,
  setPinnedComment,
} from "./db.js";

export interface CommentModerationOptions {
  /** AI config for the moderation call. Host-owned, never a reader's key. */
  ai?: AiProviderConfig;
  /**
   * Where the ruleset text comes from. Defaults to reading
   * `config/ruleset.md` (override the path with `MODERATION_RULESET`); a
   * multi-tenant host can supply its own source instead. Returning null for a
   * tenant leaves their comments unmoderated.
   */
  rulesetSource?: RulesetSource;
  /** Minimum confidence for a non-allow verdict to take effect. Default 0.7. */
  confidenceThreshold?: number;
  /**
   * Fired (without awaiting) after a comment is flagged, so hosts can notify
   * the owner (email, in-app, …). Errors are logged, never surfaced.
   */
  onFlagged?: (event: FlaggedCommentEvent) => void | Promise<void>;
}

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
  /** AI-assisted pre-publish moderation (Phase 4). Off when omitted. */
  moderation?: CommentModerationOptions;
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
    pinned: comment.pinned,
    // Held comments are only ever serialized for their author (see
    // visibleToViewer), who sees them marked pending.
    pending: comment.held,
    mine,
  };
}

/**
 * Whether a comment appears in the public thread for this viewer. Held
 * comments are visible only to their author (as "pending review"); the owner
 * reviews them in the admin inbox, not inline.
 */
function visibleToViewer(comment: Comment, viewer: MemberIdentity | null): boolean {
  if (!comment.held) return true;
  return viewer != null && sameMember(viewer, comment.author);
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
      comments: comments
        .filter((cm) => visibleToViewer(cm, viewer))
        .map((cm) => toPublic(cm, viewer)),
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

      let parent: Comment | null = null;
      if (parentId) {
        parent = await getCommentById(db, tenantId, parentId);
        // Held comments are leaves by construction — nobody but the author can
        // see them, so nobody can meaningfully reply to them.
        if (!parent || parent.pageId !== post.id || parent.deleted || parent.held) {
          return c.json({ error: "invalid_parent" }, 400);
        }
      }

      // Pre-publish moderation check (synchronous: the comment can't render
      // until the verdict exists; the rate limit above bounds cost, and the
      // pipeline fails open with a hard timeout).
      let decision: Awaited<ReturnType<typeof reviewComment>> = { action: "publish" };
      if (options.moderation) {
        const parentChain: Comment[] = [];
        let cursor: Comment | null = parent;
        while (cursor && parentChain.length < 5) {
          parentChain.unshift(cursor);
          cursor = cursor.parentId
            ? await getCommentById(db, tenantId, cursor.parentId)
            : null;
        }
        decision = await reviewComment({
          db,
          tenantId,
          ai: options.moderation.ai,
          rulesetSource: options.moderation.rulesetSource,
          post,
          parentChain,
          authorName: identity.displayName,
          body,
          confidenceThreshold: options.moderation.confidenceThreshold,
        });
      }

      const created = await createComment(db, tenantId, {
        pageId: post.id,
        parentId: parentId ?? null,
        identity,
        body,
        held: decision.action === "hold",
      });

      if (decision.flag) {
        const queueId = await enqueueModerationFlag(db, tenantId, {
          commentId: created.id,
          pageId: post.id,
          flag: decision.flag,
        });
        const onFlagged = options.moderation?.onFlagged;
        if (onFlagged) {
          const event: FlaggedCommentEvent = {
            queueId,
            commentId: created.id,
            pageId: post.id,
            pageTitle: post.title,
            pageSlug: post.slug,
            authorName: identity.displayName,
            commentExcerpt: body.slice(0, 200),
            held: decision.action === "hold",
            flag: decision.flag,
          };
          // Fire-and-forget: notification failures must never fail the POST.
          Promise.resolve()
            .then(() => onFlagged(event))
            .catch((err) => console.error("moderation onFlagged hook failed:", err));
        }
      }

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

  app.post("/comments/:id/pin", async (c) => {
    const existing = await getCommentById(db, tenantId, c.req.param("id"));
    if (!existing) return c.json({ error: "not_found" }, 404);
    if (existing.deleted) return c.json({ error: "comment_deleted" }, 400);
    if (existing.held) return c.json({ error: "comment_held" }, 400);

    const canMod = options.canModerate ? await options.canModerate(c) : false;
    if (!canMod) {
      const identity = await resolveMember(c);
      return c.json(
        { error: identity ? "forbidden" : "unauthorized" },
        identity ? 403 : 401,
      );
    }

    const nowPinned = !existing.pinned;
    await setPinnedComment(db, tenantId, existing.id, existing.pageId, nowPinned);
    return c.json({ pinned: nowPinned });
  });

  return app;
}
