import { randomUUID } from "node:crypto";
import { and, eq, desc, count } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { comment } from "../comments/schema.js";
import { page } from "../content/schema.js";
import { getSiteSetting, setSiteSetting } from "../shared/site-settings.js";
import { moderationQueue } from "./schema.js";
import type {
  ModerationFlag,
  ModerationQueueItem,
  ModerationQueueStatus,
} from "./types.js";

// --- Auto-hide setting ---
// The one moderation knob a space owner controls. The ruleset itself is
// deployment config (see ruleset.ts), so this lives in `site_settings` rather
// than earning a table of its own.

export const SETTING_MODERATION_AUTO_HIDE = "moderation_auto_hide";

/**
 * Whether `hold` verdicts are withheld from readers pending review.
 * Defaults to true — a space that has never touched the setting gets the
 * cautious behavior. `reject` verdicts ignore this and always hold.
 */
export async function getModerationAutoHide(
  db: Database,
  tenantId: string
): Promise<boolean> {
  const value = await getSiteSetting(db, tenantId, SETTING_MODERATION_AUTO_HIDE);
  return value == null ? true : value !== "off";
}

export async function setModerationAutoHide(
  db: Database,
  tenantId: string,
  autoHide: boolean
): Promise<void> {
  await setSiteSetting(
    db,
    tenantId,
    SETTING_MODERATION_AUTO_HIDE,
    autoHide ? "on" : "off"
  );
}

// --- Moderation queue ---

/** Record a non-allow verdict against a comment. Returns the queue id. */
export async function enqueueModerationFlag(
  db: Database,
  tenantId: string,
  input: { commentId: string; pageId: string; flag: ModerationFlag }
): Promise<string> {
  const queueId = randomUUID();
  await db.insert(moderationQueue).values({
    queueId,
    tenantId,
    commentId: input.commentId,
    pageId: input.pageId,
    verdict: input.flag.verdict,
    flagReason: input.flag.reason,
    rule: input.flag.rule,
    confidence: input.flag.confidence,
  });
  return queueId;
}

/**
 * Queue rows joined with their comment and post so the inbox can render
 * without extra round trips. Newest first.
 */
export async function listModerationQueue(
  db: Database,
  tenantId: string,
  status?: ModerationQueueStatus
): Promise<ModerationQueueItem[]> {
  const conditions = [eq(moderationQueue.tenantId, tenantId)];
  if (status) conditions.push(eq(moderationQueue.status, status));

  const rows = await db
    .select({
      queue: moderationQueue,
      commentAuthor: comment.authorName,
      commentBody: comment.body,
      commentDeletedAt: comment.deletedAt,
      commentHeldAt: comment.heldAt,
      pageTitle: page.title,
      pageSlug: page.slug,
    })
    .from(moderationQueue)
    .innerJoin(
      comment,
      and(
        eq(comment.commentId, moderationQueue.commentId),
        eq(comment.tenantId, moderationQueue.tenantId)
      )
    )
    .innerJoin(
      page,
      and(
        eq(page.pageId, moderationQueue.pageId),
        eq(page.tenantId, moderationQueue.tenantId)
      )
    )
    .where(and(...conditions))
    .orderBy(desc(moderationQueue.createdAt));

  return rows.map((row) => ({
    id: row.queue.queueId,
    commentId: row.queue.commentId,
    pageId: row.queue.pageId,
    verdict: row.queue.verdict as "hold" | "reject",
    flagReason: row.queue.flagReason,
    rule: row.queue.rule,
    confidence: row.queue.confidence,
    status: row.queue.status as ModerationQueueStatus,
    createdAt: row.queue.createdAt,
    resolvedAt: row.queue.resolvedAt,
    comment: {
      authorName: row.commentAuthor,
      body: row.commentBody,
      deleted: row.commentDeletedAt != null,
      held: row.commentHeldAt != null,
    },
    page: {
      title: row.pageTitle,
      slug: row.pageSlug,
    },
  }));
}

/** A single queue row (no joins), or null. */
export async function getModerationFlagById(
  db: Database,
  tenantId: string,
  queueId: string
): Promise<{ id: string; commentId: string; pageId: string; status: ModerationQueueStatus } | null> {
  const rows = await db
    .select()
    .from(moderationQueue)
    .where(and(eq(moderationQueue.tenantId, tenantId), eq(moderationQueue.queueId, queueId)))
    .limit(1);
  if (rows.length === 0) return null;
  return {
    id: rows[0].queueId,
    commentId: rows[0].commentId,
    pageId: rows[0].pageId,
    status: rows[0].status as ModerationQueueStatus,
  };
}

/** Mark a flag resolved (dismissed or actioned). */
export async function resolveModerationFlag(
  db: Database,
  tenantId: string,
  queueId: string,
  status: "dismissed" | "actioned"
): Promise<void> {
  await db
    .update(moderationQueue)
    .set({ status, resolvedAt: new Date().toISOString() })
    .where(and(eq(moderationQueue.tenantId, tenantId), eq(moderationQueue.queueId, queueId)));
}

/** Number of unresolved flags (drives the in-app notification badge). */
export async function countPendingFlags(
  db: Database,
  tenantId: string
): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(moderationQueue)
    .where(and(eq(moderationQueue.tenantId, tenantId), eq(moderationQueue.status, "pending")));
  return rows[0]?.value ?? 0;
}
