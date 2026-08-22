import { describe, it, expect } from "vitest";
import { DEFAULT_TEMPLATE } from "./defaults.js";
import { generateCss, generateHtml } from "./generate.js";
import { validateTheme } from "./theme-io.js";
import { resolveHeroShape, heroComponent } from "./components/hero.js";
import type { HeaderSectionConfig, SiteTemplateDefinition } from "./types.js";

function withHeader(patch: Partial<HeaderSectionConfig>): SiteTemplateDefinition {
  return {
    ...DEFAULT_TEMPLATE,
    sections: DEFAULT_TEMPLATE.sections.map((section) =>
      section.type === "header" ? { ...section, ...patch } : section,
    ),
  };
}

/**
 * Every control the Design tabs added is optional on the stored template, so a
 * theme saved before they existed has to keep rendering exactly as it did.
 * These tests pin that, not just the new behaviour.
 */
describe("corner radius", () => {
  it("drives the whole scale from one token", () => {
    const css = generateCss({
      ...DEFAULT_TEMPLATE,
      tokens: {
        ...DEFAULT_TEMPLATE.tokens,
        light: { ...DEFAULT_TEMPLATE.tokens.light, radius: "12px" },
      },
    });
    expect(css).toContain("--radius-base: 12px");
    expect(css).toContain("--radius-sm: calc(var(--radius-base, 4px) / 2)");
    expect(css).toContain("--radius-lg: calc(var(--radius-base, 4px) * 2)");
  });

  it("falls back to the previous scale when a theme omits it", () => {
    const { radius: _dropped, ...light } = DEFAULT_TEMPLATE.tokens.light;
    const css = generateCss({
      ...DEFAULT_TEMPLATE,
      tokens: { ...DEFAULT_TEMPLATE.tokens, light },
    });
    expect(css).not.toContain("--radius-base:");
    // The fallbacks in the scale reproduce 2px / 4px / 8px.
    expect(css).toContain("var(--radius-base, 4px)");
  });

  it("survives validation as an optional field", () => {
    const withRadius = validateTheme({
      ...DEFAULT_TEMPLATE,
      tokens: {
        ...DEFAULT_TEMPLATE.tokens,
        light: { ...DEFAULT_TEMPLATE.tokens.light, radius: "0" },
      },
    });
    expect(withRadius.ok).toBe(true);

    const { radius: _dropped, ...light } = DEFAULT_TEMPLATE.tokens.light;
    expect(validateTheme({ ...DEFAULT_TEMPLATE, tokens: { ...DEFAULT_TEMPLATE.tokens, light } }).ok).toBe(true);
  });
});

describe("header contents", () => {
  it("shows navigation by default and when the flag is absent", () => {
    expect(generateHtml(DEFAULT_TEMPLATE)).toContain("site-nav-inline");

    const legacy = withHeader({ showNav: undefined });
    expect(generateHtml(legacy)).toContain("site-nav-inline");
  });

  it("omits navigation when switched off", () => {
    const html = generateHtml(withHeader({ showNav: false }));
    expect(html).not.toContain("site-nav-inline");
    expect(html).not.toContain("{{nav}}");
  });

  // Off by default: a site should not acquire a header subscribe form by
  // upgrading.
  it("only includes the subscribe form when asked", () => {
    expect(generateHtml(DEFAULT_TEMPLATE)).not.toContain("{{subscribe}}");
    expect(generateHtml(withHeader({ showSubscribe: true }))).toContain("{{subscribe}}");
  });
});

describe("post metadata", () => {
  it("emits nothing when postMeta is absent", () => {
    expect(generateCss(DEFAULT_TEMPLATE)).not.toContain("Post details switched off");
  });

  it("emits nothing when every detail is on", () => {
    const css = generateCss({
      ...DEFAULT_TEMPLATE,
      postMeta: { date: true, excerpt: true, readMore: true, tags: true },
    });
    expect(css).not.toContain("Post details switched off");
  });

  it("hides only what is switched off", () => {
    const css = generateCss({
      ...DEFAULT_TEMPLATE,
      postMeta: { date: false, tags: false },
    });
    expect(css).toContain(".post-preview .post-date");
    expect(css).toContain(".post-preview .post-tags");
    expect(css).not.toContain(".post-preview .post-excerpt");
    expect(css).not.toContain(".post-preview .read-more");
  });
});

describe("grid post listing", () => {
  it("is offered as a variant and carries its own arrangement", () => {
    const css = generateCss(DEFAULT_TEMPLATE);
    expect(css).toContain(".post-list--grid .post-list__items");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("validates as a component variant", () => {
    const result = validateTheme({
      ...DEFAULT_TEMPLATE,
      components: { ...DEFAULT_TEMPLATE.components, postPreview: { variant: "grid" } },
    });
    expect(result.ok).toBe(true);
  });
});

/**
 * The hero used to make both of these decisions by itself, from post counts the
 * author never saw. The variant is that guess turned into a choice, so what is
 * pinned here is that `auto` still guesses exactly as it always did and that
 * each explicit variant beats the signals rather than blending with them.
 */
describe("hero shape", () => {
  it("guesses from the site when left automatic", () => {
    expect(resolveHeroShape("auto", { hasMeta: false, hasPosts: false })).toEqual({
      compact: false,
      monogram: false,
    });
    expect(resolveHeroShape("auto", { hasMeta: false, hasPosts: true })).toEqual({
      compact: false,
      monogram: true,
    });
    expect(resolveHeroShape("auto", { hasMeta: true, hasPosts: true })).toEqual({
      compact: true,
      monogram: true,
    });
  });

  // A theme stored before the variant existed has no `hero` entry at all, and
  // has to keep rendering exactly as it did.
  it("treats a missing variant as automatic", () => {
    const signals = { hasMeta: true, hasPosts: true };
    expect(resolveHeroShape(undefined, signals)).toEqual(resolveHeroShape("auto", signals));
    expect(resolveHeroShape("nonsense", signals)).toEqual(resolveHeroShape("auto", signals));
  });

  it("lets an explicit choice override the signals in both directions", () => {
    const empty = { hasMeta: false, hasPosts: false };
    const archive = { hasMeta: true, hasPosts: true };

    // Full keeps the stacked hero over a long archive that auto would compact.
    expect(resolveHeroShape("full", archive)).toEqual({ compact: false, monogram: true });
    // Compact steps back on a plot auto would still be introducing.
    expect(resolveHeroShape("compact", empty)).toEqual({ compact: true, monogram: true });
  });

  it("drops the avatar for Name only without touching density", () => {
    expect(resolveHeroShape("bare", { hasMeta: false, hasPosts: true })).toEqual({
      compact: false,
      monogram: false,
    });
    expect(resolveHeroShape("bare", { hasMeta: true, hasPosts: true })).toEqual({
      compact: true,
      monogram: false,
    });
  });

  it("offers every resolvable variant in the editor's picker", () => {
    expect(Object.keys(heroComponent.variants)).toEqual(["auto", "full", "compact", "bare"]);
    expect(heroComponent.defaultVariant).toBe("auto");

    for (const variant of Object.keys(heroComponent.variants)) {
      const result = validateTheme({
        ...DEFAULT_TEMPLATE,
        components: { ...DEFAULT_TEMPLATE.components, hero: { variant } },
      });
      expect(result.ok).toBe(true);
    }
  });

  it("rejects a variant nothing resolves", () => {
    const result = validateTheme({
      ...DEFAULT_TEMPLATE,
      components: { ...DEFAULT_TEMPLATE.components, hero: { variant: "nonsense" } },
    });
    expect(result.ok).toBe(false);
  });
});
