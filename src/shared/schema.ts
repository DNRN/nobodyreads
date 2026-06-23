import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// --- Tenants (platform mode) ---

export const tenant = sqliteTable("tenant", {
  id: text("id").primaryKey(),
  nickname: text("nickname").unique().notNull(),
  email: text("email").unique().notNull(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  avatarColor: text("avatar_color"),
  bio: text("bio"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// --- Site template (structured JSON template definition) ---

export const siteTemplate = sqliteTable("site_template", {
  tenantId: text("tenant_id").primaryKey().default("_default"),
  template: text("template", { mode: "json" }).notNull().default({}),
  currentRevisionId: integer("current_revision_id"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// --- Site template revisions (append-only history) ---

export const siteTemplateRevision = sqliteTable("site_template_revision", {
  revisionId: integer("revision_id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull().default("_default"),
  template: text("template", { mode: "json" }).notNull().default({}),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// --- Key-value settings per tenant ---

export const siteSettings = sqliteTable(
  "site_settings",
  {
    tenantId: text("tenant_id").notNull().default("_default"),
    key: text("key").notNull(),
    value: text("value").notNull().default(""),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.key] })]
);
