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

-- Site bundle (admin-managed HTML/CSS/JS)
CREATE TABLE IF NOT EXISTS site_bundle (
  tenant_id  TEXT PRIMARY KEY DEFAULT '_default',
  html       TEXT NOT NULL DEFAULT '',
  css        TEXT NOT NULL DEFAULT '',
  js         TEXT NOT NULL DEFAULT '',
  ts         TEXT NOT NULL DEFAULT '',
  current_revision_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Site bundle revisions (append-only history)
CREATE TABLE IF NOT EXISTS site_bundle_revision (
  revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   TEXT NOT NULL DEFAULT '_default',
  html        TEXT NOT NULL DEFAULT '',
  css         TEXT NOT NULL DEFAULT '',
  js          TEXT NOT NULL DEFAULT '',
  ts          TEXT NOT NULL DEFAULT '',
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
