import { defineComponent } from "../component-definition.js";
import { siteButtonRules, siteInputRules } from "../form-primitives.js";

const BASE_CSS = `*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* Two faces, two jobs: --font is the display serif for headings and post
   titles; --font-ui is the sans for anything a reader reads a paragraph of.
   Headings opt back into the serif below rather than the page defaulting to
   it. */
html {
  font-size: var(--font-size);
  line-height: var(--line-height);
  color: var(--text);
  background: var(--bg);
  font-family: var(--font-ui);
  -webkit-font-smoothing: antialiased;
}

body {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font);
  font-weight: 500;
  letter-spacing: -0.015em;
}

a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; color: var(--link-hover); }

/* padding-inline, not the shorthand: <main> is itself a .container, and a
   shorthand here silently zeroed any vertical padding main tried to set. */
.container {
  width: 100%;
  max-width: var(--max-width);
  margin: 0 auto;
  padding-inline: var(--container-padding);
}

/* The reading column, narrower than the container it sits in. Card grids and
   filter rows deliberately keep the full width — only running prose is capped,
   because a 90-character measure is hard to read and a card grid is not. */
.post-header,
.post-body,
.page-body,
.home-intro,
.site-hero__text {
  max-width: var(--reading-width);
}

main {
  flex: 1;
  padding-block: 2.75rem 4rem;
}

.loading {
  color: var(--muted);
  font-style: italic;
  font-size: 0.9rem;
}

.error {
  color: var(--danger);
  font-style: italic;
  font-size: 0.9rem;
}

${siteInputRules(".site-input")}

${siteButtonRules(".site-button")}`;

export const baseComponent = defineComponent({
  name: "base",
  label: "Base styles",
  defaultVariant: "default",
  tokens: [],
  variants: {
    default: { label: "Default", css: "" },
  },
  baseCss: BASE_CSS,
});

/** @deprecated Use baseComponent.css() via the registry */
export function baseCss(): string {
  return baseComponent.css("default");
}
