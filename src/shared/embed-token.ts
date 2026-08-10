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
