import {
  sqliteTable,
  text,
  real,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// --- Moderation queue ---
// One row per flagged comment. `verdict` is what the model said; `status`
// tracks the owner's resolution (pending → dismissed/actioned).

export const moderationQueue = sqliteTable(
  "moderation_queue",
  {
    queueId: text("queue_id").notNull(),
    tenantId: text("tenant_id").notNull().default("_default"),
    commentId: text("comment_id").notNull(),
    pageId: text("page_id").notNull(),
    verdict: text("verdict").notNull(),
    flagReason: text("flag_reason").notNull(),
    rule: text("rule"),
    confidence: real("confidence").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    primaryKey({ columns: [table.queueId, table.tenantId] }),
    index("moderation_queue_status_idx").on(
      table.tenantId,
      table.status,
      table.createdAt
    ),
  ]
);
