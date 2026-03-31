export function postPreviewCss(): string {
  return `.post-preview {
  padding: 1.75rem 0;
  border-bottom: 1px solid var(--border);
}

.post-preview:first-child {
  padding-top: 0;
}

.post-preview:last-child {
  border-bottom: none;
}

.post-date {
  display: block;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--muted);
  margin-bottom: 0.25rem;
}

.post-title {
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.3;
}

.post-title a {
  color: var(--text);
  text-decoration: none;
}

.post-title a:hover {
  text-decoration: underline;
}

.post-excerpt {
  margin-top: 0.5rem;
  color: var(--accent);
  font-size: 0.9rem;
}

.read-more {
  display: inline-block;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  font-family: var(--font-mono);
  color: var(--muted);
  text-decoration: none;
  transition: color 0.15s;
}

.read-more:hover {
  color: var(--text);
}`;
}
