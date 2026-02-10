export const DEFAULT_SITE_CSS = `
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --text: #111111;
  --muted: #5a5a5a;
  --border: #e6e6e6;
  --accent: #6c5ce7;
  --font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0f12;
    --text: #f5f5f7;
    --muted: #a0a0a8;
    --border: #24242a;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: var(--font);
  color: var(--text);
  background: var(--bg);
  line-height: 1.6;
}

a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.site-header {
  border-bottom: 1px solid var(--border);
}

.site-hero {
  margin-top: 1.5rem;
}

.site-footer {
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.9rem;
}

.site-nav-inline a {
  color: var(--muted);
  margin-right: 1rem;
}

.site-nav-inline a.active {
  color: var(--text);
  font-weight: 600;
}

main h1, main h2, main h3 {
  line-height: 1.25;
}
`;
