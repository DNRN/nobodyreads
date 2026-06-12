# nobodyreads — architecture overview

This document describes how **nobodyreads** is put together: what it does, how requests flow through it, and the design decisions that shape the codebase. It is meant as a durable reference for contributors and for hosts that embed the package as a library.

For setup and day-to-day usage, see the [README](../README.md). For agent/CI conventions, see [AGENTS.md](../AGENTS.md).

---

## What it is

nobodyreads is a **minimal, self-hosted blog engine** published as an npm package. It is:

- **Markdown-first** — content is stored as Markdown with YAML frontmatter in SQLite.
- **Server-rendered** — no client-side framework on the public site; Astro SSR for pages, Hono for APIs and admin mutations.
- **Self-hostable** — `npx nobodyreads` runs a complete standalone server.
- **Embeddable** — route factories and an Astro integration let other apps mount the admin UI and APIs under arbitrary URL prefixes and tenants.

The default tenant id for single-user/self-hosted mode is `_default`. A separate `_platform` tenant id exists for multi-tenant platform scenarios.

---

## High-level architecture

Two runtimes cooperate:

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| **HTTP / API** | Hono (`@hono/node-server`) | Static files, media serving, JSON APIs, admin mutation endpoints, auth gate, catch-all to Astro |
| **SSR / UI** | Astro (`@astrojs/node`, middleware mode) | Public pages, admin shell pages, preview routes |

```
                    ┌─────────────────────────────────────┐
                    │         standalone.ts (CLI)         │
                    │  wires Hono + Astro + storage + db  │
                    └─────────────────┬───────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
   ┌─────────────┐           ┌─────────────┐            ┌──────────────┐
   │  Hono app   │           │ MediaStorage│            │ SQLite (libSQL)│
   │  (routing)  │           │ local/GCS/S3│            │ via Drizzle    │
   └──────┬──────┘           └─────────────┘            └──────────────┘
          │
   ┌──────┴──────────────────────────────────────────────────────────┐
   │ /robots.txt, /public/*, /media/*, /api/*, /admin/* (Hono APIs) │
   │ catch-all → Astro SSR (prod) or Astro dev proxy (dev)          │
   └─────────────────────────────────────────────────────────────────┘
```

### Development vs production

- **Development:** Hono listens on port 3000 (`npm run dev`). Page requests are proxied to the Astro dev server on port 4321 (`npm run dev:astro`). WebSocket upgrades are proxied for Astro HMR. Hono also serves an SSE live-reload endpoint (`/__reload`) that watches `public/` and `src/`.
- **Production:** `npm run build` produces `dist/` (TypeScript) and `dist/astro/` (Astro SSR bundle). Hono loads `dist/astro/server/entry.mjs` and hands unmatched requests to Astro's Node middleware handler.

---

## Package surface

Published entry points (`package.json` `exports`):

| Import | Purpose |
|--------|---------|
| `nobodyreads` | Main barrel — route factories, DB, content queries, rendering, templates, types |
| `nobodyreads/schema` | Drizzle table definitions |
| `nobodyreads/storage` | Media storage backends and config |
| `nobodyreads/email` | Subscription email providers and config |
| `nobodyreads/editor` | Client-side editor utilities (for custom admin UIs) |
| `nobodyreads/editor/styles` | Shared admin CSS |
| `nobodyreads/astro` | `nobodyreadsAdmin()` Astro integration |
| `nobodyreads/astro/context` | `NobodyreadsAdminContext` helpers for injected admin pages |

The CLI binary `nobodyreads` points at `dist/standalone.js`.

---

## Source layout

```
src/
  index.ts              # Public exports
  standalone.ts         # CLI entry — assembles the full server
  paths.ts              # Package resource path helpers

  content/              # Blog content: DB queries, Markdown rendering, public API
  db/                   # Drizzle schema + Zod validation schemas
  admin/
    server/             # Hono admin route factories (content, views, theme, media, auth)
    client/             # Browser editor bundles (CodeMirror 6), built to public/
  subscription/         # Email subscribers + notification routes
  media/                # Storage abstraction (local, GCS, S3)
  template/             # Site template: design tokens, section components, CSS/HTML generation
  shared/               # DB init, HTTP helpers, SEO, site settings, site template revisions
  astro/                # Astro integration + admin context types

astro/
  pages/                # File-system routes: public site, login, preview
  _injected/admin/      # Admin UI pages (injected via integration, not file-routed)
  layouts/              # SiteLayout (public), AdminLayout (admin shell)
  components/           # Shared Astro components
  middleware.ts         # Populates Astro.locals for admin pages (standalone mode)

public/                 # Static assets + bundled editor JS (esbuild IIFE)
scripts/                # bootstrap-site, publish, utilities
config/                 # Example configs for storage and email (actual files are git-ignored)
schema.sql              # SQLite schema applied on startup
```

