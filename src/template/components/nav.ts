import { defineComponent } from "../component-definition.js";

const BASE_CSS = `.nav-actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.nav-auth {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-auth a,
.auth-link {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.85rem;
  font-family: var(--font-mono);
  transition: color 0.15s;
}

.nav-auth a:hover,
.auth-link:hover {
  color: var(--text);
}

.auth-logout button {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  font-size: 0.75rem;
  font-family: var(--font-mono);
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  cursor: pointer;
}

.auth-logout button:hover {
  border-color: var(--text);
}

.theme-toggle {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  font-size: 0.75rem;
  font-family: var(--font-mono);
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  cursor: pointer;
}

.theme-toggle:hover {
  border-color: var(--text);
}

.nav-toggle {
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.nav-toggle:hover,
body.nav-open .nav-toggle {
  border-color: var(--text);
}

.site-nav {
  position: absolute;
  top: calc(100% + 0.75rem);
  left: 0;
  right: 0;
  display: grid;
  gap: 0.6rem;
  padding: 1rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-6px);
  transition: opacity 0.2s, transform 0.2s;
}

.site-menu {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  width: max-content;
  min-width: 12rem;
  display: grid;
  gap: 0.15rem;
  padding: 0.35rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-6px);
  transition: opacity 0.2s, transform 0.2s;
  z-index: 20;
}

body.nav-open .site-nav,
body.nav-open .site-menu {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.site-nav a {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.85rem;
  font-family: var(--font-mono);
  transition: color 0.15s;
}

.site-nav a:hover,
.site-nav a.active {
  color: var(--text);
}

.site-menu-header {
  padding: 0.5rem 0.65rem;
  font-size: 0.72rem;
  font-family: var(--font-mono);
  color: var(--muted);
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.15rem;
}

.nav-menu-form {
  margin: 0;
}

.nav-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.65rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  text-decoration: none;
  font-size: 0.85rem;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.nav-menu-item:hover {
  background: var(--border);
}

.nav-menu-item--danger {
  color: #c0392b;
}`;

const INLINE_CSS = `.site-nav-inline {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.site-nav-inline a {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.85rem;
  font-family: var(--font-mono);
  transition: color 0.15s;
}

.site-nav-inline a:hover,
.site-nav-inline a.active {
  color: var(--text);
}`;

const DROPDOWN_CSS = `.site-nav-inline {
  position: absolute;
  top: calc(100% + 0.75rem);
  left: 0;
  right: 0;
  display: grid;
  gap: 0.6rem;
  padding: 1rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-6px);
  transition: opacity 0.2s, transform 0.2s;
}

body.nav-open .site-nav-inline {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.site-nav-inline a {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.85rem;
  font-family: var(--font-mono);
  transition: color 0.15s;
}

.site-nav-inline a:hover,
.site-nav-inline a.active {
  color: var(--text);
}`;

export const navComponent = defineComponent({
  name: "nav",
  label: "Navigation",
  defaultVariant: "inline",
  tokens: [],
  variants: {
    inline: { label: "Inline", css: INLINE_CSS },
    dropdown: { label: "Dropdown", css: DROPDOWN_CSS },
  },
  baseCss: BASE_CSS,
});

/** @deprecated Use navComponent.css() via the registry */
export function navCss(): string {
  return navComponent.css("inline");
}
