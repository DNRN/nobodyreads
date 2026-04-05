# nobodyreads

A minimal, self-hosted blog engine. Markdown-first, server-rendered, zero client-side frameworks. Write for yourself — nobody reads it anyway.

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

The blog starts at `http://localhost:3000`. The admin area lives under `/admin`:

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard |
| `/admin/editor` | Page/post editor |
| `/admin/views` | Content views |
| `/admin/media` | Media library |
| `/admin/settings` | Site settings |
| `/admin/layout` | Site template editor |
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
npm run build    # runs astro build && tsc
npm run start    # NODE_ENV=production
```

The Node server serves the built Astro SSR output from `dist/astro/`.

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

# Media storage — "local" (default) or "gcs"
MEDIA_STORAGE=local
MEDIA_DIR=media
# GCS_BUCKET=
# GCS_KEY_FILE=
# GCS_PUBLIC_URL=https://storage.googleapis.com/your-bucket

# Email subscriptions (optional)
EMAIL_ENABLED=false
EMAIL_PROVIDER=mailjet
EMAIL_FROM_NAME=My Blog
EMAIL_FROM_EMAIL=noreply@yourdomain.com
MAILJET_API_KEY=
MAILJET_API_SECRET=
```

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

This is my first blog post.
```

Publish to the database:

```bash
npm run post -- content/hello-world.md
```

### Page kinds

- **`post`** — blog post, shown in the post listing (default)
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
      answer: "A blog engine."
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

**Media storage**: `createMediaStorage`, `LocalMediaStorage`, `GcsMediaStorage`

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
│   ├── content/              # Blog API routes, rendering, content DB queries
│   ├── db/                   # Drizzle schema, Zod validation
│   ├── editor/               # Admin routes, auth, browser editor bundles
│   ├── media/                # Media storage backends (local, GCS)
│   ├── shared/               # DB init, HTTP helpers, SEO, site settings/template
│   ├── subscription/         # Email subscription routes and DB
│   └── template/             # Theme tokens, CSS/HTML generation, section components
├── astro/
│   ├── layouts/              # SiteLayout, AdminLayout
│   ├── pages/                # Public pages, admin pages, preview routes
│   ├── components/           # Reusable Astro components
│   └── lib/                  # Server-side helpers for Astro routes
├── public/                   # Static assets (CSS, bundled editor JS)
├── scripts/                  # Bootstrap, publish, and utility scripts
├── content/                  # Example Markdown content
├── schema.sql                # Database schema
├── Dockerfile                # Multi-stage container build
├── astro.config.mjs          # Astro configuration
├── drizzle.config.ts         # Drizzle Kit configuration
└── vitest.config.ts          # Test configuration
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run dev:astro` | Start Astro dev server |
| `npm run build` | Build for production (Astro + TypeScript) |
| `npm run start` | Start production server |
| `npm run post -- <file>` | Publish a Markdown file to the database |
| `npm run site:bootstrap` | Bootstrap a new site with default content |
| `npm run site:use-minimal-css` | Switch to minimal CSS theme |
| `npm run build:site-editor` | Bundle the site template editor |
| `npm run build:page-editor` | Bundle the page editor |
| `npm run build:view-editor` | Bundle the view editor |
| `npm test` | Run tests (Vitest) |
| `npm run typecheck` | Type-check without emitting |

## License

MIT