---

## Request routing (standalone server)

`standalone.ts` mounts routes in this order:

1. **Dev live-reload** — `GET /__reload` (SSE)
2. **robots.txt** — from package root
3. **Static files** — `public/` (editor JS, CSS, etc.)
4. **Media** — `GET /media/:key` via `MediaStorage.serve()`
5. **Public API** — `createBlogApiRoutes` + `createSubscriptionApiRoutes` at `/api`
6. **Admin auth middleware** — redirects to `/admin/login` when `EDITOR_PASSWORD` is set and session is missing
7. **Admin API** — `createEditorRoutes` + `createSubscriptionAdminRoutes` at `/admin`
8. **Catch-all** — Astro SSR (production) or dev proxy to `ASTRO_DEV_URL`

Anything not handled by Hono falls through to Astro, which renders public pages (`/`, `/:slug`, `/posts/:slug`) and injected admin pages (`/admin/*`).

---

## Data model

SQLite via Drizzle ORM and `@libsql/client`. Schema is in `schema.sql` and mirrored in `src/db/schema.ts`. On startup, `initDb()` applies the schema and runs lightweight column migrations.

| Table | Purpose |
|-------|---------|
| `tenant` | Platform-mode user accounts (not used in default single-tenant setup) |
| `page` | All content: posts, static pages, and the home page |
| `content_view` | Reusable views embedded in pages via `{{view:slug}}` |
| `site_template` | Current site template JSON + pointer to active revision |
| `site_template_revision` | Append-only template history |
| `site_settings` | Key-value settings per tenant (site name, logo, favicon, etc.) |
| `media` | Uploaded file metadata (storage key, mime, size) |
| `subscriber` | Email subscription list with verification tokens |

All content tables carry a `tenant_id` column (default `_default`) so the same schema supports multi-tenant hosts.

### Page kinds

- **`home`** — exactly one per tenant; served at `/`
- **`post`** — blog posts; served at `/posts/:slug`
- **`page`** — static pages; served at `/:slug`

Navigation is optional per page via `nav_label` and `nav_order` columns (set from frontmatter `nav:` block or the admin editor).

---

## Content pipeline

### Authoring

Content can be created two ways:

1. **Admin UI** — browser editors at `/admin/editor` (CodeMirror 6 bundles in `public/`), saving via Hono `POST /admin/editor/save`.
2. **CLI publish** — `npm run post -- content/foo.md` parses Markdown frontmatter with `gray-matter` and upserts into the database.

### Rendering

`src/content/render.ts` is the core renderer:

1. **`resolveLinks`** — replaces `[[page-id]]` and `[[page-id|label]]` wiki-style links with Markdown links, resolved against the DB at render time.
2. **`resolveViews`** — replaces `{{view:slug}}` with HTML snippets (post lists, custom SQL views, etc.).
3. **`renderMarkdown`** — GFM Markdown to HTML via `marked`, with a custom image renderer for size/alignment hints in alt text.

Public Astro pages call `renderContent()` which runs the full pipeline. `SiteLayout.astro` wraps output in the generated site template (CSS + section HTML).

### Editor preview

The admin page editor renders a live preview as you type. Plain Markdown is
rendered client-side with `marked` for instant feedback. When the content
contains server-only tokens (`{{view:slug}}` or `[[id]]` links), the editor
debounces a request to `POST /admin/editor/preview` (`src/admin/server/modules/content.ts`),
which runs the unsaved Markdown through `renderContent()` with `includeDrafts`
so views — including unpublished ones — and internal links render exactly as
they will on the public page. The endpoint falls back to the client render if
unreachable. This is distinct from the `/preview/*` Astro routes used by the
site-template editor iframe, which render *saved* content from the DB.

### Content views

Views are defined in the admin UI or seeded by `npm run site:bootstrap` (default: `latest-posts`). Kinds include `post_list` (filterable post listing) and `custom` (parameterized SQL). Views are referenced in page Markdown as `{{view:slug}}`.

