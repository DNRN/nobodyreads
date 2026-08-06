import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import type { Database } from "../db/index.js";
import { getPageBySlug } from "../content/db.js";
import { resolvePageAccess } from "../payments/access.js";
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
  /**
   * Returns true when the requester owns the plot, for the paywall gate on
   * gated posts. Hosts decide ownership; the package never does — the same
   * contract as `canModerate` and as `PageAccessOptions.isOwner`.
   *
   * Defaults to `canModerate`, which is what it means on every host today: the
   * person who can remove any comment is the owner. Separate options because
   * "may moderate" and "may read paid content" are different questions, and a
   * host that ever grows a moderator role will need them apart.
   */
  isOwner?: (c: Context) => boolean | Promise<boolean>;
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
 *   GET  /posts/:slug/comments  — list thread (readers who can read the post)
 *   POST /posts/:slug/comments  — create or reply (members only)
 *   POST /comments/:id/delete   — delete own (or any, when canModerate passes)
 *
 * ## Comments inherit the post's access tier
 *
 * A discussion belongs to its post. If you cannot read a members-only or paid
 * post, you can neither read nor write its thread — otherwise a paywall leaks
 * through the side door twice over: a non-payer can quote the paid body into a
 * public comment, and the "paid community" a creator is selling is free to
 * anyone who scrolls past the teaser.
 *
 * `commentsEnabled` and the access tier are independent: the first is the
 * author saying "no discussion here", the second is "not for you (yet)".
 */
export function createCommentRoutes(options: CommentRouterOptions): Hono {
  const { db, resolveMember } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const rateLimit = options.rateLimitPerMinute ?? 5;
  const isOwner = options.isOwner ?? options.canModerate;

  const app = new Hono();

  /**
   * Whether this requester may see the post's body — and therefore its thread.
   *
   * Short-circuits on `access_tier = 'public'` inside `resolvePageAccess`, so
   * the overwhelmingly common case costs no extra query.
   */
  async function canReadPost(
    c: Context,
    post: Awaited<ReturnType<typeof getPageBySlug>>,
    viewer: MemberIdentity | null
  ): Promise<boolean> {
    if (!post) return false;
    if (post.accessTier === "public") return true;

    const decision = await resolvePageAccess(db, post, tenantId, viewer, {
      isOwner: isOwner ? await isOwner(c) : false,
    });
    return decision.visibility === "full";
  }

  app.get("/posts/:slug/comments", async (c) => {
    const post = await getPageBySlug(db, c.req.param("slug"), "post", tenantId);
    if (!post) return c.json({ error: "not_found" }, 404);
    const viewer = await resolveMember(c);

    // Not a 403: the *post* is discoverable (its teaser is public), so the
    // honest answer is "there is a thread here and it is not open to you",
    // which is what the widget renders a join/subscribe prompt from.
    if (!(await canReadPost(c, post, viewer))) {
      return c.json({
        commentsEnabled: post.commentsEnabled,
        comments: [],
        gated: true,
        accessTier: post.accessTier,
      });
    }

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

      // Posting follows the same rule as reading. Checked *after* identity so a
      // signed-out reader still gets a 401 (log in) rather than a 403 (pay) —
      // they may well already be entitled.
      if (!(await canReadPost(c, post, identity))) {
        return c.json({ error: "access_required", accessTier: post.accessTier }, 403);
      }

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
