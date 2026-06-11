import { defineComponent } from "../component-definition.js";

const BASE_CSS = `.site-footer {
  padding: var(--footer-padding-block, 2rem) 0;
  border-top: 1px solid var(--border);
}

.site-footer p {
  font-size: var(--footer-text-size, 0.75rem);
  font-family: var(--font-mono);
  color: var(--footer-text-color, var(--muted));
}`;

export const footerComponent = defineComponent({
  name: "footer",
  label: "Site footer",
  defaultVariant: "default",
  tokens: [
    {
      key: "paddingBlock",
      cssVar: "--footer-padding-block",
      label: "Vertical padding",
      type: "size",
      defaultValue: "2rem",
    },
    {
      key: "textSize",
      cssVar: "--footer-text-size",
      label: "Text size",
      type: "size",
      defaultValue: "0.75rem",
    },
    {
      key: "textColor",
      cssVar: "--footer-text-color",
      label: "Text color",
      type: "color",
      defaultValue: "var(--muted)",
    },
  ],
  variants: {
    default: { label: "Default", css: "" },
  },
  baseCss: BASE_CSS,
});

/** @deprecated Use footerComponent.css() via the registry */
export function footerCss(): string {
  return footerComponent.css("default");
}
