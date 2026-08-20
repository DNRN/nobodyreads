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

## Working agreement

These rules govern *how* an agent works in this repo, not what the code does.
They apply to every agent and every tool (Claude Code, Cursor, Codex, …).

### Ask when in doubt

**Ask rather than guess.** If a request is ambiguous, underspecified, or two
readings would lead to materially different work, stop and ask before writing
code. A short clarifying question is cheaper than a confidently wrong
implementation that has to be unwound — and in a published package, wrong
guesses become someone else's breaking change.

Ask when:

- The readings diverge in scope, data model, or user-visible behavior.
- The change would touch one of the **Invariants** below (tenant-agnosticism,
  no host-specific auth, factories over instances, explicit exports).
- The change would alter the **published surface** — a `package.json`
  `exports` entry, a factory signature, the admin-context contract, the
  database schema, or the site-template contract. These are consumed by hosts
  (including nobodyreads.me) and cannot be quietly reshaped.
- It is unclear whether the behavior belongs in this generic engine or in the
  host platform. When in doubt it belongs in the host — but ask.
- Anything destructive, secret-touching, or hard to reverse is involved.

State what is ambiguous, offer 2–3 concrete options with a recommendation, and
do the unambiguous parts of the task while waiting. Read `AGENTS.md`,
`CLAUDE.md`, `docs/overview.md`, and the code before asking. If you must
proceed without an answer, say plainly which assumption you made.

### Propose architectural improvements

Agents are expected to be **opinionated about design**, not just compliant.
While working, look for improvements and surface them — especially obvious
ones: duplicated logic wanting extraction, a factory that should take a
parameter instead of branching, a route handler doing data access that belongs
in a module, a missing index, an abstraction leaking host assumptions into the
package, an unhandled failure path, a test seam that would make a module
verifiable.

- **Say it, don't smuggle it.** Propose it in your response — what is wrong,
  what you would change, what it buys. Do not silently expand the requested
  change into a refactor; the requested scope stays the deliverable.
- **Small and in-scope:** apply it inside code you were already editing and
  note it in your summary.
- **Large, cross-cutting, or surface-changing:** propose and agree first.
  Anything touching `exports`, a factory signature, or the schema is in this
  bucket by definition.
- **Note debt you deliberately walked past** rather than fixing it uninvited.

Keep every proposal tenant-agnostic and host-agnostic — that is the whole
value of this package.

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

## Commits

- **Author.** Commits use the identity already configured in git
  (`git config user.name` / `user.email`) — never override it per-commit
  (`--author`) or edit the global/repo git config to attribute work to
  someone else.
- **No AI attribution.** Do **not** add `Co-Authored-By: Claude`, any other
  agent co-author trailer, or a "Generated with …" / "🤖" footer to commit
  messages or PR bodies. An agent working here is a tool, not a contributor.
- **Precision.** Subject line under ~70 characters, imperative mood
  (`fix(admin): ...`, `feat(template): ...`), describing the actual change,
  not a vague label like "updates" or "fixes". If the change needs
  explaining beyond the subject, use a body focused on *why*, not a
  restatement of the diff. Only commit what was actually asked for — don't
  fold in unrelated cleanup.
- **One concern per commit**, and never commit this repo and
  `nobodyreads.me` in one go — separate histories, separate visibility. Land
  the change here first when it spans both.
- Commit or push only when asked.
- **Never commit on `main`.** Cut a branch before the first commit of any
  change (`git fetch origin && git checkout -b <branch> origin/main`) and
  commit there — don't commit on `main` and branch afterward. Every change
  reaches `main` only by being merged through a pull request; see Pull
  requests below.
- **`main` has a GitHub ruleset that rejects direct pushes** — "Changes must
  be made through a pull request." A `git push` to `main` will fail with
  `GH013: Repository rule violations`, even for the repo owner, even when
  `main` is only ahead of `origin/main` (never behind). If work has piled up
  on local `main` anyway, move it to a branch and open a PR into `main`
  instead of retrying the push — see Pull requests below.

## Pull requests

- **Author.** PRs are opened under the currently authenticated `gh` user
  (`gh auth status`) — never fabricate a different author, override git
  commit identity, or rewrite `user.name`/`user.email` to attribute work to
  someone else. The human is the author; no agent co-author trailers or
  "Generated with …" footers in the PR body (see Commits above).
- **Base branch.** Every PR targets `main`, and every feature branch is cut
  from an up-to-date local `main` (`git fetch origin && git checkout -b
  <branch> origin/main`) — never stacked on another unmerged branch. This
  keeps history linear and diffs scoped to just the PR's own change; if work
  genuinely depends on an unmerged PR, land that one first instead of
  stacking.
- **Precision.** Title under ~70 characters, written as a specific summary
  of the change (not "fix bug" or "update code"). The body must describe
  what changed and why, grounded in the actual diff — read every commit
  being merged, not just the latest one. Do not restate the template's
  section headers with placeholder or filler content; every claim in the
  PR body should be verifiable against the diff.
- **Test plan — required.** Never hand-wave this section. State exactly what
  a reviewer must do to prove the PR works:
  - the concrete commands (`npm run build`, `npm test`, `npm run dev`);
  - the routes, editor flows, or factory call sites to exercise, with the
    expected result for each step so "works" is falsifiable;
  - new or updated tests (`src/**/*.test.ts`) covering the change, or an
    explicit note on why the change is not unit-testable;
  - for anything touching the published surface, a check that a consumer
    still builds — `npm run build` here, then `npm run typecheck` in a
    consuming host;
  - `[x]` for steps you actually ran, `[ ]` for steps the reviewer should
    run. Do not tick a box you did not execute.
- **Breaking changes.** Call out any change to `exports`, factory
  signatures, the admin-context contract, or the schema explicitly, with the
  migration a consumer needs.
- **Template.** `.github/pull_request_template.md` defines the default body
  shape (Summary, What changed, Test plan). `gh pr create` picks it up
  automatically when no `--body`/`--body-file`/`--fill` is given; fill in
  the sections with specifics rather than leaving them templated.

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
