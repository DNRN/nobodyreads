import type { SiteTemplateDefinition } from "./types.js";

export const DEFAULT_TEMPLATE: SiteTemplateDefinition = {
  tokens: {
    // Aligned with the nobodyreads.me "Forest & Oat" palette
    // (nobodyreads.me/astro/styles/tokens.css :root): oatmeal surfaces, a
    // deep-moss accent, Newsreader serif for reading + IBM Plex Mono for UI
    // chrome, so a freshly created site feels like it belongs to the platform.
    light: {
      bg: "#f1efe2",
      text: "#23271d",
      muted: "#7e8068",
      border: "#dcdcc8",
      accent: "#4b5142",
      link: "#456a3a",
      linkHover: "#23271d",
      brandInk: "#23271d",
      brandAccent: "#456a3a",
      brandBg: "#f1efe2",
      brandFont: "'Newsreader', Georgia, 'Times New Roman', serif",
      logoWeight: "500",
      logoTracking: "0",
      font: "'Newsreader', Georgia, 'Times New Roman', serif",
      fontMono: "'IBM Plex Mono', 'Menlo', 'Consolas', monospace",
      fontSize: "18px",
      lineHeight: "1.7",
      maxWidth: "680px",
      containerPadding: "1.5rem",
    },
    dark: {
      // Forest after dark (nobodyreads.me/astro/styles/landing.css).
      bg: "#1a1e16",
      text: "#ecead6",
      muted: "#7e856c",
      border: "#2a3022",
      accent: "#aeb39c",
      link: "#9bbd76",
      linkHover: "#ecead6",
      brandInk: "#ecead6",
      brandAccent: "#9bbd76",
      brandBg: "#1a1e16",
    },
  },
  sections: [
    {
      type: "header",
      enabled: true,
      showHero: true,
      showTagline: true,
      logoText: "nobody_reads",
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
    postPreview: { variant: "default" },
    nav: { variant: "inline" },
  },
};
