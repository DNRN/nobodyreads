# nobodyreads

A minimal, self-hosted plot engine. Markdown-first, server-rendered, zero client-side frameworks. Write for yourself — nobody reads it anyway.

## Features

- **Markdown-first** — write posts and pages in Markdown with YAML frontmatter
- **Server-rendered** — Hono API server with Astro SSR for the public site
- **Built-in admin** — browser-based editors for pages, views, site template, and media
- **Template system** — design tokens, section-based layouts, CSS/HTML generation with live preview
- **Reusable content views** — define list views once and embed with `{{view:slug}}`
- **Wiki-style links** — use `[[page-id]]` to link between pages
- **Media uploads** — local filesystem or Google Cloud Storage
- **Email subscriptions** — built-in subscriber management with pluggable providers (Mailjet included)
- **SEO built-in** — meta tags, structured data, Open Graph, sitemap-ready
- **Dark mode** — automatic theme switching with manual override
- **SQLite-powered** — Drizzle ORM with libSQL/Turso (local file or hosted)
- **Self-hostable** — run anywhere with Node.js or Docker

## Quick start

### Using npx (no install)

```bash
npx nobodyreads
```

### Install globally

```bash
npm install -g nobodyreads
nobodyreads
```

### Clone and run

```bash
git clone https://github.com/nobodyreads/nobodyreads.git
cd nobodyreads
npm install
npm run site:bootstrap
npm run dev
```

Your plot starts at `http://localhost:3000`. The admin area lives under `/admin`:

| Route | Purpose |
|-------|---------|
| `/admin` | Home (dashboard) |
| `/admin/editor` | Page/post editor |
| `/admin/media` | Media library |
| `/admin/layout` | Site template / design editor |
| `/admin/views` | Content views |
| `/admin/community` | Subscribers (audience) |
| `/admin/settings` | Site identity & settings |
| `/admin/login` | Auth (when password is set) |

### Development with Astro

The public site uses Astro for server-side rendering. In development, run both servers:

```bash
npm run dev         # Hono API server (port 3000)
npm run dev:astro   # Astro dev server (port 4321)
```

The Hono server proxies page requests to Astro in dev mode (controlled by `ASTRO_DEV_PROXY`).

- Layouts live in `astro/layouts/`
- Pages live in `astro/pages/`
- Components live in `astro/components/`
- Server helpers live in `astro/lib/`

### Production build

```bash
npm run build    # runs build:client + astro build + tsc
npm run start    # NODE_ENV=production
```

