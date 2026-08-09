/**
 * The families a site can actually render.
 *
 * The public layout used to hardcode one Google Fonts request — the same three
 * families for every site, whatever its theme said. That made two things true
 * at once: a theme could never use a fourth family, and the Theme tab had to
 * offer only those three while the AI was free to invent any stack it liked and
 * have it silently fall back.
 *
 * This is the single answer to "can we render that?". `SiteLayout` builds its
 * font request from the theme's own tokens through {@link fontLinkHref}, the
 * type pairings are built from these entries, and the AI theme diff is
 * constrained to these stacks.
 *
 * It governs the *guided* paths only. A stack written by hand in template code
 * simply does not match an entry and gets no request — exactly as an unlisted
 * family behaved before — so someone loading their own face through custom CSS
 * is unaffected.
 */

export type FontRole = "serif" | "sans" | "mono";

export interface FontFamily {
  id: string;
  label: string;
  /** The CSS value written into the theme's token. */
  stack: string;
  /**
   * The `family=` value for a Google Fonts css2 request, or null for a stack
   * the browser already has.
   */
  googleSpec: string | null;
  role: FontRole;
}

/**
 * Deliberately small. Every entry is a decision about what suits the product,
 * and the weights in each spec are the ones the theme actually uses — asking
 * for more is bytes a reader pays for and nobody sees.
 */
export const FONT_CATALOGUE: FontFamily[] = [
  {
    id: "newsreader",
    label: "Newsreader",
    stack: "'Newsreader', Georgia, 'Times New Roman', serif",
    googleSpec: "Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400;1,6..72,500",
    role: "serif",
  },
  {
    id: "hanken-grotesk",
    label: "Hanken Grotesk",
    stack:
      "'Hanken Grotesk', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    googleSpec: "Hanken+Grotesk:wght@400;500;600;700;800",
    role: "sans",
  },
  {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    stack: "'IBM Plex Mono', 'Menlo', 'Consolas', ui-monospace, monospace",
    googleSpec: "IBM+Plex+Mono:wght@400;500",
    role: "mono",
  },
  {
    id: "system-serif",
    label: "System serif",
    stack: "Georgia, 'Times New Roman', serif",
    googleSpec: null,
    role: "serif",
  },
  {
    id: "system-sans",
    label: "System sans",
    stack: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    googleSpec: null,
    role: "sans",
  },
  {
    id: "system-mono",
    label: "System mono",
    stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    googleSpec: null,
    role: "mono",
  },
];

const BY_STACK = new Map(FONT_CATALOGUE.map((family) => [family.stack, family]));

/** Every stack the catalogue knows — what the AI and the pairings may choose from. */
export const CATALOGUE_STACKS = FONT_CATALOGUE.map((family) => family.stack);

/**
 * Stacks suitable for a role.
 *
 * Roles are not decoration: a monospace token filled with a serif breaks every
 * code block on the site, so the choices offered for each slot are narrowed to
 * the families that belong in it.
 */
export function stacksForRoles(...roles: FontRole[]): string[] {
  return FONT_CATALOGUE.filter((family) => roles.includes(family.role)).map((f) => f.stack);
}

export function fontFamilyById(id: string): FontFamily | undefined {
  return FONT_CATALOGUE.find((family) => family.id === id);
}

/**
 * The catalogue entry for a token value, or undefined for a stack written by
 * hand. Matched exactly: a near-miss is not a match, because guessing which
 * webfont someone meant is how you end up requesting the wrong one.
 */
export function familyForStack(stack: string | undefined): FontFamily | undefined {
  return stack ? BY_STACK.get(stack) : undefined;
}

/**
 * A single Google Fonts css2 URL covering the given stacks, or null when none
 * of them needs one.
 *
 * Returning null matters: a theme built from system stacks should make no
 * network request at all, and a theme using one family should not pay for
 * three.
 */
export function fontLinkHref(stacks: (string | undefined)[]): string | null {
  const specs = [
    ...new Set(
      stacks
        .map((stack) => familyForStack(stack)?.googleSpec)
        .filter((spec): spec is string => Boolean(spec)),
    ),
  ].sort();

  if (specs.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${specs.map((s) => `family=${s}`).join("&")}&display=swap`;
}
