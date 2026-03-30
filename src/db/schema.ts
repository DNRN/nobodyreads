import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  unique,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type { PageMeta } from "../content/types.js";

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

// --- Pages (blog content) ---

export const page = sqliteTable(
  "page",
  {
    pageId: text("page_id").notNull(),
    tenantId: text("tenant_id").notNull().default("_default"),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    excerpt: text("excerpt").notNull().default(""),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    date: text("date").notNull(),
    updated: text("updated"),
    published: integer("published", { mode: "boolean" }).notNull().default(false),
    scripts: text("scripts", { mode: "json" }).$type<string[]>(),
    seo: text("seo", { mode: "json" }).$type<PageMeta>(),
    kind: text("kind").notNull(),
    navLabel: text("nav_label"),
    navOrder: integer("nav_order"),
  },
  (table) => [
    primaryKey({ columns: [table.pageId, table.tenantId] }),
    unique().on(table.slug, table.kind, table.tenantId),
  ]
);

// --- Content views (embeddable via {{view:slug}}) ---

export const contentView = sqliteTable(
  "content_view",
  {
    contentViewId: text("content_view_id").notNull(),
    tenantId: text("tenant_id").notNull().default("_default"),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    config: text("config", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    published: integer("published", { mode: "boolean" }).notNull().default(false),
    updated: text("updated"),
  },
  (table) => [
    primaryKey({ columns: [table.contentViewId, table.tenantId] }),
    unique().on(table.slug, table.tenantId),
  ]
);

// --- Site bundle (admin-managed HTML/CSS/JS) ---

export const siteBundle = sqliteTable("site_bundle", {
  tenantId: text("tenant_id").primaryKey().default("_default"),
  html: text("html").notNull().default(""),
  css: text("css").notNull().default(""),
  js: text("js").notNull().default(""),
  ts: text("ts").notNull().default(""),
  currentRevisionId: integer("current_revision_id"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// --- Site bundle revisions (append-only history) ---

export const siteBundleRevision = sqliteTable("site_bundle_revision", {
  revisionId: integer("revision_id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull().default("_default"),
  html: text("html").notNull().default(""),
  css: text("css").notNull().default(""),
  js: text("js").notNull().default(""),
  ts: text("ts").notNull().default(""),
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

// --- Media uploads ---

export const media = sqliteTable(
  "media",
  {
    mediaId: text("media_id").notNull(),
    tenantId: text("tenant_id").notNull().default("_default"),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.mediaId, table.tenantId] })]
);

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
