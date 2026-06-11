import { defineComponent } from "../component-definition.js";

const BASE_CSS = `.site-hero {
  padding-top: 2.5rem;
}

.hero-title {
  line-height: 1.1;
  margin: 0;
  font-weight: inherit;
}

.hero-tagline {
  color: var(--muted);
  font-size: 1rem;
  margin-top: 0.65rem;
  max-width: 36rem;
}`;

export const heroComponent = defineComponent({
  name: "hero",
  label: "Hero",
  defaultVariant: "default",
  tokens: [],
  variants: {
    default: { label: "Default", css: "" },
  },
  baseCss: BASE_CSS,
});

/** @deprecated Use heroComponent.css() via the registry */
export function heroCss(): string {
  return heroComponent.css("default");
}
