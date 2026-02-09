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
