import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  CATALOGUE_STACKS,
  stacksForRoles,
  FONT_CATALOGUE,
  familyForStack,
  fontFamilyById,
  fontLinkHref,
} from "./fonts.js";
import { FONTS } from "./palette.js";
import { DEFAULT_TEMPLATE } from "./defaults.js";
import { themeDiffSchema, themeDiffJsonSchema } from "./ai-theme.js";
import { TYPE_PAIRINGS } from "./presets.js";

describe("the catalogue", () => {
  it("has unique ids and stacks", () => {
    expect(new Set(FONT_CATALOGUE.map((f) => f.id)).size).toBe(FONT_CATALOGUE.length);
    expect(new Set(CATALOGUE_STACKS).size).toBe(FONT_CATALOGUE.length);
  });

  // The palette is where the product's own faces are defined; a catalogue entry
  // whose stack drifted from it would request one font and render another.
  it("matches the palette's stacks exactly", () => {
    expect(familyForStack(FONTS.serif)?.id).toBe("newsreader");
    expect(familyForStack(FONTS.sans)?.id).toBe("hanken-grotesk");
    expect(familyForStack(FONTS.mono)?.id).toBe("ibm-plex-mono");
  });

  it("looks up by id and by stack", () => {
    expect(fontFamilyById("newsreader")?.label).toBe("Newsreader");
    expect(fontFamilyById("nope")).toBeUndefined();
    expect(familyForStack(undefined)).toBeUndefined();
  });

  // Guessing which webfont a near-miss meant is how you request the wrong one.
  it("does not match a hand-written stack", () => {
    expect(familyForStack("'Newsreader', serif")).toBeUndefined();
    expect(familyForStack("Comic Sans MS, cursive")).toBeUndefined();
  });
});

describe("fontLinkHref", () => {
  it("asks for only the families actually used", () => {
    const href = fontLinkHref([FONTS.serif]);
    expect(href).toContain("family=Newsreader");
    expect(href).not.toContain("Hanken");
    expect(href).not.toContain("IBM");
  });

  it("makes no request when every stack is a system one", () => {
    expect(fontLinkHref(["Georgia, 'Times New Roman', serif"])).toBeNull();
    expect(fontLinkHref([])).toBeNull();
    expect(fontLinkHref([undefined, "Comic Sans MS, cursive"])).toBeNull();
  });

  it("de-duplicates a family used for two roles", () => {
    const href = fontLinkHref([FONTS.sans, FONTS.sans])!;
    expect(href.match(/family=Hanken/g)).toHaveLength(1);
  });

  it("is order-independent, so the URL is stable", () => {
    expect(fontLinkHref([FONTS.serif, FONTS.sans])).toBe(fontLinkHref([FONTS.sans, FONTS.serif]));
  });

  it("ends with display=swap", () => {
    expect(fontLinkHref([FONTS.serif])).toMatch(/&display=swap$/);
  });
});

/**
 * The public layout's font request becomes theme-driven. For the shipped
 * default that must resolve to the same three families it hardcoded, or every
 * existing site silently changes typeface.
 */
describe("the default theme still asks for what the layout used to hardcode", () => {
  it("requests exactly Newsreader, Hanken Grotesk and IBM Plex Mono", () => {
    const { font, brandFont, fontMono } = DEFAULT_TEMPLATE.tokens.light;
    const href = fontLinkHref([font, brandFont, fontMono])!;

    expect(href).toContain("family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400;1,6..72,500");
    expect(href).toContain("family=Hanken+Grotesk:wght@400;500;600;700;800");
    expect(href).toContain("family=IBM+Plex+Mono:wght@400;500");
    expect(href.match(/family=/g)).toHaveLength(3);
  });

  it("names the same families the layout previously listed", () => {
    const layout = readFileSync(new URL("../../astro/layouts/SiteLayout.astro", import.meta.url), "utf8");
    const { font, brandFont, fontMono } = DEFAULT_TEMPLATE.tokens.light;
    const href = fontLinkHref([font, brandFont, fontMono])!;

    for (const family of ["Newsreader", "Hanken+Grotesk", "IBM+Plex+Mono"]) {
      expect(href, family).toContain(family);
    }
    // The layout must no longer carry a hardcoded request of its own.
    expect(layout).not.toContain("fonts.googleapis.com/css2?family=");
  });
});

