/**
 * Renders the canonical palette into the CSS custom-property vocabularies the
 * various surfaces speak, and splices the result into a marked region of a
 * stylesheet.
 *
 * The mechanism is exported so a host platform can generate its own chrome
 * tokens from the same palette rather than restating the hexes — see
 * `replaceGeneratedRegion` and `renderDeclarations`.
 */
import { alpha, FONTS, PALETTE, type Palette } from "./palette.js";

export type ThemeName = "light" | "dark";

/** Opening marker of a generated region. */
export const GENERATED_BEGIN =
  "/* >>> generated from the nobodyreads palette — do not edit by hand";
/** Closing marker of a generated region. */
export const GENERATED_END = "/* <<< end generated */";

/**
 * Formats a map of custom-property names to values as CSS declarations, with
 * the values column aligned so a regenerated block reads like the hand-written
 * CSS around it.
 */
export function renderDeclarations(
  declarations: Record<string, string>,
  indent = "  ",
): string {
  const width = Math.max(...Object.keys(declarations).map((k) => k.length + 1));
  return Object.entries(declarations)
    .map(([name, value]) => `${indent}${`${name}:`.padEnd(width + 1)} ${value};`)
    .join("\n");
}

/**
 * Replaces the body of the generated region in `source`.
 *
 * Throws rather than appending if the markers are missing or out of order — a
 * silent no-op here is precisely the drift this phase exists to stop.
 */
export function replaceGeneratedRegion(
  source: string,
  body: string,
  label = "",
): string {
  const begin = source.indexOf(GENERATED_BEGIN);
  const end = source.indexOf(GENERATED_END);

  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(
      `Could not find a well-formed generated region${label ? ` in ${label}` : ""}. ` +
        `Expected "${GENERATED_BEGIN}" followed by "${GENERATED_END}".`,
    );
  }

  const head = source.slice(0, begin);
  const tail = source.slice(end);
  return `${head}${GENERATED_BEGIN} */\n${body}\n${tail}`;
}

/**
 * The plot-facing token vocabulary, as used by the fallback stylesheet
 * (`public/style.css`). These names match the ones `generateTokenCss` emits
 * for a stored theme, so a site with no template and a site with the default
 * template resolve the same variables to the same values.
 */
export function fallbackDeclarations(theme: ThemeName): Record<string, string> {
  const p: Palette = PALETTE[theme];
  const declarations: Record<string, string> = {
    "--bg": p.bg,
    "--text": p.text,
    "--body-text": p.bodyText,
    "--muted": p.muted,
    "--border": p.border,
    "--surface": p.surface,
    "--accent": p.accent,
    "--accent-text": p.accentText,
    "--link": p.link,
    "--link-hover": p.linkHover,
    "--danger": p.danger,
    "--success": p.success,
  };

  if (theme === "light") {
    // Body copy, not the wordmark — the fallback sheet uses --brand-font for
    // running text. Only declared once; the dark block inherits it.
    declarations["--brand-font"] = FONTS.serif;
    declarations["--font-mono"] = FONTS.mono;
  }

  return declarations;
}

/**
 * The admin editor's `--nr-*` chrome vocabulary (`public/editor.css`).
 *
 * Overlays and shadows are tints of a palette colour rather than colours of
 * their own, so they are computed here instead of being pasted in.
 */
