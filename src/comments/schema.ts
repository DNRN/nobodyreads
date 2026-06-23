import { sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// --- Comments ---
// Threaded discussion on posts. Authored by a member identity (issuer, subject)
// exactly like post_like, so the comment system stays identity-source-agnostic
// (local accounts, platform sessions, or federated sign-in). Soft-deleted via
// deleted_at so a removed comment keeps its place in the thread.

export const comment = sqliteTable(
  "comment",
  {
    commentId: text("comment_id").notNull(),
    tenantId: text("tenant_id").notNull().default("_default"),
    pageId: text("page_id").notNull(),
    parentId: text("parent_id"),
    memberIssuer: text("member_issuer").notNull(),
    memberSubject: text("member_subject").notNull(),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at"),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.tenantId] }),
    index("comment_page_idx").on(
      table.tenantId,
      table.pageId,
      table.createdAt
    ),
    index("comment_parent_idx").on(table.parentId),
  ]
);
