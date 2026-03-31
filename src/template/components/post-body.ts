export function postBodyCss(): string {
  return `.post-header {
  margin-bottom: 2rem;
}

.post-header .post-title {
  font-size: 1.6rem;
}

.post-body p {
  margin-bottom: 1.2rem;
}

.post-body h2 {
  font-size: 1.15rem;
  margin-top: 2rem;
  margin-bottom: 0.75rem;
}

.post-body code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: rgba(0, 0, 0, 0.06);
  padding: 0.15em 0.35em;
  border-radius: 3px;
}

.post-body pre {
  background: rgba(0, 0, 0, 0.06);
  padding: 1rem 1.25rem;
  border-radius: 4px;
  overflow-x: auto;
  margin-bottom: 1.2rem;
  font-size: 0.8rem;
  line-height: 1.6;
}

.post-body pre code {
  background: none;
  padding: 0;
}

.post-body img,
.page-body img,
.home-intro img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  display: block;
  margin: 0 auto 1.2rem;
}

.post-body blockquote {
  border-left: 3px solid var(--border);
  padding-left: 1rem;
  color: var(--muted);
  font-style: italic;
  margin-bottom: 1.2rem;
}

.back-link {
  display: inline-block;
  margin-top: 2rem;
  font-size: 0.8rem;
  font-family: var(--font-mono);
  color: var(--muted);
  text-decoration: none;
}

.back-link:hover {
  color: var(--text);
}`;
}
