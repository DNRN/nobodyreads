import { defineComponent } from "../component-definition.js";

const BASE_CSS = `.wordmark {
  font-family: var(--brand-font);
  font-weight: var(--logo-weight);
  letter-spacing: var(--logo-tracking);
  line-height: 1;
  color: var(--brand-ink);
  display: inline-flex;
  align-items: baseline;
  white-space: nowrap;
}

.wordmark .me { color: var(--brand-accent); }
.wordmark--xl { font-size: clamp(28px, 6vw, 64px); }
.wordmark--md { font-size: clamp(18px, 3vw, 28px); }
.wordmark .dot { margin-right: -0.02em; }`;

export const wordmarkComponent = defineComponent({
  name: "wordmark",
  label: "Wordmark",
  defaultVariant: "default",
  tokens: [],
  variants: {
    default: { label: "Default", css: "" },
  },
  baseCss: BASE_CSS,
});

/** @deprecated Use wordmarkComponent.css() via the registry */
export function wordmarkCss(): string {
  return wordmarkComponent.css("default");
}
