import type { TokenSet } from "./types.js";
import { alpha, PALETTE } from "./palette.js";

const TOKEN_VAR_MAP: Record<keyof TokenSet, string> = {
  bg: "--bg",
  text: "--text",
  bodyText: "--body-text",
  muted: "--muted",
  border: "--border",
  accent: "--accent",
  accentText: "--accent-text",
  link: "--link",
  linkHover: "--link-hover",
  brandInk: "--brand-ink",
  brandAccent: "--brand-accent",
  brandFont: "--brand-font",
  logoWeight: "--logo-weight",
  logoTracking: "--logo-tracking",
  font: "--font",
  fontMono: "--font-mono",
  fontSize: "--font-size",
  lineHeight: "--line-height",
  maxWidth: "--max-width",
  containerPadding: "--container-padding",
  radius: "--radius-base",
};

function tokenBlock(tokens: Partial<TokenSet>): string {
  return Object.entries(tokens)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => `  ${TOKEN_VAR_MAP[key as keyof TokenSet]}: ${value};`)
    .join("\n");
}

export function generateTokenCss(
  light: TokenSet,
  dark: Partial<TokenSet>,
): string {
  const lightVars = tokenBlock(light);
  let css = `:root {\n  color-scheme: light dark;\n${lightVars}\n}`;

  const darkEntries = Object.entries(dark).filter(([, v]) => v !== undefined);
  if (darkEntries.length > 0) {
    const darkVars = tokenBlock(dark);
    css += `\n\n:root[data-theme="dark"] {\n${darkVars}\n}`;
  }

  return `${css}\n\n${paletteStaticsCss()}\n\n${derivedTokenCss()}`;
}

/**
 * Colours the engine owns rather than the theme.
 *
 * A theme has no say over what an error message looks like, but component CSS
 * still needs *some* red — and hardcoding one meant three different reds none
 * of which changed in dark mode. These come from the palette and are emitted
 * alongside the theme's own tokens so components can say `var(--danger)`.
 *
 * Deliberately not part of `TokenSet`: adding them there would grow the shape
 * of every stored theme and need a migration, for a colour no one edits.
 */
function paletteStaticsCss(): string {
  return [
    "/* Engine-owned colours — not theme-editable. */",
    `:root {\n  --danger: ${PALETTE.light.danger};\n  --like: ${PALETTE.light.like};\n  --shadow-sm: 0 1px 2px ${alpha(PALETTE.light.shadowInk, 0.06)};\n  --shadow-md: 0 4px 12px ${alpha(PALETTE.light.shadowInk, 0.08)};\n}`,
    "",
    `:root[data-theme="dark"] {\n  --danger: ${PALETTE.dark.danger};\n  --like: ${PALETTE.dark.like};\n  --shadow-sm: 0 1px 2px ${alpha(PALETTE.dark.shadowInk, 0.4)};\n  --shadow-md: 0 4px 12px ${alpha(PALETTE.dark.shadowInk, 0.5)};\n}`,
  ].join("\n");
}

/**
 * Surfaces and shapes the design needs that a `TokenSet` does not carry.
 *
 * Cards, tinted panels and chips are *steps off* a theme's own background and
 * accent rather than colours in their own right, so they are mixed here from
 * the tokens above instead of being added to `TokenSet` — which would grow the
 * shape of every stored theme and need a migration. Mixing rather than pinning
 * palette values also means a plot themed blue gets blue chips: pinning them
 * would give every custom theme the default green.
 *
 * The step direction differs per theme: in light a card sits *above* the page
 * (toward white), in dark it sits toward the text colour. Everything else
 * mixes toward `--text` and so works unchanged in both.
 */
function derivedTokenCss(): string {
  return `/* Derived from the theme's own tokens — not theme-editable. */
:root {
  --bg-tint: color-mix(in oklab, var(--bg) 94%, var(--text));
  --bg-card: color-mix(in oklab, var(--bg) 88%, white);
  --border-strong: color-mix(in oklab, var(--border) 80%, var(--text));
  --chip-bg: color-mix(in oklab, var(--bg) 82%, var(--accent));
  --chip-fg: var(--link);
  /* The UI/body face. Follows the brand face so a theme picks one sans, not two. */
  --font-ui: var(--brand-font);
  /* The scale derives from the theme's --radius-base so one control moves
     every rounded surface. The fallback is the scale as it stood before the
     token existed, so a theme that omits it is unchanged. */
  --radius-sm: calc(var(--radius-base, 4px) / 2);
  --radius: var(--radius-base, 4px);
  --radius-lg: calc(var(--radius-base, 4px) * 2);
  /* Running prose is capped at this; the container itself is wider so card
     grids and filter rows can use the full measure. */
  --reading-width: 40rem;
}

:root[data-theme="dark"] {
  --bg-card: color-mix(in oklab, var(--bg) 90%, var(--text));
}`;
}
