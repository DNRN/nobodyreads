/**
 * The collection embed token — `{{collection:slug}}`.
 *
 * This module exists because the pattern was previously restated in four places
 * (render, teaser redaction, editor dirty-detection, the Milkdown node), and a
 * change to the syntax could land in one and not the others.
 *
 * No imports on purpose — the Milkdown plugins that need it are bundled for the
 * browser.
 */

/** Slug grammar. */
const SLUG = "[a-z0-9-]+";

/** The token name. */
export const EMBED_TOKEN_NAME = "collection";

/** Alternation fragment for embedding in a larger pattern. Group 1 is the slug. */
export const EMBED_TOKEN_SOURCE = `\\{\\{${EMBED_TOKEN_NAME}:(${SLUG})\\}\\}`;

/**
 * A **fresh** global regex matching the token; group 1 is the slug.
 *
 * New object per call, deliberately. A module-level global regex carries
 * `lastIndex` across callers, so the second caller silently starts mid-string
 * and misses the first token — the kind of bug that only shows up once two
 * code paths run in one request.
 */
export function embedTokenPattern(): RegExp {
  return new RegExp(EMBED_TOKEN_SOURCE, "g");
}

/** The token text for `slug`. */
export function embedToken(slug: string): string {
  return `{{${EMBED_TOKEN_NAME}:${slug}}}`;
}

/** Whether `text` contains at least one embed token. */
export function hasEmbedToken(text: string): boolean {
  return embedTokenPattern().test(text);
}

// --- Site tokens — `{{siteName}}`, `{{year}}`, `{{any_custom_key}}` ---------

/**
 * Key grammar for a site token, matching the `customTokens` key validation in
 * `theme-io.ts` (a JS identifier). Underscores are legal and load-bearing here:
 * a key like `my_token` is what forced these to be modelled as a Milkdown atom
 * node, because the Markdown serializer escapes `_` in plain text and would
 * write back `{{my\_token}}`.
 */
const TOKEN_KEY = "[a-zA-Z_][a-zA-Z0-9_]*";

/**
 * Alternation fragment for a site token. Group 1 is the key.
 *
 * Does **not** match `{{collection:slug}}` — a colon is not an identifier
 * character — so the two can sit in one alternation without competing.
 */
export const SITE_TOKEN_SOURCE = `\\{\\{(${TOKEN_KEY})\\}\\}`;

/** A **fresh** global regex matching a site token; group 1 is the key. */
export function siteTokenPattern(): RegExp {
  return new RegExp(SITE_TOKEN_SOURCE, "g");
}
