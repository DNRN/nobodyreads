-- Canonical schema, run at startup via executeMultiple() in shared/db.ts.
-- This file (not the Drizzle slices) is the runtime source of truth.
--
-- Adding or altering a table is a THREE-file change:
--   1. the feature's Drizzle slice (e.g. src/content/schema.ts) — typed queries
--   2. this file — the DDL that actually creates tables on a fresh database
--   3. migrateColumns() in src/shared/db.ts — an ALTER so existing DBs catch up
-- Keep all three in sync. Drizzle Kit is configured but not used for migrations.

-- Tenants (only used in platform mode)
CREATE TABLE IF NOT EXISTS tenant (
  id           TEXT PRIMARY KEY,
  nickname     TEXT UNIQUE NOT NULL,
  email        TEXT UNIQUE NOT NULL,
  password     TEXT NOT NULL,
  display_name TEXT,
  avatar_url   TEXT,
  avatar_color TEXT,
  bio          TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pages (blog content)
-- tenant_id defaults to '_default' for single-user (self-hosted) mode
CREATE TABLE IF NOT EXISTS page (
  page_id    TEXT NOT NULL,
  tenant_id  TEXT NOT NULL DEFAULT '_default',
  slug       TEXT NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  excerpt    TEXT NOT NULL DEFAULT '',
  tags       TEXT NOT NULL DEFAULT '[]',
  date       TEXT NOT NULL,
  updated    TEXT,
  published  INTEGER NOT NULL DEFAULT 0,
  scripts    TEXT,
  seo        TEXT,
  kind       TEXT NOT NULL CHECK(kind IN ('home','page','post')),
  nav_label  TEXT,
  nav_order  INTEGER,
  comments_enabled INTEGER NOT NULL DEFAULT 1,
  in_feed          INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (page_id, tenant_id),
  UNIQUE (slug, kind, tenant_id)
);

-- Reusable content views (embeddable via {{view:slug}} tokens)
CREATE TABLE IF NOT EXISTS content_view (
  content_view_id TEXT NOT NULL,
  tenant_id       TEXT NOT NULL DEFAULT '_default',
  slug            TEXT NOT NULL,
  title           TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK(kind IN ('post_list', 'custom')),
  config          TEXT NOT NULL DEFAULT '{}',
  published       INTEGER NOT NULL DEFAULT 0,
  updated         TEXT,
  PRIMARY KEY (content_view_id, tenant_id),
  UNIQUE (slug, tenant_id)
);

-- Site template (structured JSON template definition)
CREATE TABLE IF NOT EXISTS site_template (
  tenant_id  TEXT PRIMARY KEY DEFAULT '_default',
  template   TEXT NOT NULL DEFAULT '{}',
  current_revision_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Site template revisions (append-only history)
CREATE TABLE IF NOT EXISTS site_template_revision (
  revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   TEXT NOT NULL DEFAULT '_default',
  template    TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Key-value settings per tenant
CREATE TABLE IF NOT EXISTS site_settings (
  tenant_id TEXT NOT NULL DEFAULT '_default',
  key       TEXT NOT NULL,
  value     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tenant_id, key)
);

-- Media uploads
CREATE TABLE IF NOT EXISTS media (
  media_id      TEXT NOT NULL,
  tenant_id     TEXT NOT NULL DEFAULT '_default',
  storage_key   TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size          INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (media_id, tenant_id)
);

-- Members (local accounts; self-hosted mode)
CREATE TABLE IF NOT EXISTS member (
  member_id     TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Plot memberships
-- Members are identified by (issuer, subject) so identities can come from
-- local accounts, a hosting platform, or (later) federated sign-in.
CREATE TABLE IF NOT EXISTS plot_membership (
  tenant_id      TEXT NOT NULL DEFAULT '_default',
  member_issuer  TEXT NOT NULL,
  member_subject TEXT NOT NULL,
  display_name   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, member_issuer, member_subject)
);

-- Space memberships (legacy name, kept for existing databases)
CREATE TABLE IF NOT EXISTS space_membership (
  tenant_id      TEXT NOT NULL DEFAULT '_default',
  member_issuer  TEXT NOT NULL,
  member_subject TEXT NOT NULL,
  display_name   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, member_issuer, member_subject)
);

-- Post likes
CREATE TABLE IF NOT EXISTS post_like (
  tenant_id      TEXT NOT NULL DEFAULT '_default',
  page_id        TEXT NOT NULL,
  member_issuer  TEXT NOT NULL,
  member_subject TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, page_id, member_issuer, member_subject)
);

-- Comments (threaded discussion on posts)
-- Authored by a member identity (issuer, subject) like post_like. Soft-deleted
-- via deleted_at so a removed comment keeps its place in the thread.
CREATE TABLE IF NOT EXISTS comment (
  comment_id     TEXT NOT NULL,
  tenant_id      TEXT NOT NULL DEFAULT '_default',
  page_id        TEXT NOT NULL,
  parent_id      TEXT,
  member_issuer  TEXT NOT NULL,
  member_subject TEXT NOT NULL,
  author_name    TEXT NOT NULL,
  body           TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT,
  deleted_at     TEXT,
  pinned_at      TEXT,
  PRIMARY KEY (comment_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS comment_page_idx ON comment (tenant_id, page_id, created_at);
CREATE INDEX IF NOT EXISTS comment_parent_idx ON comment (parent_id);

-- Email subscribers
CREATE TABLE IF NOT EXISTS subscriber (
  subscriber_id   TEXT NOT NULL,
  tenant_id       TEXT NOT NULL DEFAULT '_default',
  email           TEXT NOT NULL,
  verified        INTEGER NOT NULL DEFAULT 0,
  verify_token    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at     TEXT,
  unsubscribed    INTEGER NOT NULL DEFAULT 0,
  unsubscribed_at TEXT,
  PRIMARY KEY (subscriber_id, tenant_id),
  UNIQUE (email, tenant_id)
);
