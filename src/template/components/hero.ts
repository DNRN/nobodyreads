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

/**
 * How much of itself the hero shows.
 *
 * `auto` resolves by how much there is to show — the same density rule the post
 * listing follows, so a plot cannot end up with a towering introduction over a
 * long archive, or a terse one over two posts. The other three are an author
 * overriding that guess: `full` keeps the stacked introduction however much
 * gets published, `compact` steps back to a single row from the first post, and
 * `bare` drops the avatar for a site whose name is its whole identity.
 */
export type HeroVariant = "auto" | "full" | "compact" | "bare";

/** The front-page facts `auto` reads to make its guess. */
export interface HeroSignals {
  /** There is enough of an archive for a meta line to say something. */
  hasMeta: boolean;
  /** Something has been published. */
  hasPosts: boolean;
}

/** The two markup decisions left once the variant has had its say. */
export interface HeroShape {
  /** Single row, tagline dropped — the `site-hero--compact` modifier. */
  compact: boolean;
  /** Whether to draw the avatar disc at all. */
  monogram: boolean;
}

/**
 * The hero's shape for this render.
 *
 * Lives beside the variants rather than in the layout that draws them: a
 * resolver written anywhere else drifts the first time a variant is added, and
 * then the picker offers a choice nothing acts on.
 *
 * An explicit `full` or `compact` shows the avatar even on a plot with nothing
 * published yet. That is the author asking for it — `auto` is where the "wait
 * until there is something behind it" rule lives.
 */
export function resolveHeroShape(
  variant: string | undefined,
  signals: HeroSignals,
): HeroShape {
  switch (variant) {
    case "full":
      return { compact: false, monogram: true };
    case "compact":
      return { compact: true, monogram: true };
    case "bare":
      return { compact: signals.hasMeta, monogram: false };
    default:
      return { compact: signals.hasMeta, monogram: signals.hasPosts };
  }
}

export const heroComponent = defineComponent({
  name: "hero",
  label: "Hero",
  defaultVariant: "auto",
  tokens: [],
  // Every variant carries empty CSS because none of them is a styling choice:
  // `resolveHeroShape` turns each into markup the base CSS already covers.
  // Declaring them here is what puts them in the editor's picker and what
  // `validateComponentsAgainstRegistry` measures a stored theme against.
  variants: {
    auto: { label: "Automatic", css: "" },
    full: { label: "Full", css: "" },
    compact: { label: "Compact", css: "" },
    bare: { label: "Name only", css: "" },
  },
  specimen: `<div class="container">
  <div class="site-hero">
    <span class="site-monogram" aria-hidden="true"><span class="site-monogram__disc">A</span></span>
    <div class="site-hero__text">
      <p class="hero-title">Alice</p>
      <p class="hero-tagline">Another simple blog engine.</p>
    </div>
  </div>
</div>`,
  baseCss: BASE_CSS,
});

/** @deprecated Use heroComponent.css() via the registry */
export function heroCss(): string {
  return heroComponent.css("auto");
}
