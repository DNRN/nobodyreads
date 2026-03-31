export function wordmarkCss(): string {
  return `.wordmark {
  font-family: var(--brand-font);
  font-weight: var(--logo-weight);
  letter-spacing: var(--logo-tracking);
  line-height: 1;
  color: var(--brand-ink);
  display: inline-flex;
  align-items: baseline;
  white-space: nowrap;
}

.wordmark .me { color: var(--brand-accent); }
.wordmark--xl { font-size: clamp(28px, 6vw, 64px); }
.wordmark--md { font-size: clamp(18px, 3vw, 28px); }
.wordmark .dot { margin-right: -0.02em; }`;
}
