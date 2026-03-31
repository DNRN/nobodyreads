export function headerCss(): string {
  return `.site-header {
  padding: 1.75rem 0 2.25rem;
  border-bottom: 1px solid var(--border);
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
}

.site-logo {
  text-decoration: none;
  display: inline-flex;
  align-items: baseline;
}`;
}
