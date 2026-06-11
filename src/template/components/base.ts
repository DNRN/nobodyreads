import { defineComponent } from "../component-definition.js";

const BASE_CSS = `*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  font-size: var(--font-size);
  line-height: var(--line-height);
  color: var(--text);
  background: var(--bg);
  font-family: var(--font);
  -webkit-font-smoothing: antialiased;
}

body {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; color: var(--link-hover); }

.container {
  width: 100%;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 var(--container-padding);
}

main {
  flex: 1;
  padding: 2rem 0;
}

.loading {
  color: var(--muted);
  font-style: italic;
  font-size: 0.9rem;
}

.error {
  color: #b44;
  font-style: italic;
  font-size: 0.9rem;
}`;

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
