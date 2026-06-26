# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Hono standalone server with tsx watch (port 3000)
npm run dev:astro    # Astro dev server (port 4321); run alongside dev
npm run build        # astro build && tsc (produces dist/ and dist/astro/); also bundles the admin Svelte islands
npm run typecheck    # tsc --noEmit
npm test             # vitest run (single pass)
npx vitest           # vitest in watch mode
npx vitest run src/content/db.test.ts   # run a specific test file
npx vitest run -t "listPosts"           # run tests matching a name pattern
npx vitest run -u src/template/template.test.ts  # update snapshots
npm run post -- content/foo.md   # publish a Markdown file to the database
npm run site:bootstrap           # seed default template and latest-posts view
```

Tests run against an in-memory SQLite database — no `.env` or external services needed. CI runs `typecheck` and `build` but **not** the test suite; run tests locally before opening a PR.

## Architecture

Two runtimes cooperate at runtime:

- **Hono** (`@hono/node-server`) handles static files, media serving, JSON APIs, admin mutations, and auth gate. It catches everything not handled by its own routes and passes it to Astro.
- **Astro** (`@astrojs/node`, middleware mode) renders public pages, the admin shell, and preview routes via SSR.

In **development**, Hono proxies unmatched requests to the Astro dev server on port 4321 (controlled by `ASTRO_DEV_PROXY`). In **production**, `npm run build` produces `dist/astro/server/entry.mjs` which Hono loads as a Node middleware handler.

### Request routing (standalone server)

`src/standalone.ts` mounts routes in this order:
1. Dev live-reload SSE (`/__reload`)
2. robots.txt, static files (`public/`), media (`/media/:key`)
3. Public API — plot routes, subscription routes, member auth routes, community routes, federated auth routes — all at `/api`
4. Admin auth middleware (password gate when `EDITOR_PASSWORD` is set)
5. Admin API — editor routes, subscription admin — at `/admin`
6. Catch-all → Astro SSR

### Source layout

```
src/
  index.ts              # Package barrel (all public exports)
  standalone.ts         # CLI entry point
  content/              # Plot DB queries, Markdown rendering, public API routes
  community/            # Memberships, post likes, local member accounts
  federation/           # Federated sign-in client (OAuth2 relying party)
  db/                   # Drizzle schema + Zod validation schemas
  admin/
    server/             # Hono admin route factories (content, views, theme, media, auth)
    client/             # Browser editor bundles (CodeMirror 6), built to public/
  subscription/         # Email subscribers + notification routes
  media/                # Storage abstraction (local, GCS, S3)
  template/             # Design tokens, section components, CSS/HTML generation
  shared/               # DB init, HTTP helpers, SEO, site settings, template revisions
  astro/                # Astro integration + admin context types

astro/
  pages/                # File-system routes: public site, login, preview
  _injected/admin/      # Admin UI pages (injected via integration, NOT file-routed)
  layouts/              # SiteLayout (public), AdminLayout (admin shell)
  components/           # Shared Astro components
  middleware.ts         # Populates Astro.locals for admin pages (standalone mode)
```

### Key invariants (from AGENTS.md)

1. **Tenant-agnostic.** Nothing may assume a single tenant or that the admin lives at `/admin`. Always take `tenantId` and URL prefixes as parameters, or read them from `Astro.locals.nobodyreadsAdmin`. Default tenant is `_default`.

2. **No host-specific auth in admin pages.** Injected Astro admin pages must not call `guardAuth` or reach into platform sessions. By the time a request reaches an injected page, the host's middleware has already approved it and populated `Astro.locals.nobodyreadsAdmin`.

3. **Routes are factories, not instances.** Export functions that return a configured Hono app; never export a pre-built app that binds tenant or URL prefix at import time.

4. **Explicit published surface.** Anything consumers import must go through a `package.json` `exports` entry. Internal modules under `src/` are implementation details unless exported.

### Data model

SQLite via Drizzle ORM and `@libsql/client`. Schema in `schema.sql` (mirrored in `src/db/schema.ts`). All content tables carry a `tenant_id` column. `initDb()` applies the schema and runs lightweight column migrations on startup.

Page kinds: `home` (one per tenant, served at `/`), `post` (at `/posts/:slug`), `page` (at `/:slug`).

### Content pipeline

Render-time transforms in `src/content/render.ts`:
1. `resolveLinks` — `[[page-id]]` wiki links → Markdown links (resolved against DB)
2. `resolveViews` — `{{view:slug}}` embeds → HTML snippets
3. `renderMarkdown` — GFM Markdown → HTML via `marked`

### Site template system

Visual design is data-driven JSON (`SiteTemplateDefinition`) stored in `site_template` with append-only revision history. `generateCss()` and `generateHtml()` in `src/template/generate.ts` produce the stylesheet and HTML injected by `SiteLayout.astro`. No theme directory to fork.

### Admin editors (Svelte islands)

All three admin editors are Svelte islands in `astro/components/admin/`, hydrated with `client:load` and bundled by Astro/Vite (no manual build step):

- `PageEditor.svelte` — **Milkdown WYSIWYG** (Crepe). Markdown stays the source of truth (Crepe serializes on change); a Source toggle swaps to a raw `<textarea>`. Crepe's ImageBlock feature is **disabled** because it commandeers image alt text and would destroy our `![alt|400px|right]` size/align hints; images use plain commonmark nodes with a drop/paste uploader.
- `ViewEditor.svelte` — idiomatic Svelte; CodeMirror for the SQL/JS panes.
- `SiteEditor.svelte` — owns the markup and bootstraps the heavier `createSiteEditor` logic (`src/admin/client/site-editor.ts`) via element refs; CodeMirror panes.

Custom Markdown constructs (`[[wiki]]`, `{{view:slug}}`) are Milkdown atom-node plugins in `src/admin/client/milkdown/` (exported as `nobodyreads/editor/milkdown`) — modelled as dedicated nodes so the serializer never escapes them. The other editor helpers live in `src/admin/client/` (`nobodyreads/editor`). Svelte powers admin islands only — the public site ships no islands and stays zero-framework.

ProseMirror must run as a single instance: `astro.config.mjs` `vite.resolve.dedupe` collapses the `prosemirror-*` copies Milkdown ships. The standalone server serves the Astro client build (`dist/astro/client`, incl. `/_astro/*`) so islands hydrate in production.

### Configuration

- `.env` — database URL, port, site name/URL, editor password, federation env vars
- `config/storage.config.json` — media backend (local, GCS, S3); git-ignored
- `config/email.config.json` — subscription email provider; git-ignored
- Database (`site_settings`, `site_template`) — runtime site identity and layout

### Testing

Tests live at `src/**/*.test.ts`. Use `createTestDb()` from `src/test/db.ts` for an in-memory database in `beforeEach`. For HTTP route tests, mount the factory on a Hono app and call `app.request()` — no listening socket needed.

### Documentation

Update `docs/overview.md` when changing major modules, route factories, request routing, the data model, template system, admin context contract, or design invariants. Do not duplicate the README.
