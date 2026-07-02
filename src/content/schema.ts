import { sqliteTable, text, integer, primaryKey, unique } from "drizzle-orm/sqlite-core";
import type { PageMeta } from "./types.js";

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
    commentsEnabled: integer("comments_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    inFeed: integer("in_feed", { mode: "boolean" })
      .notNull()
      .default(true),
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
