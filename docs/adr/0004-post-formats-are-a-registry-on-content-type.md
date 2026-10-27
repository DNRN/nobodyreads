# Post formats are a registry on `content_type`, not new kinds

Status: Proposed — 2026-10-27

Posts already come in two formats — text and audio episodes (`content_type`
NULL or `'audio'`) — and video is next. The admin offers no format choice at
creation: an author makes a text post and then finds the "This post is an
episode" checkbox in the settings drawer. A single "New post" entry point with
a format menu needs one place that knows, per format, its label, its editor
"hero" (none, audio upload, video upload), whether it can be a page (no), and
which distribution channels it has (web, email, RSS, podcast feed).

We decided that **a format is a post attribute stored in `content_type`, and
the engine keeps one `POST_FORMATS` registry** that the create menu, the
editor's format switch, the publish dialog, and the content list all read.
Video joins as one registry entry plus its media pipeline, not as a new
`kind`. The **format is persisted as intent on drafts**: a draft may have
`content_type = 'audio'` before its audio is uploaded; the *publish* gate, not
the save gate, requires the media. The read model exposes `format` separately
from `episode`, which stays "an episode always has audio".

## Considered Options

- **Video/audio as new `kind` values** — kinds govern URL shape and listing,
  and audio/video posts share both with text posts. Rejected: it would fork
  every `kind = 'post'` query (feeds, sitemap, notify) per medium.
- **Keep format as an editor toggle only** — no create-time choice; an author
  who wants to publish an episode never sees the word "episode" until they
  open a drawer. Rejected for discoverability.
- **Keep "no format without media" at save time** — the current rule; picking
  "Audio episode" and leaving before the upload finishes would silently reopen
  as a text post. Rejected.

## Consequences

- `validation.ts` widens `content_type` to accept `'audio'` without
  `audio_media_id` on drafts; publishing such a post returns 400 with "add
  audio first". Feeds and rendering are unchanged — they already require the
  media join.
- Pages stay text-only: switching an audio/video post to a page requires
  switching its format back to text first (the dialog says so).
- Phase "video" work adds `'video'` to the enum and one registry entry; the
  create menu, dialog and list pick it up without edits.
