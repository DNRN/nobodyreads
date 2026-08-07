import type { SiteTemplateDefinition } from "./types.js";
import { FONTS, PALETTE } from "./palette.js";

/**
 * The theme a site gets before anyone has saved one.
 *
 * Every colour here comes from `palette.ts` — this file must not introduce a
 * literal of its own. That duplication is exactly how a freshly created site
 * came to look nothing like the editor that made it.
 */
export const DEFAULT_TEMPLATE: SiteTemplateDefinition = {
  tokens: {
    light: {
      bg: PALETTE.light.bg,
      text: PALETTE.light.text,
      bodyText: PALETTE.light.bodyText,
      muted: PALETTE.light.muted,
      border: PALETTE.light.border,
      accent: PALETTE.light.accent,
      accentText: PALETTE.light.accentText,
      link: PALETTE.light.link,
      linkHover: PALETTE.light.linkHover,
      // brandInk / brandAccent deliberately unset — the wordmark follows
      // `text` and `accent` so the brand can't drift from the palette.
      brandFont: FONTS.sans,
      logoWeight: "800",
      logoTracking: "-0.02em",
      font: FONTS.serif,
      fontMono: FONTS.mono,
      fontSize: "16px",
      lineHeight: "1.7",
      // Wider than the reading column on purpose: prose is capped separately so
      // a card grid and a filter row have room the paragraphs do not want.
      maxWidth: "900px",
      containerPadding: "2.5rem",
    },
    dark: {
      bg: PALETTE.dark.bg,
      text: PALETTE.dark.text,
      bodyText: PALETTE.dark.bodyText,
      muted: PALETTE.dark.muted,
      border: PALETTE.dark.border,
      accent: PALETTE.dark.accent,
      accentText: PALETTE.dark.accentText,
      link: PALETTE.dark.link,
      linkHover: PALETTE.dark.linkHover,
    },
  },
  sections: [
    {
      type: "header",
      enabled: true,
      showHero: true,
      showTagline: true,
      logoText: "nobodyreads",
      logoDotText: "me",
    },
    {
      type: "content",
      enabled: true,
    },
    {
      type: "footer",
      enabled: true,
      showWordmark: true,
    },
  ],
  components: {
    postPreview: { variant: "auto" },
    nav: { variant: "inline" },
  },
};
