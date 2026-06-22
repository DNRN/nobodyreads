# Admin & Editor Reorganization — Plan

This document describes the staged plan to reorganize the **nobodyreads** admin
and editor so it is easier to work on (for contributors) and easier to use (for
the people running a site). It is the source of truth for this effort; update it
as phases complete.

For the *why* behind the architecture see [`docs/overview.md`](docs/overview.md).

---

## Background: what was clumsy

**For users (UI):**

- Six flat navigation items — `Dashboard, Content, Media, Layout, Views,
  Settings` — with no hierarchy and overlapping meaning. A non-technical user
  can't predict what lives where.
- **Site identity** (name, logo, favicon, social image) was edited from *inside*
  the Content page (`/admin/editor/site`) — but it is conceptually Settings.
- **Media** was both a top-level destination and a modal inside the editor.
- **Views** were top-level but only meaningful embedded in content.
- The Content page stacked five things at once (create cards, site identity,
  home, pages table, posts table).

**For contributors (DX):**

- A single feature was smeared across four places joined by stringly-typed
  element IDs: the `.astro` markup, the imperative `querySelector` wiring in
  `src/admin/client/*`, the type list, and the Hono save handler.
- The browser editor bundles were huge — `page-editor.js` ~1.5 MB,
  `site-editor.js` ~1.9 MB, `view-editor.js` ~1.1 MB — because each esbuild
  IIFE bundled the *entire* CodeMirror + every language pack independently, with
  no shared chunk and no lazy loading.
- One 1,790-line `editor.css` for the whole admin.

**What we keep:** the two-runtime split (Astro shell + Hono mutation factories),
route-factories-not-instances, the tenant-agnostic boundary, Markdown as the
source of truth, and progressive-enhancement form POSTs that work without JS.

---

## Locked decisions

1. **Editor** → WYSIWYG (ProseMirror-based, leaning **Milkdown** for its
   markdown-native round-trip) with a **Write/Source toggle**. Markdown stays
   the source of truth; the WYSIWYG serializes to Markdown on save, so the data
   portability promise is unaffected.
2. **Admin client tech** → **Astro islands + Svelte**, scoped to the admin
   surfaces only. The public site stays zero-framework (invariant intact).
3. **Boundaries** → keep the admin **in-repo** and harden the internal boundary
   ("a package within the package"). No separate repo / monorepo split now;
   promote later only if the platform needs to diverge.

---

## Target information architecture