/**
 * The inconsistency this catalogue exists to close: the Theme tab could only
 * offer loadable faces, while the AI could name anything and have it fall back
 * silently. Both now draw from the same list.
 */
describe("the AI may only name a family the site can load", () => {
  function diffWith(tokens: Record<string, unknown>) {
    const light = Object.fromEntries(
      Object.keys(themeDiffSchema.shape.tokens.shape.light.unwrap().shape).map((k) => [k, null]),
    );
    return themeDiffSchema.safeParse({
      tokens: { light: { ...light, ...tokens }, dark: null },
      sections: null,
      components: null,
    });
  }

  it("accepts any reading face for the body and brand slots", () => {
    for (const stack of stacksForRoles("serif", "sans")) {
      expect(diffWith({ font: stack }).success, stack).toBe(true);
      expect(diffWith({ brandFont: stack }).success, stack).toBe(true);
    }
  });

  // A monospace token holding a serif breaks every code block on the site.
  it("only accepts a monospace family for fontMono", () => {
    for (const stack of stacksForRoles("mono")) {
      expect(diffWith({ fontMono: stack }).success, stack).toBe(true);
    }
    for (const stack of stacksForRoles("serif", "sans")) {
      expect(diffWith({ fontMono: stack }).success, stack).toBe(false);
    }
  });

  it("does not let a monospace family into a reading slot", () => {
    for (const stack of stacksForRoles("mono")) {
      expect(diffWith({ font: stack }).success, stack).toBe(false);
    }
  });

  it("rejects a family nobody loads", () => {
    expect(diffWith({ font: "'Playfair Display', serif" }).success).toBe(false);
    expect(diffWith({ brandFont: "Comic Sans MS, cursive" }).success).toBe(false);
    expect(diffWith({ fontMono: "'Fira Code', monospace" }).success).toBe(false);
  });

  it("still accepts free text for tokens that are not fonts", () => {
    expect(diffWith({ bg: "#123456", fontSize: "18px" }).success).toBe(true);
  });

  it("puts the choices in the schema the model is handed", () => {
    const json = JSON.stringify(themeDiffJsonSchema);
    for (const stack of CATALOGUE_STACKS) {
      // JSON-encoded, so the quotes inside a stack are escaped.
      expect(json.includes(JSON.stringify(stack).slice(1, -1)), stack).toBe(true);
    }
  });
});

describe("roles", () => {
  it("offers at least one family per role, webfont or system", () => {
    for (const role of ["serif", "sans", "mono"] as const) {
      expect(stacksForRoles(role).length, role).toBeGreaterThan(0);
    }
  });

  it("lets a site be built entirely from stacks that need no request", () => {
    const systemOnly = FONT_CATALOGUE.filter((f) => !f.googleSpec);
    for (const role of ["serif", "sans", "mono"] as const) {
      expect(systemOnly.some((f) => f.role === role), role).toBe(true);
    }
    expect(fontLinkHref(systemOnly.map((f) => f.stack))).toBeNull();
  });
});

describe("every type pairing resolves to the catalogue", () => {
  it("names only stacks the catalogue defines", () => {
    for (const pairing of TYPE_PAIRINGS) {
      expect(familyForStack(pairing.font), pairing.id).toBeDefined();
      expect(familyForStack(pairing.brandFont), pairing.id).toBeDefined();
    }
  });

  // The two guided paths must offer the same set, or the inconsistency is back.
  it("offers nothing the AI could not also choose", () => {
    for (const pairing of TYPE_PAIRINGS) {
      expect(CATALOGUE_STACKS).toContain(pairing.font);
      expect(CATALOGUE_STACKS).toContain(pairing.brandFont);
    }
  });
});
