import { defineComponent } from "../component-definition.js";

/**
 * The identity anchor at the top of a site's home page: who this is, where it
 * lives, and what it is about.
 *
 * It carries most of the visual weight on a site with little content, which is
 * the whole point — a plot with two posts should read as a deliberate, quiet
 * place rather than a mostly-empty list. The `compact` modifier is for the
 * opposite end: once there are enough posts to need wayfinding, the hero steps
 * back to a single row and lets the archive lead.
 */
const BASE_CSS = `.site-hero {
  display: flex;
  align-items: flex-start;
  gap: 1.25rem;
  padding-top: 2.75rem;
}

.site-hero__text {
  min-width: 0;
}

.site-hero__eyebrow {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: var(--link);
  margin-bottom: 0.5rem;
}

.hero-title {
  font-family: var(--font);
  font-size: 2.4rem;
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--text);
  margin: 0;
}

.hero-tagline {
  color: var(--body-text);
  font-size: 1rem;
  line-height: 1.55;
  margin-top: 0.9rem;
}

.site-hero__meta {
  font-family: var(--font-mono);
  font-size: 0.69rem;
  color: var(--muted);
  margin-top: 0.5rem;
}

/* --- Monogram avatar --- */

.site-monogram {
  position: relative;
  flex-shrink: 0;
  width: 3.75rem;
  height: 3.75rem;
}

.site-monogram__disc {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  background: var(--link);
  color: var(--accent-text);
  font-family: var(--font);
  font-style: italic;
  font-size: 1.94rem;
  line-height: 1;
  /* Inset hairline for a lit edge, spread ring for a halo in the plot's own
     chip tint — the same pair that separates the wordmark's dot from the page. */
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16), 0 0 0 3px var(--chip-bg);
}

.site-monogram::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: 0;
  width: 0.69rem;
  height: 0.69rem;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 2px var(--bg);
}

/* --- Compact: the archive leads, the hero identifies --- */

.site-hero--compact {
  align-items: center;
  gap: 1rem;
  padding-bottom: 1.5rem;
}

.site-hero--compact .hero-title {
  font-size: 1.875rem;
}

.site-hero--compact .site-monogram {
  width: 3rem;
  height: 3rem;
}

.site-hero--compact .site-monogram__disc {
  font-size: 1.5rem;
}

.site-hero--compact .site-monogram::after {
  width: 0.56rem;
  height: 0.56rem;
}`;

export const heroComponent = defineComponent({
  name: "hero",
  label: "Hero",
  defaultVariant: "default",
  tokens: [],
  variants: {
    default: { label: "Default", css: "" },
  },
  baseCss: BASE_CSS,
});

/** @deprecated Use heroComponent.css() via the registry */
export function heroCss(): string {
  return heroComponent.css("default");
}
