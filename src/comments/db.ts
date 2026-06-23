import { randomUUID } from "node:crypto";
import { and, eq, asc, gte, count } from "drizzle-orm";
import type { Database } from "../db/index.js";
import type { MemberIdentity } from "../community/types.js";
import { comment } from "./schema.js";
import type { Comment, NewComment } from "./types.js";

function toComment(row: typeof comment.$inferSelect): Comment {
  return {
    id: row.commentId,
    pageId: row.pageId,
    parentId: row.parentId,
    author: {
      issuer: row.memberIssuer,
      subject: row.memberSubject,
      displayName: row.authorName,
    },
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? undefined,
    deleted: row.deletedAt != null,
  };
}

/**
 * All comments on a post, oldest first. Includes soft-deleted rows so the
 * thread keeps its shape — callers decide how to render a deleted body.
 */
export async function listComments(
  db: Database,
  tenantId: string,
  pageId: string
): Promise<Comment[]> {
  const rows = await db
    .select()
    .from(comment)
    .where(and(eq(comment.tenantId, tenantId), eq(comment.pageId, pageId)))
    .orderBy(asc(comment.createdAt));
  return rows.map(toComment);
}

export async function getCommentById(
  db: Database,
  tenantId: string,
  commentId: string
): Promise<Comment | null> {
  const rows = await db
    .select()
    .from(comment)
    .where(and(eq(comment.tenantId, tenantId), eq(comment.commentId, commentId)))
    .limit(1);
  return rows.length > 0 ? toComment(rows[0]) : null;
}

/** Insert a new comment and return it. */
export async function createComment(
  db: Database,
  tenantId: string,
  input: NewComment
): Promise<Comment> {
  const commentId = randomUUID();
  await db.insert(comment).values({
    commentId,
    tenantId,
    pageId: input.pageId,
    parentId: input.parentId ?? null,
    memberIssuer: input.identity.issuer,
    memberSubject: input.identity.subject,
    authorName: input.identity.displayName,
    body: input.body,
  });
  const created = await getCommentById(db, tenantId, commentId);
  // The row was just inserted, so this is always present.
  return created!;
}

/** Soft-delete a comment (keeps its place in the thread). */
export async function softDeleteComment(
  db: Database,
  tenantId: string,
  commentId: string
): Promise<void> {
  await db
    .update(comment)
    .set({ deletedAt: new Date().toISOString() })
    .where(and(eq(comment.tenantId, tenantId), eq(comment.commentId, commentId)));
}

/**
 * Number of comments this member created within the last `sinceSeconds`.
 * Counts soft-deleted rows too, so delete-and-repost can't bypass the limit.
 */
export async function countRecentCommentsByMember(
  db: Database,
  tenantId: string,
  identity: MemberIdentity,
  sinceSeconds: number
): Promise<number> {
  // schema.sql stores timestamps as "YYYY-MM-DD HH:MM:SS" in UTC (datetime('now')).
  const threshold = new Date(Date.now() - sinceSeconds * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const rows = await db
    .select({ value: count() })
    .from(comment)
    .where(
      and(
        eq(comment.tenantId, tenantId),
        eq(comment.memberIssuer, identity.issuer),
        eq(comment.memberSubject, identity.subject),
        gte(comment.createdAt, threshold)
      )
    );
  return rows[0]?.value ?? 0;
}
