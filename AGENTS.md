# AGENTS.md — nobodyreads

`nobodyreads` is a self-hosted, single-tenant plot engine published as an npm
package. It is also designed to be embedded as a library by other hosts (e.g.
multi-tenant platforms like nobodyreads.me).

A self-hosted instance can run in three modes depending on federation config:

- **Standalone** — no federation; fully independent.
- **Auxiliary plot** — `FEDERATION_ISSUER_URL` points to a hub (e.g.
  `https://nobodyreads.me`); users from the hub can sign in, comment, and
  join the community without a separate account.
- **Auxiliary plot + discovery** — same as above, plus the instance exposes
  `/.well-known/nobodyreads/catalog` and opts into the hub's Explore index.

The federation module in this package (`src/federation/`) is the **relying
party / OAuth2 client** side only. The authorization server (hub) is the
responsibility of the host platform (nobodyreads.me in the reference
implementation).

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
- **Federation client** (`src/federation/`) — OAuth2 relying-party routes
  (`createFederatedAuthRoutes`). When `FEDERATION_*` env vars are set, readers
  can sign in via an external hub (e.g. nobodyreads.me). This is the **client
  side only**; the hub / authorization server lives in the host platform.
- **Export API** (planned) — `GET /admin/export` generates a portable archive
  (Markdown files, settings JSON, subscriber CSV, media) for data portability.
- **Discovery catalog** (planned) — `GET /.well-known/nobodyreads/catalog`
  exposes public post metadata for hub discovery indexing (Mode 3 self-hosting).
- **Standalone server** — `src/standalone.ts` wires everything together for
  the `npx nobodyreads` CLI use case.
- **Documentation** — `docs/` holds architecture notes and recorded design
  decisions. Start with `docs/overview.md` for how the system is composed.
  The README covers setup and usage; `docs/` is for durable context that
  outlives a single PR.

## Documentation

Keep `docs/` in sync when you change how the system works — not for every
bugfix or cosmetic tweak, but whenever a contributor would be misled by
stale architecture notes.

**Update `docs/` when you:**

- Add, remove, or rename a major module, route factory, or package export
- Change request routing, the dev/prod split, or how Astro and Hono interact
- Alter the data model, content pipeline, template system, or admin context contract
- Introduce or retire a design invariant (auth split, tenant model, config shape, etc.)
- Move admin pages, change the `nobodyreadsAdmin` integration, or shift what hosts must wire

**Prefer updating an existing doc** (usually `docs/overview.md`) over adding a
new file. Add a new doc only when the topic is large enough to stand alone
(e.g. a future `docs/embedding.md` for multi-tenant hosts).

**Do not duplicate the README.** `docs/` explains *why* and *how things fit
together; the README explains *how to run and configure* the project.

If you are unsure whether a change warrants a doc update, update
`docs/overview.md` — stale docs are worse than slightly verbose ones.

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
docs/
  overview.md             # architecture overview and design decisions
```

## Common commands

```bash
npm install          # install deps
npm run build        # tsc + astro build
npm run dev          # watch mode
npm test             # run tests (if/when present)
```
