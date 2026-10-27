# Subscriber email is an explicit, once-only publish choice

Status: Proposed — 2026-10-27

Today a post emails every verified subscriber as a side effect of its first
save with `published` on (`src/admin/server/modules/content.ts`, the
`!wasPreviouslyPublished` check). The author is never told this will happen,
cannot publish without emailing, and — because "first publish" is derived from
the row's *current* `published` flag — unpublishing and republishing emails
everyone again. Distribution is the thing authors most need to understand, and
it is the least visible part of the editor.

We decided that **emailing subscribers is a choice the author makes in the
publish dialog**, carried on the save as a `notify` field, and that **a post is
emailed at most once**, recorded in a new nullable `page.notified_at` column
(ISO timestamp). The dialog shows the checkbox ticked by default when the plot
has verified subscribers and the post has never been emailed; a published post
that was never emailed offers "Email subscribers now" later. Pages are never
emailed.

## Considered Options

- **Keep the implicit first-publish email, just explain it in the UI** — no
  schema change, but the author still cannot publish quietly (fixing a typo
  after an unpublish re-sends) and the re-send bug stays. Rejected: the
  behaviour, not only its wording, is the problem.
- **Derive "already emailed" from an email log table** — richer (per-recipient
  status), but the engine has no send log today and the dialog needs one bit.
  Rejected as premature; `notified_at` does not preclude a log later.
- **A separate `POST /editor/:id/publish` endpoint** — cleaner verb, but the
  editor's autosave already writes `published` through `/editor/save`, and two
  write paths for the same flag would drift. Rejected: `notify` rides on the
  existing save and is only consulted on the publish transition.

## Consequences

- One column added through the usual three-place contract (Drizzle def,
  `schema.sql`, `migrateColumns()`). Existing published posts are backfilled
  with `notified_at = COALESCE(updated, date)` so nothing already sent is ever
  re-sent.
- `/editor/save` without `notify` (API callers, the no-JS form) publishes
  **without** email — a behaviour change, documented in `docs/overview.md`.
  The `npm run post` CLI has no dialog and keeps emailing on first publish,
  through the same once-only claim (`notifySubscribersOnce`).
- `onContentPublished` (host screening hook) keeps firing on the publish
  transition, independent of email.
