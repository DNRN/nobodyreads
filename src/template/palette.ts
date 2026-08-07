/**
 * The canonical "Studio" palette — the single source of truth for colour in
 * this package.
 *
 * **This is the only module in `src/` allowed to contain a colour literal.**
 * `palette.test.ts` fails the build if a hex or a hued `rgb()/rgba()` appears
 * anywhere else under `src/`, and if the generated `:root` blocks in
 * `public/style.css` / `public/editor.css` have fallen behind this file.
 *
 * Four surfaces derive from here, and they used to be four hand-synced copies
 * that drifted twice:
 *
 *   1. `DEFAULT_TEMPLATE` — a freshly created site's theme (defaults.ts)
 *   2. `public/style.css` — the pre-template fallback stylesheet (generated)
 *   3. `public/editor.css` — the admin editor's own chrome (generated)
 *   4. the host platform's chrome — via the `PALETTE` export
 *
 * Regenerate 2 and 3 with `npm run build:palette` (it runs as part of
 * `npm run build`).
 */

/** One theme's worth of colour. Every value is a bare colour literal. */
export interface Palette {
  /** Page background. */
  bg: string;
  /** One step off `bg` — header bars, code blocks, tinted panels. */
  surface: string;
  /** Cards, panels, inputs sitting on `surface`. */
  card: string;
  /** Primary text: headlines, strong copy. */
  text: string;
  /** Secondary running copy — post excerpts, supporting paragraphs, code. */
  bodyText: string;
  /** Meta lines, captions, timestamps. */
  muted: string;
  /** Group labels, placeholders, tertiary text. */
  faint: string;
  /** Hairline borders. */
  border: string;
  /** The interactive brand colour: button fills, focus rings, wordmark dot. */
  accent: string;
  /** Foreground on an `accent` fill. */
  accentText: string;
  /** Active nav pills, soft chips. */
  accentSoft: string;
  /** Hover washes, info panels. */
  accentTint: string;
  /**
   * `accent` adjusted to clear 4.5:1 on `bg`, for links inside running body
   * text. A button fill can use `accent` directly; a 18px link cannot.
   */
  link: string;
  /** Link hover. */
  linkHover: string;
  /** "Published", positive confirmations. */
  success: string;
  /** Positive badge background. */
  successSoft: string;
  /** Destructive actions, form errors. */
  danger: string;
  /** Cautions, unsaved-changes notices. */
  warning: string;
  /** Code panel background. */
  codeBg: string;
  /**
   * The "liked" heart. An affordance colour rather than a brand one — it reads
   * as a heart in any theme, so it does not shift between light and dark.
   */
  like: string;
  /** Base tone for shadows — a green-black, not a neutral black. */
  shadowInk: string;
}

export const PALETTE: { light: Palette; dark: Palette } = {
  light: {
    bg: "#eef1ec",
    surface: "#f7f9f6",
    card: "#ffffff",
    text: "#23302a",
    bodyText: "#415147",
    muted: "#7c8a82",
    faint: "#9aa79f",
    border: "#e4eae3",
    accent: "#4e8a6b",
    accentText: "#ffffff",
    accentSoft: "#ddece3",
    accentTint: "#eef6f1",
    link: "#40765b",
    linkHover: "#23302a",
    success: "#4e8a6b",
    successSoft: "#e7f0ea",
    danger: "#b4443a",
    warning: "#b07a2e",
    codeBg: "#f2f5f1",
    like: "#e0245e",
    shadowInk: "#1e3228",
  },
  dark: {
    bg: "#141a17",
    surface: "#1a211d",
    card: "#1f2823",
    text: "#e8efe9",
    bodyText: "#b9cabf",
    muted: "#8fa096",
    faint: "#6c7d72",
    border: "#2a342e",
    accent: "#6fb894",
    accentText: "#0f1512",
    accentSoft: "#25382d",
    accentTint: "#1c2822",
    // Dark backgrounds do not need the contrast correction light ones do, so
    // links are the accent itself.
    link: "#6fb894",
    linkHover: "#e8efe9",
    success: "#6fb894",
    successSoft: "#1e3329",
    danger: "#e0796f",
    warning: "#d8a558",
    codeBg: "#161c19",
    like: "#e0245e",
    shadowInk: "#000000",
  },
};

/**
 * Type-face stacks. Here for the same reason the colours are: they were
 * restated in the template defaults, both stylesheets, and the platform.
 */
export const FONTS = {
  /** Long-form reading. */
  serif: "'Newsreader', Georgia, 'Times New Roman', serif",
  /** UI chrome and the wordmark. */
  sans: "'Hanken Grotesk', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  /** Code. */
  mono: "'IBM Plex Mono', 'Menlo', 'Consolas', ui-monospace, monospace",
} as const;

/**
 * A palette colour at partial opacity, as an `rgba()` string.
 *
 * Overlays (hover washes, soft badge fills, shadows) are tints of a palette
 * colour rather than colours in their own right, so they are computed here
 * instead of being pasted in as another literal to keep in step.
 */
export function alpha(hex: string, opacity: number): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;

  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`alpha(): expected a 3- or 6-digit hex colour, got "${hex}"`);
  }

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
