# A published item's path change leaves a redirect

Status: Proposed — 2026-10-27

Authors will be able to turn a post into a page and back. The two kinds live at
different public paths (`/posts/:slug` vs `/:slug`, `src/render.ts`), and a
post that was already emailed or picked up by feed readers has its old URL in
inboxes and RSS clients. Today any path change on published content — kind
switch or slug rename — orphans the old URL with a plain 404; there is no
redirect or slug-history mechanism anywhere in `src/`.

We decided that **whenever a published item's public path changes, the old
path is recorded** in a new `page_redirect(tenant_id, from_path, page_id)`
table, and the public 404 path consults it and answers **301 to the item's
current URL, resolved live from `page_id`**. Because the target is resolved at
request time, a chain of renames collapses to one hop, and deleting the item
removes its redirects (FK cascade) so they 404 again.

## Considered Options

- **Block kind switches once a post is published** — no new table, but it
  makes "promote this post to a page" impossible exactly when it matters (the
  post proved worth keeping). Rejected.
- **Store `from_path → to_path` strings** — simpler lookup, but every later
  rename must rewrite all older rows or create chains. Rejected for the live
  `page_id` target.
- **Keep a single `previous_slug` column on `page`** — covers one rename only
  and not the kind switch. Rejected.

## Consequences

- Slug renames of published content get the same protection for free; the
  editor's "best changed before publishing" hint can soften.
- `from_path` is unique per tenant; claiming a path that a redirect holds
  (publishing a new item at it) deletes the redirect — live content wins.
- Saves that would collide on `UNIQUE(slug, kind, tenant_id)` are pre-checked
  and return 409 with a readable message instead of the current raw 500.
