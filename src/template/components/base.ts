export function baseCss(): string {
  return `*, *::before, *::after {
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
}
