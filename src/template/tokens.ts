import type { TokenSet } from "./types.js";
import { PALETTE } from "./palette.js";

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

  return `${css}\n\n${paletteStaticsCss()}`;
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
    `:root {\n  --danger: ${PALETTE.light.danger};\n  --like: ${PALETTE.light.like};\n}`,
    "",
    `:root[data-theme="dark"] {\n  --danger: ${PALETTE.dark.danger};\n  --like: ${PALETTE.dark.like};\n}`,
  ].join("\n");
}
