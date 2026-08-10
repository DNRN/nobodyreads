import { describe, it, expect } from "vitest";
import { DEFAULT_TEMPLATE } from "./defaults.js";
import { generateCss } from "./generate.js";
import { familyForStack } from "./fonts.js";
import {
  CORNER_STEPS,
  COLOR_SLOTS,
  DENSITY_STEPS,
  TYPE_PAIRINGS,
  matchCornerStep,
  matchDensityStep,
  matchTypePairing,
} from "./presets.js";

/**
 * The presets are the vocabulary the Theme tab and the AI proposal share, so
 * what matters is that they round-trip: a preset applied to a token set has to
 * be recognised again when the screen reloads, or every control reads "Custom".
 */
describe("preset matching round-trips", () => {
  it("recognises every type pairing it offers", () => {
    for (const pairing of TYPE_PAIRINGS) {
      expect(matchTypePairing({ font: pairing.font, brandFont: pairing.brandFont })).toBe(
        pairing.id,
      );
    }
  });

  it("recognises every density step it offers", () => {
    for (const step of DENSITY_STEPS) {
      expect(
        matchDensityStep({ lineHeight: step.lineHeight, containerPadding: step.containerPadding }),
      ).toBe(step.id);
    }
  });

  it("recognises every corner step it offers", () => {
    for (const step of CORNER_STEPS) {
      expect(matchCornerStep(step.radius)).toBe(step.id);
    }
  });

  it("reports a hand-rolled theme as unmatched rather than guessing", () => {
    expect(matchTypePairing({ font: "Comic Sans", brandFont: "Comic Sans" })).toBeNull();
    expect(matchDensityStep({ lineHeight: "1.61", containerPadding: "2.2rem" })).toBeNull();
    expect(matchCornerStep("7px")).toBeNull();
  });

  // A theme saved before the radius token existed omits it; the corners control
  // must still land on a step rather than reading "Custom" for every such site.
  it("reads an absent radius as the default step", () => {
    expect(matchCornerStep(undefined)).toBe("soft");
  });
});

describe("the shipped default is expressible in the visual controls", () => {
  it("matches a pairing, a density step and a corner step", () => {
    const light = DEFAULT_TEMPLATE.tokens.light;
    expect(matchTypePairing(light)).not.toBeNull();
    expect(matchDensityStep(light)).not.toBeNull();
    expect(matchCornerStep(light.radius)).not.toBeNull();
  });
});

describe("type pairings only offer faces the site can render", () => {
  // Offering a family nobody requests renders as a silent fallback, which looks
  // like a bug rather than a choice. The catalogue is the authority on what can
  // be rendered, so this checks against it instead of a second hand-kept list.
  it("names only catalogue families", () => {
    for (const pairing of TYPE_PAIRINGS) {
      expect(familyForStack(pairing.font), `${pairing.id} font`).toBeDefined();
      expect(familyForStack(pairing.brandFont), `${pairing.id} brandFont`).toBeDefined();
    }
  });

  it("gives every pairing a distinct id and label", () => {
    expect(new Set(TYPE_PAIRINGS.map((p) => p.id)).size).toBe(TYPE_PAIRINGS.length);
    expect(new Set(TYPE_PAIRINGS.map((p) => p.label)).size).toBe(TYPE_PAIRINGS.length);
  });
});

describe("colour slots address real tokens", () => {
  it("every slot key exists on the default token set", () => {
    for (const slot of COLOR_SLOTS) {
      expect(DEFAULT_TEMPLATE.tokens.light[slot.key], slot.key).toBeDefined();
    }
  });

  it("leads with exactly the three the comp puts up front", () => {
    expect(COLOR_SLOTS.filter((s) => s.primary).map((s) => s.key)).toEqual([
      "text",
      "accent",
      "bg",
    ]);
  });
});

describe("applying presets produces usable CSS", () => {
  it("each corner step reaches the radius scale", () => {
    for (const step of CORNER_STEPS) {
      const css = generateCss({
        ...DEFAULT_TEMPLATE,
        tokens: {
          ...DEFAULT_TEMPLATE.tokens,
          light: { ...DEFAULT_TEMPLATE.tokens.light, radius: step.radius },
        },
      });
      expect(css).toContain(`--radius-base: ${step.radius}`);
    }
  });

  it("each density step reaches the layout tokens", () => {
    for (const step of DENSITY_STEPS) {
      const css = generateCss({
        ...DEFAULT_TEMPLATE,
        tokens: {
          ...DEFAULT_TEMPLATE.tokens,
          light: {
            ...DEFAULT_TEMPLATE.tokens.light,
            lineHeight: step.lineHeight,
            containerPadding: step.containerPadding,
          },
        },
      });
      expect(css).toContain(`--line-height: ${step.lineHeight}`);
      expect(css).toContain(`--container-padding: ${step.containerPadding}`);
    }
  });
});
