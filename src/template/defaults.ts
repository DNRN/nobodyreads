import type { SiteTemplateDefinition } from "./types.js";

export const DEFAULT_TEMPLATE: SiteTemplateDefinition = {
  tokens: {
    // Aligned with the "Studio" palette the admin editor ships
    // (public/editor.css :root, the --nr-* tokens): calm sage-green surfaces,
    // a sage accent, Newsreader serif for reading + IBM Plex Mono for UI
    // chrome, so a freshly created site feels like the editor that made it.
    light: {
      bg: "#eef1ec", // --nr-bg
      text: "#23302a", // --nr-text
      muted: "#7c8a82", // --nr-muted
      border: "#e4eae3", // --nr-border
      // Secondary body tone (post excerpts, supporting copy) — --nr-code.
      accent: "#415147",
      // The editor accent (#4e8a6b) deepened to clear 4.5:1 on --bg, because
      // unlike the editor's chrome these links sit inside running body text.
      link: "#40765b",
      linkHover: "#23302a",
      brandInk: "#23302a",
      brandAccent: "#4e8a6b", // --nr-accent, exactly as the editor's wordmark dot
      brandBg: "#eef1ec",
      // The editor's wordmark: Hanken Grotesk 800, tightly tracked.
      brandFont:
        "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      logoWeight: "800",
      logoTracking: "-0.02em",
      font: "'Newsreader', Georgia, 'Times New Roman', serif",
      fontMono: "'IBM Plex Mono', 'Menlo', 'Consolas', monospace",
      fontSize: "18px",
      lineHeight: "1.7",
      maxWidth: "680px",
      containerPadding: "1.5rem",
    },
    dark: {
      // Studio after dark (public/editor.css :root[data-theme="dark"]).
      bg: "#141a17",
      text: "#e8efe9",
      muted: "#8fa096",
      border: "#2a342e",
      accent: "#b9cabf",
      link: "#6fb894",
      linkHover: "#e8efe9",
      brandInk: "#e8efe9",
      brandAccent: "#6fb894",
      brandBg: "#141a17",
    },
  },
  sections: [
    {
      type: "header",
      enabled: true,
      showHero: false,
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
    postPreview: { variant: "default" },
    nav: { variant: "inline" },
  },
};
