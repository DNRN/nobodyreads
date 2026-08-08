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

// --- Saved theme trials ---
//
// Deliberately separate from `site_template_revision`. A revision is history —
// every save appends one. A trial is a look somebody deliberately banked and
// named so they can try another and come back to it. Keeping them in one table
// would mean either naming every autosave or hiding most rows from the strip.

export const siteTemplateTrial = sqliteTable(
  "site_template_trial",
  {
    trialId: text("trial_id").notNull(),
    tenantId: text("tenant_id").notNull().default("_default"),
    name: text("name").notNull(),
    template: text("template", { mode: "json" }).notNull().default({}),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.trialId, table.tenantId] })]
);

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
