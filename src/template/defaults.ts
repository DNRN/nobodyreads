import type { SiteTemplateDefinition } from "./types.js";

export const DEFAULT_TEMPLATE: SiteTemplateDefinition = {
  tokens: {
    light: {
      bg: "#fdfdfd",
      text: "#2c2c2c",
      muted: "#7a7a7a",
      border: "#e0e0e0",
      accent: "#555",
      link: "#2c2c2c",
      linkHover: "#000",
      brandInk: "#111111",
      brandAccent: "#2563EB",
      brandBg: "#ffffff",
      brandFont:
        '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      logoWeight: "600",
      logoTracking: "0.02em",
      font: "'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontMono: "'Menlo', 'Consolas', monospace",
      fontSize: "18px",
      lineHeight: "1.7",
      maxWidth: "680px",
      containerPadding: "1.5rem",
    },
    dark: {
      bg: "#0f1115",
      text: "#e6e6e6",
      muted: "#9ca3af",
      border: "#252a30",
      accent: "#2563EB",
      link: "#e6e6e6",
      linkHover: "#ffffff",
      brandInk: "#e6e6e6",
      brandBg: "#0f1115",
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
    postPreview: "default",
    nav: "inline",
  },
};
