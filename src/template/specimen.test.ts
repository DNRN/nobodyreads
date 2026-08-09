import { describe, it, expect } from "vitest";
import { DEFAULT_TEMPLATE } from "./defaults.js";
import { generateCss } from "./generate.js";
import { componentRegistry, serializeRegistry } from "./registry.js";

/**
 * Specimens are the sample markup Design → Components frames for each
 * component. They only earn their place if they keep demonstrating the thing
 * they name, so what is pinned here is that their classes still exist in the
 * stylesheet — a renamed class would otherwise leave a specimen that renders as
 * unstyled text and looks like a broken component rather than a stale sample.
 */
const CSS = generateCss(DEFAULT_TEMPLATE);

/** Components with nothing meaningful to frame, and why. */
const WITHOUT_SPECIMEN: Record<string, string> = {
  base: "global element rules, not a component",
  responsive: "breakpoint rules only",
  platform: "auth-page styling, not part of a reader's site",
};

function classesIn(markup: string): string[] {
  return [
    ...new Set(
      [...markup.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.trim().split(/\s+/)),
    ),
  ];
}

describe("component specimens", () => {
  const withSpecimen = componentRegistry.filter((c) => c.specimen);

  it("covers every component except the ones with nothing to show", () => {
    const missing = componentRegistry.filter((c) => !c.specimen).map((c) => c.name);
    expect(missing.sort()).toEqual(Object.keys(WITHOUT_SPECIMEN).sort());
  });

  it("frames a useful number of components", () => {
    expect(withSpecimen.length).toBe(8);
  });

  it("every class a specimen uses is styled somewhere in the theme", () => {
    const offenders: string[] = [];
    for (const component of withSpecimen) {
      for (const className of classesIn(component.specimen!)) {
        if (!CSS.includes(`.${className}`)) {
          offenders.push(`${component.name}: .${className}`);
        }
      }
    }
    expect(
      offenders,
      `Specimen markup references classes the stylesheet no longer defines:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("is carried through to the client by serializeRegistry", () => {
    const serialized = serializeRegistry();
    for (const component of withSpecimen) {
      const match = serialized.find((c) => c.name === component.name);
      expect(match?.specimen, component.name).toBe(component.specimen);
    }
  });

  it("produces markup, not an empty string", () => {
    for (const component of withSpecimen) {
      expect(component.specimen!.trim().length, component.name).toBeGreaterThan(20);
      expect(component.specimen, component.name).toContain("<");
    }
  });
});