export function editorDeclarations(theme: ThemeName): Record<string, string> {
  const p: Palette = PALETTE[theme];
  const hoverOpacity = theme === "light" ? 0.04 : 0.05;
  const softOpacity = theme === "light" ? 0.1 : 0.14;
  const warningOpacity = theme === "light" ? 0.12 : 0.14;
  const shadowOpacity = theme === "light" ? 0.26 : 0.5;

  const declarations: Record<string, string> = {
    "--nr-bg": p.bg,
    "--nr-surface": p.surface,
    "--nr-card": p.card,
    "--nr-canvas": p.canvas,
    "--nr-nav": p.nav,
    "--nr-bar": p.bar,
    "--nr-text": p.text,
    "--nr-muted": p.muted,
    "--nr-faint": p.faint,
    "--nr-border": p.border,
    "--nr-border-strong": p.borderStrong,
    "--nr-hover": alpha(p.text, hoverOpacity),
    "--nr-accent": p.accent,
    // The fill under white text — a primary button, an active tab. It is the
    // same value as `link` by construction rather than by coincidence: both
    // want the accent darkened until 4.5:1 holds against `bg`, and a button
    // that stopped tracking the link colour would just be a second answer to
    // the same question. Split them the day they need to disagree.
    "--nr-accent-strong": p.link,
    "--nr-accent-bright": p.accentBright,
    "--nr-accent-text": p.accentText,
    "--nr-accent-soft": p.accentSoft,
    "--nr-chip-text": p.chipText,
    "--nr-accent-tint": p.accentTint,
    // The editor's chrome links are ink, going accent on hover — unlike a
    // plot's body links, they are not sitting in running prose.
    "--nr-link": p.text,
    "--nr-link-hover": p.accent,
    "--nr-success": p.success,
    "--nr-success-soft": p.successSoft,
    "--nr-danger": p.danger,
    "--nr-danger-soft": alpha(p.danger, softOpacity),
    "--nr-warning": p.warning,
    "--nr-warning-bright": p.warningBright,
    "--nr-warning-soft": alpha(p.warning, warningOpacity),
    "--nr-code": p.bodyText,
    "--nr-codebg": p.codeBg,
    "--nr-overlay": p.overlay,
    "--nr-overlay-text": p.overlayText,
    "--nr-danger-overlay": p.dangerOverlay,
    "--nr-shadow": `0 8px 24px -18px ${alpha(p.shadowInk, shadowOpacity)}`,
    "--nr-shadow-lg": `0 30px 60px -34px ${alpha(p.shadowInk, shadowOpacity)}`,
  };

  if (theme === "light") {
    // Mirrors the platform chrome so the admin matches the site around it.
    // Declared once; the dark block inherits all three.
    declarations["--nr-font"] = FONTS.sans;
    declarations["--nr-font-mono"] = FONTS.mono;
    // Screen titles, post titles and the editor canvas — the editorial voice.
    // UI chrome (labels, buttons, controls) never uses this.
    declarations["--nr-font-serif"] = FONTS.serif;
  }

  return declarations;
}

/**
 * Emits a complete pair of `:root` blocks, light then dark.
 *
 * The generated region owns whole blocks rather than a span inside one, so the
 * braces stay balanced and shape tokens (radius, widths) can live in a plain
 * hand-authored `:root` block alongside — CSS merges them.
 */
function renderThemeBlocks(
  declarationsFor: (theme: ThemeName) => Record<string, string>,
  options: { indent?: string; colorScheme?: boolean; darkComment?: string } = {},
): string {
  const { indent = "  ", colorScheme = false, darkComment } = options;
  const lines: string[] = [":root {"];

  if (colorScheme) lines.push(`${indent}color-scheme: light;`);
  lines.push(renderDeclarations(declarationsFor("light"), indent), "}", "");

  if (darkComment) lines.push(darkComment);
  lines.push(':root[data-theme="dark"] {');
  if (colorScheme) lines.push(`${indent}color-scheme: dark;`);
  lines.push(renderDeclarations(declarationsFor("dark"), indent), "}");

  return lines.join("\n");
}

/** The full generated body for `public/style.css`. */
export function renderFallbackCss(): string {
  return renderThemeBlocks(fallbackDeclarations, {
    colorScheme: true,
    darkComment:
      "/* Studio after dark — activated by site.js (sets data-theme on <html>). */",
  });
}

/** The full generated body for `public/editor.css`. */
export function renderEditorCss(): string {
  return renderThemeBlocks(editorDeclarations, { indent: "\t" });
}
