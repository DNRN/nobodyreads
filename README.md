# nobodyreads

A minimal, self-hosted blog engine. Markdown-first, server-rendered, zero client-side frameworks. Write for yourself — nobody reads it anyway.

## Features

- **Markdown-first** — write posts and pages in Markdown with YAML frontmatter
- **Server-rendered** — pure HTML responses, no client JS frameworks
- **Built-in editor** — browser-based Markdown editor with optional password protection
- **Wiki-style links** — use `[[page-id]]` to link between pages
- **SEO built-in** — meta tags, structured data, Open Graph, sitemap-ready
- **Dark mode** — automatic theme switching with manual override
- **SQLite-powered** — uses libSQL/Turso for storage (local file or hosted)
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
git clone https://github.com/yourusername/nobodyreads.git
cd nobodyreads
npm install
npm run site:bootstrap
npm run dev
```

The blog starts at `http://localhost:3000`. The admin overview is at `http://localhost:3000/admin` and the editor is at `http://localhost:3000/admin/editor`.

If you're editing HTML with Astro, run the dev server in a second terminal:

```bash
npm run dev:astro
```

With `ASTRO_DEV_PROXY=1` (default), the Node server proxies page requests to Astro in dev.

### Editing HTML/CSS with Astro

- HTML lives in `astro/layouts/` and `astro/pages/` as `.astro` files.
- Reusable UI lives in `astro/components/`.
- Styles are the same as before in `public/style.css` (Astro serves `public/` directly).

Workflow for quick edits:
1. Run `npm run dev` and `npm run dev:astro`.
2. Change `.astro` files for HTML structure and `public/style.css` for styling.
3. Refresh (or let Astro HMR update the page).

### Production build and serve

Build the production SSR bundle:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

The Node app serves the built Astro SSR output from `dist/astro/`.

## Configuration

Create a `.env` file (see `.env.example`):

```env
# Database — local SQLite file (default) or Turso URL
DATABASE_URL=file:data/blog.db
TURSO_AUTH_TOKEN=

# Server
PORT=3000
NODE_ENV=development

# Astro (dev + proxy)
ASTRO_DEV_URL=http://localhost:4321
ASTRO_DEV_PROXY=1

# Site identity
SITE_URL=http://localhost:3000
SITE_NAME=My Blog

# Editor password (leave empty to disable auth)
EDITOR_PASSWORD=
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

`nobodyreads` can also be used as an npm package to build your own blog:

```bash
npm install nobodyreads
```

```typescript
import {
  initDb,
  createBlogRouter,
  createEditorRouter,
  serveStatic,
  getPublicDir,
} from "nobodyreads";
import { createServer } from "node:http";

const db = await initDb();

const blogHandler = createBlogRouter({ db });
const editorHandler = createEditorRouter({ db });

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const { pathname } = url;

  // Serve static assets (CSS, JS) from the package
  const served = await serveStatic(res, pathname, getPublicDir());
  if (served) return;

  // Admin routes
  if (pathname.startsWith("/admin")) {
    return editorHandler(req, res, pathname);
  }

  // Blog routes
  await blogHandler(req, res, pathname);
});

server.listen(3000);
```

### Available exports

**Routers**: `createBlogRouter`, `createEditorRouter`

**Database**: `initDb`, `getDb`, `listPosts`, `getPageBySlug`, `getPageByKind`, `getNavItems`, `listAllPages`, `getPageById`, `deletePage`, `upsertPage`

**HTTP utilities**: `html`, `json`, `redirect`, `serveStatic`, `parseFormBody`, `escapeHtml`

**Templates**: `defaultLayout`, `createBlogLayoutWithAuth`, `homePage`, `postPage`, `contentPage`, `notFoundPage`

**Rendering**: `renderMarkdown`, `resolveLinks`

**SEO**: `buildMetaTags`, `buildStructuredData`, `navHref`

**Paths**: `getPublicDir`, `getSchemaPath`, `getRobotsTxtPath`

**Types**: `Page`, `PageSummary`, `NavItem`, `LayoutFn`, `LayoutOptions`, etc.

## Project structure

```
nobodyreads/
├── src/
│   ├── index.ts          # Package entry point (exports)
│   ├── standalone.ts     # Standalone server (used by `npx nobodyreads`)
│   ├── paths.ts          # Package resource path helpers
│   ├── blog/             # Blog engine (routing, DB, rendering, templates)
│   ├── editor/           # Markdown editor (routing, auth, templates)
│   └── shared/           # Database init, HTTP utilities, SEO, types
├── public/               # Static assets (CSS, JS)
├── content/              # Example Markdown content
├── scripts/              # Content publishing script
├── schema.sql            # Database schema
└── Dockerfile            # Container build
```

## License

MIT
