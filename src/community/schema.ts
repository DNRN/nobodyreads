import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// --- Members (local accounts; self-hosted mode) ---

export const member = sqliteTable("member", {
  memberId: text("member_id").primaryKey(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// --- Plot memberships ---
// Members are identified by (issuer, subject) so identities can come from
// local accounts, a hosting platform, or (later) federated sign-in.

export const plotMembership = sqliteTable(
  "plot_membership",
  {
    tenantId: text("tenant_id").notNull().default("_default"),
    memberIssuer: text("member_issuer").notNull(),
    memberSubject: text("member_subject").notNull(),
    displayName: text("display_name"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.memberIssuer, table.memberSubject],
    }),
  ]
);

// --- Post likes ---

export const postLike = sqliteTable(
  "post_like",
  {
    tenantId: text("tenant_id").notNull().default("_default"),
    pageId: text("page_id").notNull(),
    memberIssuer: text("member_issuer").notNull(),
    memberSubject: text("member_subject").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({
      columns: [
        table.tenantId,
        table.pageId,
        table.memberIssuer,
        table.memberSubject,
      ],
    }),
  ]
);
