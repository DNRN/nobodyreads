# Hosts extend the admin shell through the admin context

Status: Proposed — 2026-10-27

A host that embeds the admin (multi-tenant platforms in particular) owns
settings the engine knows nothing about — the author's login, email, payouts,
account deletion. Today those live outside the admin with their own layout and
navigation, so authors manage one plot in two places. The only bridge is a
single link field, `payoutSettingsHref`, on `NobodyreadsAdminContext`.
`AdminLayout.astro` is not a package export, so a host page cannot render
inside the admin chrome, and the nav array in it is closed.

We decided that **hosts add sidebar items through `NobodyreadsAdminContext`**
— a `hostNav` list of `{ group: "audience" | "settings", label, href,
icon? }` entries appended to the named engine group — and that the package
**exports `./astro/AdminLayout`** (next to `./astro/SiteLayout`) so host pages render with the
same sidebar, header, and styles. The engine stays unaware of what those pages
do.

## Considered Options

- **Engine-injected `/account` page filled by host callbacks** — keeps the
  layout private, but the engine would have to define the shape of every host
  form (password, payouts, deletion). Rejected: it pulls host concerns into
  the OSS package.
- **One more `…Href` field per host link** (the `payoutSettingsHref`
  precedent) — fine for one link, unbounded for a section. Rejected.
- **Hosts restyle their own pages to look like the admin** — no engine change,
  but the two navigations drift and the author still changes apps.
  Rejected.

## Consequences

- `AdminLayout.astro` props become a public contract; breaking them is a
  semver-major change for hosts.
- The host is responsible for auth on its own pages; the engine sidebar only
  links. Hosts already run their owner check in middleware for every admin
  path.
- `payoutSettingsHref` stays (it is a deep link inside an engine page, not a
  nav item).