Five areas that match user mental models **and** leave a home for every
roadmap phase (so we don't re-org each release):

| Area | Today | Grows into (roadmap) |
|------|-------|----------------------|
| **Home** | Dashboard: "Write a post" CTA, recent posts, setup checklist | activity, earnings glance |
| **Content** | Posts, Pages, Media | Audio (P6), Video (P7) as content types |
| **Design** | Theme/Layout, reusable Views (blocks) | AI theme assistant (P3) |
| **Community** | Subscribers | Comments + moderation (P1/P4), members |
| **Settings** | Site identity, email, advanced | Custom domain (P8), Export (P11), Federation |

Two headline IA fixes: move **Site identity** to Settings, and demote **Views**
and **Media** from the top of the mental model into where they're used.

---

## Phases

### Phase 0 — Harden the boundary + fix the build  *(enabling, no UX change)*

- Switch the admin client build from three standalone esbuild IIFEs to an **ESM
  code-split** build with a shared CodeMirror chunk and lazy language packs —
  removes the ~4.5 MB duplication.
- Update injected `<script>` tags to `type="module"`.
- Stand up the **Svelte island** foundation (`@astrojs/svelte@7`, `svelte@5` —
  the Astro 5–compatible line) and enable the `svelte()` integration so later
  phases can replace imperative wiring with components. The public site stays
  zero-framework: it ships no islands, so the Svelte runtime is never sent
  there.

**Done when:** the editors still work, total shipped admin JS drops via a shared
chunk, and a Svelte admin island can be authored.

### Phase 1 — IA + navigation reorg  *(biggest perceived win, no new runtime deps)*

- Rework `AdminLayout` navigation into the five grouped areas above.
- **Move the Site identity entry out of Content into Settings.**
- Rebuild the dashboard into a real **Home**: prominent "Write a post" CTA,
  recent posts, first-run guidance.
- Introduce a **Community** area (subscribers today; comments later).
- Slim the Content page to just content (posts, pages, home).
- CSS reorganization to follow alongside componentization (Phase 2) to avoid
  visual regressions.

**Done when:** the nav reflects the five-area model, site identity lives under
Settings, and the dashboard leads with writing a post.

### Phase 2 — Componentize editors as Svelte islands

- Collapse `PageEditorForm.astro` + `page-editor.ts` (+ its types) into a single
  typed Svelte island; same for the view and site/template editors.
- Removes the `querySelector`-by-ID glue; markup and behavior live together.
- Keep the form-POST path as the no-JS fallback.
- Split `editor.css` into per-area files as components move.

**Done (2026-06-22):** all three editors are now Svelte islands in
`astro/components/admin/`, hydrated with `client:load` and bundled by
Astro/Vite (which shares one CodeMirror chunk across them via the
`nobodyreads/editor` export):

- `PageEditor.svelte` and `ViewEditor.svelte` — full idiomatic rewrites owning
  their own reactive state; the `querySelector`-by-id wiring is gone. Each keeps
  a no-JS form-POST fallback.
- `SiteEditor.svelte` — owns the form markup and bootstraps the heavier,
  proven `createSiteEditor` orchestration via element refs (a deeper reactive
  rewrite of that module is deferred — low value, real risk). The Theme
  import/export and Revisions sections stay server-rendered Astro around it.

The esbuild `build:editors` script, its `entries/`, the old `public/*-editor.js`
bundles and `public/chunks/` are all removed. `PageEditorForm.astro` /
`ViewEditorForm.astro` are deleted. The `createPageEditor` / `createViewEditor`
/ `createSiteEditor` helpers remain exported from `nobodyreads/editor` for
library consumers.

> **Follow-up before publishing to npm:** the islands ship as source
> (`astro/components/admin`), so library consumers' Astro build compiles them and
> needs their build deps. Move `svelte` + the `@codemirror/*` / `codemirror`
> packages from `devDependencies` to `dependencies` (or peer), and document that
> hosts must add the `svelte()` integration. The standalone app in this repo
> already works because those deps are installed locally.

CSS was **not** split into per-area files (deferred): the islands kept the
existing global `editor.css` class names, so no styling rewrite was needed.

### Phase 3 — WYSIWYG editor (Milkdown) + Source toggle

- **De-risk first:** prototype Markdown round-trip fidelity for the custom
  syntax — `[[wiki-links]]`, `{{view:slug}}` embeds, and image size/align hints
  (`![alt|400px|right]`). This is the single gating risk.

**Prototype result (2026-06-22) — GREEN.** `prototype/milkdown-roundtrip.ts`
(run `npx tsx prototype/milkdown-roundtrip.ts`) exercises the remark (mdast)
layer Milkdown is built on. Findings:

- Naive remark **corrupts wiki links** — `[[page-id]]` is serialized as
  `\[\[page-id]]` because the markdown serializer escapes brackets in plain
  text. (View embeds and image hints survive naively.)
- Representing `[[…]]` and `{{view:…}}` as **dedicated mdast nodes** (a remark
  transform + a to-markdown handler) round-trips all four constructs verbatim
  and is **idempotent** across repeated saves.
- The plugin in the prototype is written in the exact shape Milkdown accepts via
  `$remark`; the only remaining Phase 3 work for these is the standard
  ProseMirror `$node` spec per construct.
- Image size/align hints are free — they live inside standard image alt text,
  which remark/Milkdown preserve unescaped.

Decision: Milkdown is viable. Model `[[wiki]]` and `{{view:slug}}` as atom
nodes (never plain text) so escaping can never touch them.

**Built & verified (2026-06-22) — full Milkdown shipped.** The page editor is
now a Milkdown **Crepe** WYSIWYG island (`astro/components/admin/PageEditor.svelte`):

- Custom atom-node plugins for `[[wiki]]` and `{{view:slug}}` live in
  `src/admin/client/milkdown/` (`nobodyreads/editor/milkdown`).
- **Crepe's ImageBlock feature is disabled** — it rewrites the image alt slot
  (storing an aspect ratio), which destroyed our `![alt|400px|right]` hints.
  Images use plain commonmark nodes + a drag/paste uploader
  (`@milkdown/kit/plugin/upload`) so alt text round-trips verbatim.
- ProseMirror is deduped in `astro.config.mjs` (`vite.resolve.dedupe`) — Milkdown
  ships nested copies and breaks with more than one instance.
- The standalone server now serves the Astro client build (`dist/astro/client`,
  `/_astro/*`); without this, **no island hydrated in production** (the old
  CodeMirror editors only worked because they loaded from `public/`).
- Markdown stays the source of truth (Crepe serializes on change); a Source
  toggle swaps to a raw textarea, which is also the no-JS fallback.

End-to-end verified in real Chrome (`prototype/verify-milkdown.mjs`): editor
mounts, wiki/view render as chips, and all four constructs — `[[hello-world]]`,
`[[about|the about page]]`, `{{view:latest-posts}}`,
`![A photo|400px|right](/media/x.jpg)` — round-trip verbatim.
- Custom nodes: wiki link, view-embed (placeholder block, optionally live via
  the existing `/editor/preview`), image-with-hints.
- Write/Source toggle (Milkdown ↔ CodeMirror source).
- Keep the server `/editor/preview` endpoint for accurate view/link rendering.

### Phase 4 — Polish

- Empty states, onboarding checklist, save toasts, draft autosave, keyboard
  shortcuts.

**Progress (2026-06-22):** the page editor now has **AJAX save with toasts**,
**debounced draft autosave** (creates the page on first autosave for new posts,
then updates in place via `history.replaceState`), and **Ctrl/Cmd+S**. The
no-JS form-post path still works — `POST /editor/save` returns JSON only when
the request asks for it. Editor surface also: fills the pane, theme-matched
fonts/accent, centered readable column. Onboarding checklist shipped in Phase 1.
Remaining: broader empty states.

---

## Sequencing & risk

- Phases 0–2 are safe and each shippable on its own; the visible "less clumsy"
  win lands in Phase 1 before the WYSIWYG arrives.
- Phase 3 is the only high-risk phase — prototype round-trip fidelity before
  committing. If Milkdown can't preserve the custom syntax cleanly, reconsider
  the editor, not the whole plan.

## Status

- [x] Phase 0 — build code-split + Svelte island foundation enabled
- [x] Phase 1 — IA + navigation reorg
- [x] Phase 2 — componentize editors (page, view, site editors are all Svelte islands)
- [x] Phase 3 — Milkdown WYSIWYG page editor (custom nodes, image uploader, source toggle; verified)
- [ ] Phase 4 — polish
