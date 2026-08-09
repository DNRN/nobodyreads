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
  /**
   * The writing surface itself — the editor canvas, a shade *lighter* than
   * `bg` so the page being written sits above the app around it. Dark themes
   * have nowhere lighter to go, so there it simply equals `bg`.
   */
  canvas: string;
  /** The left navigation rail — a shade recessed from `bg`. */
  nav: string;
  /** Top bars and tool bars: the strip a screen's actions live in. */
  bar: string;
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
  /** Input outlines and dividers that have to hold their own against `border`. */
  borderStrong: string;
  /** The interactive brand colour: button fills, focus rings, wordmark dot. */
  accent: string;
  /**
   * `accent` lifted for emphasis rather than darkened for contrast: the
   * "live / saved" status dot and accent highlights that sit *on* a surface
   * rather than carrying text. Never put text on this.
   */
  accentBright: string;
  /** Foreground on an `accent` fill. */
  accentText: string;
  /** Active nav pills, soft chips. */
  accentSoft: string;
  /** Text and icons on an `accentSoft` chip. */
  chipText: string;
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
  /** Cautions, unsaved-changes notices — the readable one, for text. */
  warning: string;
  /** The same caution as a dot or a fill, where nothing has to be legible on it. */
  warningBright: string;
  /** Code panel background. */
  codeBg: string;
  /**
   * A deliberately dark surface that stays dark in *both* themes: tooltips,
   * the selection toolbar, block hover bars, code blocks. Contextual controls
   * read as "floating above the document" precisely because they don't follow
   * the theme, so this is not `surface` under another name.
   */
  overlay: string;
  /** Text on `overlay`. Theme-independent, for the same reason. */
  overlayText: string;
  /**
   * Destructive actions *on* `overlay` — the delete icon in a block's hover
   * bar. `danger` is tuned to carry on a light page and goes muddy on the dark
   * bar, so this is a lighter tint of the same red, and likewise
   * theme-independent.
   */
  dangerOverlay: string;
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
    canvas: "#f4f7f2",
    nav: "#e7ece4",
    bar: "#f3f6f1",
    text: "#23302a",
    bodyText: "#415147",
    muted: "#7c8a82",
    faint: "#9aa79f",
    border: "#e4eae3",
    borderStrong: "#c3d0c8",
    accent: "#4e8a6b",
    accentBright: "#4e8a6b",
    accentText: "#ffffff",
    accentSoft: "#ddece3",
    chipText: "#2f6249",
    accentTint: "#eef6f1",
    link: "#40765b",
    linkHover: "#23302a",
    success: "#4e8a6b",
    successSoft: "#e7f0ea",
    danger: "#b4443a",
    // Dark enough to clear 4.5:1 on `bg` as running text — a caution nobody can
    // read is not a caution. `warningBright` carries the eye-catching end.
    warning: "#a06a1f",
    warningBright: "#d79a2b",
    codeBg: "#f2f5f1",
    overlay: "#1c2621",
    overlayText: "#e8efe9",
    dangerOverlay: "#f0a8a0",
    like: "#e0245e",
    shadowInk: "#1e3228",
  },
  dark: {
    bg: "#141a17",
    surface: "#1a211d",
    card: "#1f2823",
    // Nothing sits above `bg` in a dark theme the way paper sits above a desk,
    // so the canvas and the nav are the background; only the bars lift.
    canvas: "#141a17",
    nav: "#141a17",
    bar: "#1a211d",
    text: "#e8efe9",
    bodyText: "#b9cabf",
    muted: "#8fa096",
    faint: "#6c7d72",
    border: "#2a342e",
    borderStrong: "#39463f",
    accent: "#6fb894",
    accentBright: "#86c8a6",
    accentText: "#0f1512",
    accentSoft: "#25382d",
    chipText: "#6fb894",
    accentTint: "#1c2822",
    // Dark backgrounds do not need the contrast correction light ones do, so
    // links are the accent itself.
    link: "#6fb894",
    linkHover: "#e8efe9",
    success: "#6fb894",
    successSoft: "#1e3329",
    danger: "#e0796f",
    // A mid-amber already reads on a dark ground, so the dot and the text are
    // the same colour here; only the light theme has to split them.
    warning: "#d8a558",
    warningBright: "#d8a558",
    codeBg: "#161c19",
    // Darker than `bg`, so a floating bar still separates from the page.
    overlay: "#0b0f0d",
    overlayText: "#e8efe9",
    dangerOverlay: "#f0a8a0",
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
