# AGENTS.md — nobodyreads

`nobodyreads` is a self-hosted, single-tenant blog engine published as an npm
package. It is also designed to be embedded as a library by other hosts (e.g.
multi-tenant platforms).

## Tooling

- **Package manager:** npm. This is an OSS project and contributors expect
  `npm install` / `npm run <script>` to work out of the box. Do not switch to
  pnpm or yarn.
- **Language:** TypeScript, ESM (`"type": "module"`).
- **Astro** for SSR of the public site and the admin UI.
- **Hono** for the HTTP layer.

## What lives here

- **Hono route factories** (`src/**/routes.ts`) — `createEditorRoutes`,
  `createBlogApiRoutes`, `createSubscriptionApiRoutes`, etc. Each takes an
  explicit `{ db, storage, tenantId, urlPrefix }` so it can be mounted under
  any path by any host.
- **Astro admin UI** — pages live in `astro/_injected/admin/` and are exposed
  via the `nobodyreadsAdmin` integration (`src/astro/integration.ts`). They
  are **not** file-system-routed; hosts wire them in through `injectRoute`.
- **Admin context** — `src/astro/context.ts` defines `NobodyreadsAdminContext`
  (`tenantId`, `adminBase`, `editorBase`, `siteBase`, `loginHref`). Pages read
  it from `Astro.locals.nobodyreadsAdmin`; hosts must populate it via Astro
  middleware before any injected page renders.
- **Standalone server** — `src/standalone.ts` wires everything together for
  the `npx nobodyreads` CLI use case.

## Invariants this package must preserve

1. **Tenant-agnostic.** Nothing in this package may assume a single tenant,
   or that the admin lives at `/admin`. Always take `tenantId` and URL
   prefixes as parameters, or read them from `Astro.locals.nobodyreadsAdmin`.
2. **No host-specific auth.** Admin pages must not call `guardAuth` or hit
   platform sessions directly. Authentication is the host's responsibility;
   by the time a request reaches an injected page, the host's middleware has
   already approved it and populated the admin context.
3. **Routes are factories, not instances.** Export functions that return a
   configured Hono app; don't export a pre-built app that binds tenant or
   URL prefix at import time.
4. **Published surface is explicit.** Anything consumers import must go
   through a `package.json` `exports` entry. Keep runtime assets (CSS,
   injected `.astro` files) listed under `files`.

## Repo layout cheatsheet

```
src/
  index.ts                # package barrel
  standalone.ts           # CLI entry
  astro/                  # integration + context for injected admin UI
  admin/server/           # editor route factories
  content/                # posts, pages, views
  subscription/           # subscribers + email
  media/                  # storage (fs + GCS)
astro/
  _injected/admin/        # admin pages (not auto-routed — injected)
  layouts/, components/   # shared Astro building blocks
  pages/                  # only non-admin file-system routes (e.g. login)
```

## Common commands

```bash
npm install          # install deps
npm run build        # tsc + astro build
npm run dev          # watch mode
npm test             # run tests (if/when present)
```
