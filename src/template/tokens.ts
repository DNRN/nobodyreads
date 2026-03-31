import type { TokenSet } from "./types.js";

const TOKEN_VAR_MAP: Record<keyof TokenSet, string> = {
  bg: "--bg",
  text: "--text",
  muted: "--muted",
  border: "--border",
  accent: "--accent",
  link: "--link",
  linkHover: "--link-hover",
  brandInk: "--brand-ink",
  brandAccent: "--brand-accent",
  brandBg: "--brand-bg",
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

  return css;
}
