import { describe, it, expect } from "vitest";
import { generateCss } from "./generate.js";
import { DEFAULT_TEMPLATE } from "./defaults.js";
import { validateTheme, normalizeComponents } from "./theme-io.js";
import { getComponentByName } from "./registry.js";

describe("template system", () => {
  it("generateCss(DEFAULT_TEMPLATE) matches snapshot", () => {
    expect(generateCss(DEFAULT_TEMPLATE)).toMatchSnapshot();
  });

  it("validateTheme accepts legacy component shape", () => {
    const theme = {
      ...DEFAULT_TEMPLATE,
      components: { postPreview: "default", nav: "inline" },
    };
    const result = validateTheme(theme);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.theme.components.postPreview).toEqual({ variant: "default" });
      expect(result.theme.components.nav).toEqual({ variant: "inline" });
    }
  });

  it("validateTheme accepts new component shape", () => {
    const theme = {
      ...DEFAULT_TEMPLATE,
      components: {
        postPreview: { variant: "card", tokens: { titleSize: "1.5rem" } },
        nav: { variant: "dropdown" },
      },
    };
    const result = validateTheme(theme);
    expect(result.ok).toBe(true);
  });

  it("validateTheme rejects unknown component variant", () => {
    const theme = {
      ...DEFAULT_TEMPLATE,
      components: {
        postPreview: { variant: "nonexistent" },
        nav: { variant: "inline" },
      },
    };
    const result = validateTheme(theme);
    expect(result.ok).toBe(false);
  });

  it("validateTheme rejects unknown component token key", () => {
    const theme = {
      ...DEFAULT_TEMPLATE,
      components: {
        postPreview: { variant: "default", tokens: { notAToken: "1rem" } },
        nav: { variant: "inline" },
      },
    };
    const result = validateTheme(theme);
    expect(result.ok).toBe(false);
  });

  it("generateCss emits different CSS for postPreview variants", () => {
    const base = generateCss(DEFAULT_TEMPLATE);
    const compact = generateCss({
      ...DEFAULT_TEMPLATE,
      components: {
        postPreview: { variant: "compact" },
        nav: { variant: "inline" },
      },
    });
    const card = generateCss({
      ...DEFAULT_TEMPLATE,
      components: {
        postPreview: { variant: "card" },
        nav: { variant: "inline" },
      },
    });
    expect(compact).not.toBe(base);
    expect(card).not.toBe(base);
    expect(compact).not.toBe(card);
  });

  it("generateCss emits component token overrides", () => {
    const css = generateCss({
      ...DEFAULT_TEMPLATE,
      components: {
        postPreview: { variant: "default", tokens: { titleSize: "2rem" } },
        nav: { variant: "inline" },
      },
    });
    expect(css).toContain("--post-preview-title-size: 2rem");
  });

  it("generateCss applies variant and token overrides together", () => {
    const base = generateCss(DEFAULT_TEMPLATE);
    const css = generateCss({
      ...DEFAULT_TEMPLATE,
      components: {
        postPreview: {
          variant: "card",
          tokens: { titleSize: "1.5rem", excerptColor: "#ff0000" },
        },
        nav: { variant: "inline" },
      },
    });
    expect(css).not.toBe(base);
    expect(css).toContain("border-radius: 10px");
    expect(css).toContain("--post-preview-title-size: 1.5rem");
    expect(css).toContain("--post-preview-excerpt-color: #ff0000");
  });

  it("normalizeComponents converts legacy shape", () => {
    expect(
      normalizeComponents({ postPreview: "compact", nav: "dropdown" }),
    ).toEqual({
      postPreview: { variant: "compact" },
      nav: { variant: "dropdown" },
    });
  });

  it("component registry includes postPreview with variants", () => {
    const postPreview = getComponentByName("postPreview");
    expect(postPreview).toBeDefined();
    expect(postPreview!.variants.default).toBeDefined();
    expect(postPreview!.variants.compact).toBeDefined();
    expect(postPreview!.variants.card).toBeDefined();
    expect(postPreview!.tokens.length).toBeGreaterThan(0);
  });
});