The Node server serves the built Astro SSR output from `dist/astro/`. `build:client` bundles the public browser scripts (see [Client scripts](#client-scripts)) into `public/` and runs first.

## Configuration

Copy `.env.example` to `.env`:

```env
# Database — local SQLite file (default) or Turso URL
DATABASE_URL=file:data/blog.db
TURSO_AUTH_TOKEN=

# Server
PORT=3000
NODE_ENV=development
SITE_URL=http://localhost:3000
SITE_NAME=My Blog

# Editor password (leave empty for open access)
EDITOR_PASSWORD=

# Media storage is configured via config/storage.config.json (see below),
# not environment variables. Without that file, uploads are stored locally.

# Email subscriptions are configured via config/email.config.json (see below),
# not environment variables. Without that file, subscriptions stay off.
```

## Media storage

By default, uploaded media is stored on the local filesystem (in `media/`). To
use an external destination instead, create a config file at
`config/storage.config.json`. The path can be overridden with the
`STORAGE_CONFIG` environment variable. If no file is present, storage stays
local — nothing else is required.

The file is git-ignored because it may hold credentials. A starting point is
provided at `config/storage.config.example.json`.

**Local (default):**

```json
{ "backend": "local", "dir": "media" }
```

**Google Cloud Storage** (install `@google-cloud/storage`):

```json
{
  "backend": "gcs",
  "bucket": "my-bucket",
  "keyFile": "/path/to/service-account.json",
  "publicUrl": "https://storage.googleapis.com/my-bucket"
}
```

`keyFile` is optional on GCP when using default credentials. `publicUrl`
defaults to `https://storage.googleapis.com/<bucket>`.

**Amazon S3** (install `@aws-sdk/client-s3`):

```json
{
  "backend": "s3",
  "bucket": "my-bucket",
  "region": "us-east-1",
  "accessKeyId": "...",
  "secretAccessKey": "..."
}
```

Omit `accessKeyId`/`secretAccessKey` to use the AWS default credential chain
(env, shared config, instance role). The same backend works with any
S3-compatible provider (Cloudflare R2, MinIO, DigitalOcean Spaces) by setting
`endpoint` (and optionally `forcePathStyle` / `publicUrl`):

```json
{
  "backend": "s3",
  "bucket": "my-bucket",
  "endpoint": "https://<account>.r2.cloudflarestorage.com",
  "accessKeyId": "...",
  "secretAccessKey": "...",
  "publicUrl": "https://cdn.example.com"
}
```

## Email subscriptions

Email is off by default. To enable double opt-in subscriptions and new-post
notifications, create a config file at `config/email.config.json` (override the
location with the `EMAIL_CONFIG` environment variable). The file is git-ignored
because it holds credentials; a starting point lives at
`config/email.config.example.json`.

```json
{
  "enabled": true,
  "provider": "mailjet",
  "from": { "name": "My Blog", "email": "noreply@yourdomain.com" },
  "options": { "apiKey": "...", "apiSecret": "..." }
}
```

- `enabled` — master switch; when `false` (or the file is missing) the subscribe
  form is hidden and notifications are skipped.
- `provider` — a registered provider name. `mailjet` is built in.
- `from` — sender identity used in outgoing email.
- `options` — provider-specific settings (for Mailjet: `apiKey`, `apiSecret`).

### Custom providers

Register your own provider before routes run. The factory receives the resolved
`from` identity and the `options` object from the config file:

```ts
import { registerEmailProvider } from "nobodyreads";

registerEmailProvider("sendgrid", ({ from, options }) => {
  if (typeof options.apiKey !== "string") return null;
  return new SendgridProvider(options.apiKey, from);
});
```

Then set `"provider": "sendgrid"` and the relevant `options` in
`config/email.config.json`.

## Publishing content

Write Markdown files with YAML frontmatter:

```markdown
---
title: Hello, World
slug: hello-world
date: 2025-01-15
excerpt: My first post.
kind: post
published: true
---

This is my first post.
```

Publish to the database:

```bash
npm run post -- content/hello-world.md
```

### Page kinds

- **`post`** — plot post, shown in the post listing (default)
- **`page`** — static page (e.g. About), accessible at `/:slug`
- **`home`** — the home page

### Navigation

Add a `nav` block to include a page in the site navigation:

```yaml
nav:
  label: about
  order: 1
```

### Content views

Create reusable views in **Admin > Views**, then embed them in any page:

```markdown
Welcome to my site.

{{view:latest-posts}}
```

### SEO frontmatter

```yaml
seo:
  metaDescription: "A description for search engines"
  ogImage: "https://example.com/image.jpg"
  noIndex: false
  faq:
    - question: "What is this?"
      answer: "A plot engine."
```

## Docker

```bash
docker build -t nobodyreads .
docker run -p 3000:3000 \
  -e DATABASE_URL=file:data/blog.db \
  -e SITE_NAME="My Blog" \
  -v $(pwd)/data:/app/data \
  nobodyreads
```

## Using as a library

```bash
npm install nobodyreads
```

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import {
  initDb,
  createBlogApiRoutes,
  createEditorRoutes,
  createSubscriptionApiRoutes,
  createSubscriptionAdminRoutes,
  createMediaStorage,
} from "nobodyreads";

const db = await initDb();
const storage = createMediaStorage();

const app = new Hono();

app.route("/api", createBlogApiRoutes({ db }));
app.route("/api", createSubscriptionApiRoutes({ db }));
app.route("/admin", createEditorRoutes({ db, storage }));
app.route("/admin", createSubscriptionAdminRoutes({ db }));

serve({ fetch: app.fetch, port: 3000 });
```

### Available exports

**Routers**: `createBlogApiRoutes`, `createEditorRoutes`, `createSubscriptionApiRoutes`, `createSubscriptionAdminRoutes`, `notifySubscribers`

**Database**: `initDb`, `getDb`, `getRawClient`

**Schema (Drizzle tables)**: `tenant`, `page`, `contentView`, `siteTemplate`, `siteTemplateRevision`, `siteSettings`, `media`, `subscriber`

**Content queries**: `listPosts`, `listPostsForView`, `getPageBySlug`, `getPageByKind`, `getNavItems`, `resolvePageLinks`, `listAllPages`, `getPageById`, `deletePage`, `upsertPage`, `listContentViews`, `getContentViewBySlug`, `getContentViewById`, `deleteContentView`, `upsertContentView`

**Validation (Zod)**: `pageFormSchema`, `viewFormSchema`, `siteTemplateFormSchema`, `subscribeFormSchema`, `loginFormSchema`

**HTTP utilities**: `html`, `json`, `redirect`, `serveStatic`, `parseFormBody`, `escapeHtml`

**Rendering**: `renderMarkdown`, `resolveLinks`, `resolveViews`, `renderContent`, `renderPostListView`

**SEO**: `buildMetaTags`, `buildStructuredData`, `navHref`

**Template system**: `generateCss`, `generateHtml`, `DEFAULT_TEMPLATE`

**Site template management**: `getSiteTemplate`, `getLatestSiteTemplateRevision`, `addSiteTemplateRevision`, `setCurrentSiteTemplateRevision`, `deleteSiteTemplateRevision`, and more

**Site settings**: `getSiteSettings`, `getSiteSetting`, `setSiteSetting`, `deleteSiteSetting`

**Media storage**: `createMediaStorage`, `loadStorageConfig`, `LocalMediaStorage`, `GcsMediaStorage`, `S3MediaStorage`

**Email**: `isEmailEnabled`, `createEmailProvider`, `registerEmailProvider`, `loadEmailConfig`, `listAllSubscribers`, `countSubscribers`

**Editor auth**: `editorRequiresAuth`, `isAuthenticatedRequest`, `buildSessionCookie`, `verifyEditorPassword`

**Paths**: `getPublicDir`, `getSchemaPath`, `getRobotsTxtPath`

**Types**: `Page`, `PageSummary`, `NavItem`, `ContentView`, `LayoutOptions`, `SiteTemplateDefinition`, `TokenSet`, `Tenant`, and more

## Project structure

```
nobodyreads/
├── src/
│   ├── index.ts              # Library entry point (all public exports)
│   ├── standalone.ts         # Standalone Hono server (npx nobodyreads)
│   ├── paths.ts              # Package resource path helpers
│   ├── client/              # Browser scripts (TS) bundled to public/*.js by Vite
│   ├── content/              # Plot API routes, rendering, content DB queries
│   ├── db/                   # Drizzle schema, Zod validation
│   ├── editor/               # Admin routes, auth, browser editor bundles
│   ├── media/                # Media storage backends (local, GCS, S3)
│   ├── shared/               # DB init, HTTP helpers, SEO, site settings/template
│   ├── subscription/         # Email subscription routes and DB
│   └── template/             # Theme tokens, CSS/HTML generation, section components
├── astro/
│   ├── layouts/              # SiteLayout, AdminLayout
│   ├── pages/                # Public pages, admin pages, preview routes
│   ├── components/           # Reusable Astro components
│   └── lib/                  # Server-side helpers for Astro routes
├── public/                   # Static assets (CSS, editor JS, generated client/*.js)
├── scripts/                  # Bootstrap, publish, and utility scripts
├── content/                  # Example Markdown content
├── schema.sql                # Database schema
├── Dockerfile                # Multi-stage container build
├── astro.config.mjs          # Astro configuration
├── drizzle.config.ts         # Drizzle Kit configuration
└── vitest.config.ts          # Test configuration
```

## Architecture notes

### Page transitions

`SiteLayout` uses Astro's `ClientRouter` for client-side navigation between public plot pages (home, posts, custom pages). Links are intercepted and pages are swapped with a crossfade animation rather than a full reload.

Because the header and footer are generated from a database template string rather than Astro components, `transition:persist` cannot be used directly. Instead, `view-transition-name` is applied via CSS to `.site-header` and `.site-footer`. This creates independent transition groups for those elements — since their content is identical across navigations, they appear to stay in place while only the page content transitions.

Two supporting details keep things stable:

- **`scrollbar-gutter: stable`** on `html` — reserves scrollbar space on all pages so the topbar does not shift sideways when navigating between long and short pages.
- **`astro:before-swap` listener** — copies `data-theme` from the current `<html>` element onto the incoming document before the DOM swap. Astro's swap function removes all `<html>` attributes (including `data-theme`), which would cause a flash on dark-mode sites without this preservation step.

The `AdminLayout` does not use `ClientRouter` — admin navigation uses standard full-page loads.

### Client scripts

The public site ships a small amount of progressive-enhancement JavaScript that runs outside the Astro/Svelte island system: theme + nav (`site.js`), the join/like widget (`community.js`), and the comment thread widget (`comments.js`). The sources live in `src/client/` as TypeScript and are bundled to `public/*.js` by `npm run build:client` (a thin wrapper around Vite's library mode in `scripts/build-client.ts`).

Each entry is emitted as a self-contained **IIFE** with a **stable, un-hashed filename**. The names are load-bearing and must not change:

- `site.js` and `community.js` are referenced by hardcoded `<script>` tags in the layouts.
- `comments.js` is opt-in per post and its `/comments.js` path is **persisted in tenant `scripts` arrays in the database** — renaming or hashing it would break existing content.

The generated files are git-ignored (`build:client` regenerates them, and the production `build` runs it first). They are still published with the package because the `files` array ships `public/`. Run `npm run dev:client` for a watch build while developing. Type-checking for these DOM-targeted modules uses `tsconfig.client.json`, kept separate from the Node build (`src/client/` is excluded from the main `tsconfig.json`).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run dev:astro` | Start Astro dev server |
| `npm run dev:client` | Rebuild `public/*.js` from `src/client/` on change (watch) |
| `npm run build` | Build for production (client scripts + Astro + TypeScript) |
| `npm run build:client` | Bundle `src/client/*.ts` into `public/*.js` |
| `npm run start` | Start production server |
| `npm run post -- <file>` | Publish a Markdown file to the database |
| `npm run site:bootstrap` | Bootstrap a new site with default content |
| `npm run site:use-minimal-css` | Switch to minimal CSS theme |
| `npm test` | Run tests (Vitest) |
| `npm run typecheck` | Type-check without emitting |

## License

MIT
