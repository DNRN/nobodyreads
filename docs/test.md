# Testing

The project uses [Vitest](https://vitest.dev/) for unit and integration tests. Tests live next to the code they exercise (`src/**/*.test.ts`) and run against an in-memory SQLite database — no external services or `.env` setup required.

## Quick start

```bash
npm install
npm test
```

`npm test` runs `vitest run` (single pass, exits when done). For local development, use watch mode:

```bash
npx vitest
```

Run a subset of tests:

```bash
npx vitest run src/content/db.test.ts
npx vitest run -t "listPosts"
```

Static type checking is separate from the test suite and is also run in CI:

```bash
npm run typecheck
```

## What is covered

There are six test files (108 tests total) grouped by layer:

| File | Layer | What it exercises |
|------|-------|-------------------|
| `src/exports.test.ts` | Package surface | Public barrel exports and documented subpath imports (`nobodyreads/schema`, `nobodyreads/storage`, `nobodyreads/email`) — route factories, schema tables, validation schemas, rendering, SEO, template system, media storage, auth helpers, and path utilities. |
| `src/content/db.test.ts` | Data access | Page CRUD, post listing and filtering, content views (including custom SQL validation/execution), media records, navigation helpers, link resolution, and tenant isolation. |
| `src/content/index.test.ts` | HTTP API | `createBlogApiRoutes` — `GET /posts` and `GET /posts/:slug` (published-only filtering, ordering, 404s). |
| `src/subscription/db.test.ts` | Data access | Subscriber lifecycle: add, verify, unsubscribe (by email and id), list/count, delete, email normalization, and re-subscribe after unsubscribe. |
| `src/subscription/index.test.ts` | HTTP API | `createSubscriptionApiRoutes` and `notifySubscribers` — subscribe/verify/unsubscribe flows with the email module mocked so no real provider or network is hit. |
| `src/template/template.test.ts` | Rendering | Theme validation (`validateTheme`, `normalizeComponents`), CSS generation (`generateCss`) including a snapshot for the default template, variant/token overrides, and component registry shape. |

### Test infrastructure

**Config** — `vitest.config.ts` includes only `src/**/*.test.ts`.

**Database helper** — `src/test/db.ts` exports `createTestDb()`, which:

1. Opens an in-memory libSQL/SQLite client (`:memory:`).
2. Applies `schema.sql` to create all tables.
3. Returns a Drizzle `Database` instance plus the raw client.

Most DB-layer tests call `createTestDb()` in `beforeEach` so every test starts with a clean database. `content/db.test.ts` additionally mocks `getRawClient` from `shared/db.js` where custom-view SQL execution needs the raw client.

**Snapshots** — `src/template/__snapshots__/template.test.ts.snap` stores the expected CSS output for `generateCss(DEFAULT_TEMPLATE)`. Update snapshots intentionally when default theme CSS changes:

```bash
npx vitest run -u src/template/template.test.ts
```

## What is not covered

The current suite focuses on library logic and Hono route handlers. It does **not** include:

- End-to-end or browser tests (Astro admin UI, public site pages, editor client bundles).
- Integration tests against real GCS/S3/email providers.
- The standalone CLI server (`src/standalone.ts`) or Docker image smoke tests.
- Editor/admin route factories beyond what is indirectly covered by export smoke tests.

Manual verification is still useful for admin UI changes (`npm run dev`, `npm run dev:astro`) and publish flows (`npm run post -- <file.md>`).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs `npm run typecheck` and `npm run build` on pushes and PRs to `main`. It does **not** currently run `npm test` — run the test suite locally before opening a PR.

## Adding tests

- Place new files as `src/<module>/<name>.test.ts` so Vitest picks them up automatically.
- Prefer `createTestDb()` over a real on-disk database.
- For code that sends email or hits external APIs, mock the provider module (see `subscription/index.test.ts`).
- For HTTP routes, mount the route factory on a Hono app and call `app.request()` — no listening socket required.
- Keep tests behavioral: assert on return values, HTTP status/body, and DB state rather than implementation details.
