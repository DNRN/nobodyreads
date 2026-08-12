/**
 * Resolve the absolute origin a site's public URLs are built from.
 *
 * A single-tenant install has one origin and can leave `siteUrl` unset, letting
 * `SITE_URL` answer for the whole process. A host that serves several sites
 * from one process cannot: reading the environment once at import time freezes
 * every canonical, `og:url` and feed link to whichever site the environment
 * happened to name. Such hosts pass the origin explicitly per call.
 *
 * Order is therefore argument → environment → localhost, and the trailing
 * slash is stripped so callers can concatenate a pathname without doubling it.
 */
export function resolveSiteUrl(siteUrl?: string): string {
  return (
    siteUrl ||
    process.env.SITE_URL ||
    `http://localhost:${process.env.PORT || 3000}`
  ).replace(/\/$/, "");
}

/** Resolve the site's display name, used in `og:site_name`, feeds and emails. */
export function resolveSiteName(siteName?: string): string {
  return siteName || process.env.SITE_NAME || "nobodyreads.me";
}
