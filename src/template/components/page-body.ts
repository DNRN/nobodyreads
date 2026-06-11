import { defineComponent } from "../component-definition.js";

const BASE_CSS = `.page-body p {
  margin-bottom: 1.2rem;
}

.page-body a {
  color: var(--text);
}

.about-content p {
  margin-bottom: 1.2rem;
}

.about-content a {
  color: var(--text);
}

.home-intro {
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.5rem;
}

.home-intro p {
  margin-bottom: 1.2rem;
}

.home-intro a {
  color: var(--text);
}`;

export const pageBodyComponent = defineComponent({
  name: "pageBody",
  label: "Page body",
  defaultVariant: "default",
  tokens: [],
  variants: {
    default: { label: "Default", css: "" },
  },
  baseCss: BASE_CSS,
});

/** @deprecated Use pageBodyComponent.css() via the registry */
export function pageBodyCss(): string {
  return pageBodyComponent.css("default");
}
