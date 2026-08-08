/**
 * The named choices Design's Theme tab offers, as data.
 *
 * They live here rather than in the Svelte island so the visual controls, the
 * AI proposal and any future preset importer all agree on what "Spacious" or
 * "Soft" means. Each preset is a patch over `TokenSet`, so applying one is a
 * merge and nothing else in the theme is disturbed.
 */
import { FONTS } from "./palette.js";
import type { TokenSet } from "./types.js";

/**
 * Stacks the browser can render without a webfont request.
 *
 * Every family in {@link TYPE_PAIRINGS} must either be one of these or be in the
 * font `<link>` that `astro/layouts/SiteLayout.astro` hardcodes — offering a
 * pairing nobody loads renders as a silent fallback, which looks like a bug.
 */
const SYSTEM_SERIF = "Georgia, 'Times New Roman', serif";
const SYSTEM_SANS =
  "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export interface TypePairing {
  id: string;
  label: string;
  /** Body / reading face. */
  font: string;
  /** UI chrome and the wordmark. */
  brandFont: string;
}

export const TYPE_PAIRINGS: TypePairing[] = [
  {
    id: "newsreader-hanken",
    label: "Newsreader + Hanken Grotesk",
    font: FONTS.serif,
    brandFont: FONTS.sans,
  },
  {
    id: "hanken",
    label: "Hanken Grotesk throughout",
    font: FONTS.sans,
    brandFont: FONTS.sans,
  },
  {
    id: "newsreader",
    label: "Newsreader throughout",
    font: FONTS.serif,
    brandFont: FONTS.serif,
  },
  {
    id: "system-serif",
    label: "System serif",
    font: SYSTEM_SERIF,
    brandFont: SYSTEM_SANS,
  },
  {
    id: "system-sans",
    label: "System sans",
    font: SYSTEM_SANS,
    brandFont: SYSTEM_SANS,
  },
];

export interface DensityStep {
  id: string;
  label: string;
  lineHeight: string;
  containerPadding: string;
}

/** Ordered loosest-last, so a slider reads left-to-right as "more air". */
export const DENSITY_STEPS: DensityStep[] = [
  { id: "compact", label: "Compact", lineHeight: "1.45", containerPadding: "1.25rem" },
  { id: "cosy", label: "Cosy", lineHeight: "1.55", containerPadding: "1.75rem" },
  { id: "comfortable", label: "Comfortable", lineHeight: "1.7", containerPadding: "2.5rem" },
  { id: "spacious", label: "Spacious", lineHeight: "1.85", containerPadding: "3.25rem" },
];

export interface CornerStep {
  id: string;
  label: string;
  radius: string;
}

export const CORNER_STEPS: CornerStep[] = [
  { id: "sharp", label: "Sharp", radius: "0" },
  { id: "soft", label: "Soft", radius: "4px" },
  { id: "round", label: "Round", radius: "12px" },
];

/**
 * The colours the Theme tab puts up front, and the ones it keeps behind "more".
 *
 * Three leading swatches is the comp's calm default; the rest are real tokens an
 * author may still need, so they are one disclosure away rather than absent.
 */
export interface ColorSlot {
  key: keyof TokenSet;
  label: string;
  primary: boolean;
}

export const COLOR_SLOTS: ColorSlot[] = [
  { key: "text", label: "Ink", primary: true },
  { key: "accent", label: "Accent", primary: true },
  { key: "bg", label: "Paper", primary: true },
  { key: "bodyText", label: "Body text", primary: false },
  { key: "muted", label: "Muted", primary: false },
  { key: "border", label: "Border", primary: false },
  { key: "link", label: "Link", primary: false },
  { key: "accentText", label: "On accent", primary: false },
];

/** Which pairing a token set currently matches, or null for a hand-rolled one. */
export function matchTypePairing(tokens: Pick<TokenSet, "font" | "brandFont">): string | null {
  return (
    TYPE_PAIRINGS.find((p) => p.font === tokens.font && p.brandFont === tokens.brandFont)?.id ??
    null
  );
}

/** Which density step a token set matches, or null. */
export function matchDensityStep(
  tokens: Pick<TokenSet, "lineHeight" | "containerPadding">,
): string | null {
  return (
    DENSITY_STEPS.find(
      (d) => d.lineHeight === tokens.lineHeight && d.containerPadding === tokens.containerPadding,
    )?.id ?? null
  );
}

/** Which corner step a radius matches. Absent radius reads as the default. */
export function matchCornerStep(radius: string | undefined): string | null {
  const value = radius ?? "4px";
  return CORNER_STEPS.find((c) => c.radius === value)?.id ?? null;
}
