export function navCss(): string {
  return `.nav-actions {
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
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  cursor: pointer;
}

.nav-toggle span {
  display: block;
  width: 14px;
  height: 2px;
  background: var(--text);
}

.site-nav,
.site-menu {
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
  left: auto;
  right: 0;
  width: max-content;
  min-width: 12rem;
}

body.nav-open .site-nav,
body.nav-open .site-menu {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.site-nav a,
.site-menu a {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.85rem;
  font-family: var(--font-mono);
  transition: color 0.15s;
}

.site-nav a:hover,
.site-nav a.active,
.site-menu a:hover,
.site-menu a.active {
  color: var(--text);
}

.site-nav-inline {
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
}

.site-nav .nav-auth,
.site-menu .nav-auth {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
}`;
}
