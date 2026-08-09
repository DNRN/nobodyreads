import { defineComponent } from "../component-definition.js";

const BASE_CSS = `.site-header {
  padding: var(--header-padding-block, 1rem) 0 var(--header-padding-bottom, 1rem);
  border-bottom: 1px solid var(--header-border-color, var(--border));
}

.nav-bar {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  position: relative;
}

.site-logo {
  text-decoration: none;
  display: inline-flex;
  align-items: baseline;
}`;

export const headerComponent = defineComponent({
  name: "header",
  label: "Site header",
  defaultVariant: "default",
  tokens: [
    {
      key: "paddingBlock",
      cssVar: "--header-padding-block",
      label: "Top padding",
      type: "size",
      defaultValue: "1rem",
    },
    {
      key: "paddingBottom",
      cssVar: "--header-padding-bottom",
      label: "Bottom padding",
      type: "size",
      defaultValue: "1rem",
    },
    {
      key: "borderColor",
      cssVar: "--header-border-color",
      label: "Border color",
      type: "color",
      defaultValue: "var(--border)",
    },
  ],
  variants: {
    default: { label: "Default", css: "" },
  },
  specimen: `<header class="site-header">
  <div class="container">
    <div class="nav-bar">
      <a class="site-logo" href="#"><span class="wordmark wordmark--md">nobodyreads<span class="dot" aria-hidden="true">.</span><span class="me">me</span></span></a>
      <nav class="site-nav-inline" aria-label="Main"><a href="#">home</a><a href="#">about</a></nav>
    </div>
  </div>
</header>`,
  baseCss: BASE_CSS,
});

/** @deprecated Use headerComponent.css() via the registry */
export function headerCss(): string {
  return headerComponent.css("default");
}
