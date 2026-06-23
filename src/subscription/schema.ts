import { sqliteTable, text, integer, primaryKey, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// --- Email subscribers ---

export const subscriber = sqliteTable(
  "subscriber",
  {
    subscriberId: text("subscriber_id").notNull(),
    tenantId: text("tenant_id").notNull().default("_default"),
    email: text("email").notNull(),
    verified: integer("verified", { mode: "boolean" }).notNull().default(false),
    verifyToken: text("verify_token"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    verifiedAt: text("verified_at"),
    unsubscribed: integer("unsubscribed", { mode: "boolean" })
      .notNull()
      .default(false),
    unsubscribedAt: text("unsubscribed_at"),
  },
  (table) => [
    primaryKey({ columns: [table.subscriberId, table.tenantId] }),
    unique().on(table.email, table.tenantId),
  ]
);
