import { defineComponent } from "../component-definition.js";

const BASE_CSS = `.site-footer {
  padding: var(--footer-padding-block, 1.25rem) 0;
  border-top: 1px solid var(--border);
}

.site-footer p {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  font-size: var(--footer-text-size, 0.69rem);
  font-family: var(--font-mono);
  color: var(--footer-text-color, var(--muted));
}

.site-footer .wordmark {
  font-size: 0.8rem;
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
      defaultValue: "1.25rem",
    },
    {
      key: "textSize",
      cssVar: "--footer-text-size",
      label: "Text size",
      type: "size",
      defaultValue: "0.69rem",
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