---

## Site template system

The visual design of the public site is data-driven, not hand-coded per deployment.

- **Definition** — JSON `SiteTemplateDefinition` stored in `site_template` with revision history in `site_template_revision`.
- **Tokens** — light/dark design tokens (colors, typography, spacing) compiled to CSS variables.
- **Components** — registered in `src/template/registry.ts` (header, nav, footer, post body, hero, etc.). Each component exposes variants and optional per-instance token overrides.
- **Sections** — ordered, enable/disable-able layout sections that compose components into HTML.
- **Generation** — `generateCss()` and `generateHtml()` in `src/template/generate.ts` produce the stylesheet and structural HTML injected by `SiteLayout.astro`.
- **Editing** — `/admin/layout` and `/admin/editor/site` expose a live-preview template editor (site-editor bundle).

`DEFAULT_TEMPLATE` in `src/template/defaults.ts` is used when no template exists yet; `site:bootstrap` seeds the first revision.

---

## Admin architecture

The admin UI is split across **two layers** by design:

### Astro pages (read-mostly shell)

Live in `astro/_injected/admin/`. They are **not** file-system-routed in consuming apps; the `nobodyreadsAdmin()` integration injects routes at a configurable pattern (default `/admin`).

Pages read runtime context from `Astro.locals.nobodyreadsAdmin`:

```ts
interface NobodyreadsAdminContext {
  tenantId: string;
  adminBase: string;    // e.g. "/admin"
  editorBase: string;   // e.g. "/admin/editor"
  siteBase: string;     // public site prefix for "View site"
  loginHref: string;
}
```

The host Astro app must populate this via middleware before any admin page renders. In standalone mode, `astro/middleware.ts` does this for paths under `/admin`.

### Hono routes (mutations / APIs)

`createAdminRoutes()` (alias `createEditorRoutes`) mounts modular sub-routers:

| Module | Routes (under `/admin`) | Purpose |
|--------|-------------------------|---------|
| `auth-routes` | login/logout | Password session when `EDITOR_PASSWORD` is set |
| `content` | `/editor/save`, `/editor/delete` | Page CRUD; triggers subscriber notification on first publish |
| `views` | `/views/save`, `/views/delete` | Content view CRUD |
| `theme` | `/layout/*`, `/settings/*` | Template revisions, site settings |
| `media` | `/media/upload`, `/media/delete`, etc. | File uploads via `busboy` |

Admin route factories accept `{ db, storage, tenantId, urlPrefix }` so hosts can mount them anywhere.

### Design invariant: no host-specific auth in admin pages

Injected Astro admin pages **must not** call `guardAuth` or reach into platform session stores. Authentication is the host's responsibility; by the time a request reaches an injected page, middleware has already approved it and set `Astro.locals.nobodyreadsAdmin`. The standalone server applies a simpler password gate in Hono for `/admin/*` when `EDITOR_PASSWORD` is set.

---

## Media storage

Configured via `config/storage.config.json` (or `STORAGE_CONFIG` env var), not environment variables.

| Backend | Class | Notes |
|---------|-------|-------|
| `local` (default) | `LocalMediaStorage` | Files in `media/`; served by Hono at `/media/:key` |
| `gcs` | `GcsMediaStorage` | Requires `@google-cloud/storage` |
| `s3` | `S3MediaStorage` | S3-compatible (R2, MinIO, etc.) via optional `endpoint` |

Upload metadata is recorded in the `media` table. Site settings (logo, favicon, OG image) can reference media keys, resolved to public URLs at render time via `resolveMediaValue()`.

---

## Email subscriptions

Off by default. Enabled via `config/email.config.json` with a pluggable provider model:

- Built-in: **Mailjet**
- Extensible: `registerEmailProvider(name, factory)` before routes start

Public routes (`/api/subscribe`, verify, unsubscribe) live in `src/subscription/`.
Subscription uses **double opt-in**: `POST /api/subscribe` stores an unverified
row with a one-time token and emails a confirmation link; only after
`GET /api/subscribe/verify` confirms it does the address count as a subscriber.
Each `(email, tenant)` is unique — re-submitting a verified address replies
"already subscribed", while an unconfirmed address gets its link re-sent and is
told to validate. Subscriber emails are notification recipients only; the admin
**Settings** page shows aggregate counts (`countSubscribers`) and never lists
addresses.

