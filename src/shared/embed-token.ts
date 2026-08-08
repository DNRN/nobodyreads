/**
 * The collection embed token — `{{collection:slug}}` — and its permanent alias.
 *
 * `{{view:slug}}` was the original spelling. It stays valid for ever: it is
 * sitting in stored Markdown in every database written before the rename, and
 * a rename does not get to invalidate content. Both spellings parse; only the
 * current one is ever written by new code.
 *
 * This module exists because the pattern was previously restated in four places
 * (render, teaser redaction, editor dirty-detection, the Milkdown node) and a
 * fifth spelling would have had to be added to all four.
 *
 * No imports on purpose — the Milkdown plugins that need it are bundled for the
 * browser.
 */

/** Slug grammar, shared by both spellings. */
const SLUG = "[a-z0-9-]+";

/** Accepted token names, current spelling first. */
export const EMBED_TOKEN_NAMES = ["collection", "view"] as const;

export type EmbedTokenName = (typeof EMBED_TOKEN_NAMES)[number];

/** The current spelling — what new tokens are written as. */
export const EMBED_TOKEN_NAME: EmbedTokenName = "collection";

/** Alternation fragment for embedding in a larger pattern. */
export const EMBED_TOKEN_SOURCE = `\\{\\{(${EMBED_TOKEN_NAMES.join("|")}):(${SLUG})\\}\\}`;

/**
 * A **fresh** global regex matching either spelling: group 1 is the name, group
 * 2 the slug.
 *
 * New object per call, deliberately. A module-level global regex carries
 * `lastIndex` across callers, so the second caller silently starts mid-string
 * and misses the first token — the kind of bug that only shows up once two
 * code paths run in one request.
 */
export function embedTokenPattern(): RegExp {
  return new RegExp(EMBED_TOKEN_SOURCE, "g");
}

/** The token text for `slug`, in the current spelling. */
export function embedToken(slug: string): string {
  return `{{${EMBED_TOKEN_NAME}:${slug}}}`;
}

/** Whether `text` contains at least one embed token, in either spelling. */
export function hasEmbedToken(text: string): boolean {
  return embedTokenPattern().test(text);
}
