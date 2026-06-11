import { defineComponent } from "../component-definition.js";

const BASE_CSS = `.site-header {
  padding: var(--header-padding-block, 1.75rem) 0 var(--header-padding-bottom, 2.25rem);
  border-bottom: 1px solid var(--header-border-color, var(--border));
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
      defaultValue: "1.75rem",
    },
    {
      key: "paddingBottom",
      cssVar: "--header-padding-bottom",
      label: "Bottom padding",
      type: "size",
      defaultValue: "2.25rem",
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
  baseCss: BASE_CSS,
});

/** @deprecated Use headerComponent.css() via the registry */
export function headerCss(): string {
  return headerComponent.css("default");
}