Publishing a post for the first time triggers `notifySubscribers()` (verified +
active subscribers only) when email is enabled — both from the admin editor's
`/editor/save` and the `npm run post` CLI (`scripts/publish.ts`).

---

## SEO

`src/shared/seo.ts` builds meta tags and JSON-LD structured data from page frontmatter (`seo:` block) and site identity settings. `SiteLayout.astro` injects these into the document head. Pages can set `noIndex`, custom OG images, FAQ structured data, and `noAiTraining` (sets `X-Robots-Tag` response header).

---

## Configuration

| Source | What it controls |
|--------|------------------|
| `.env` | Database URL, port, site name/URL, editor password |
| `config/storage.config.json` | Media backend |
| `config/email.config.json` | Subscription email provider |
| Database (`site_settings`, `site_template`) | Runtime site identity and layout |
| `TENANT_ID` / `URL_PREFIX` env | Multi-tenant routing (library hosts) |

---

## Embedding as a library

A minimal host wires route factories onto its own Hono app:

```ts
const db = await initDb();
const storage = createMediaStorage();

app.route("/api", createBlogApiRoutes({ db, tenantId }));
app.route("/api", createSubscriptionApiRoutes({ db, tenantId }));
app.route("/admin", createAdminRoutes({ db, storage, tenantId, urlPrefix }));
```

For the admin UI, the host's Astro config adds the integration:

```ts
import { nobodyreadsAdmin } from "nobodyreads/astro";

export default defineConfig({
  integrations: [nobodyreadsAdmin({ pattern: "/[nickname]/admin" })],
});
```

The host must provide Astro middleware that resolves the tenant from the URL, authenticates the user, and calls `makeAdminContext()` to populate `Astro.locals.nobodyreadsAdmin`.

---

## Key design decisions

These are intentional constraints documented here so future changes stay aligned.

1. **Route factories, not singleton apps.** Every router is a function returning a configured Hono sub-app. Nothing binds tenant or URL prefix at import time. This is what makes multi-tenant embedding possible.

2. **Tenant-agnostic data layer.** All queries take an explicit `tenantId`. Single-tenant mode uses `_default` silently; platform mode uses per-user tenants.

3. **Admin UI injected, not file-routed.** Admin pages ship inside the npm package at `astro/_injected/admin/` and are exposed only through `injectRoute`. Hosts control the URL pattern without copying page files.

4. **Auth split: Hono for standalone, host middleware for embedded.** Standalone uses a simple `EDITOR_PASSWORD` session cookie. Embedded hosts own authentication entirely; admin Astro pages only read context locals.

5. **Content in SQLite, not the filesystem.** Markdown files in `content/` are examples and a CLI publish path; the runtime source of truth is the database. This enables the admin editor, wiki links resolved at render time, and atomic updates.

6. **Template as data.** Site appearance is a versioned JSON document with generated CSS/HTML, not a theme directory to fork. Revisions are append-only for undo/history in the layout editor.

7. **No client framework on the public site.** Astro SSR + generated CSS. Admin editors use small esbuild IIFE bundles with CodeMirror 6 — no React/Vue on either surface.

8. **Explicit published surface.** Only paths listed in `package.json` `exports` and `files` are part of the public API. Internal modules under `src/` are implementation details unless exported.

9. **Config files for credentials.** Storage and email credentials live in git-ignored JSON config files, not `.env`, so secrets are not conflated with generic environment setup.

10. **Markdown extensions as render-time transforms.** Wiki links and view embeds are resolved before Markdown parsing, keeping author syntax simple and ensuring links stay current when slugs change.

---

## Build and scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Hono standalone with tsx watch |
| `npm run dev:astro` | Astro dev server (proxied in dev) |
| `npm run build` | `astro build` then `tsc` |
| `npm run build:editors` | esbuild admin client bundles → `public/` |
| `npm run site:bootstrap` | Seed default template + `latest-posts` view |
| `npm run post -- <file.md>` | Publish Markdown file to database |
| `npm test` | Vitest (see [test.md](./test.md)) |

Production Docker image uses a multi-stage build; the container runs `standalone.ts` with a mounted volume for `data/` (SQLite) and optionally `media/`.

---

## Related documents

- [README.md](../README.md) — installation, configuration, usage
- [AGENTS.md](../AGENTS.md) — contributor/agent conventions and invariants
- [test.md](./test.md) — test suite overview and how to run it
