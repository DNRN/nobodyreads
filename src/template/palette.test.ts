import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { DEFAULT_TEMPLATE } from "./defaults.js";
import { generateHtml } from "./generate.js";
import { alpha, PALETTE } from "./palette.js";
import {
  renderEditorCss,
  renderFallbackCss,
  replaceGeneratedRegion,
} from "./palette-css.js";

const SRC = fileURLToPath(new URL("../", import.meta.url));
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The one module allowed to hold colour literals. */
const PALETTE_MODULE = "template/palette.ts";

/**
 * Surfaces the palette deliberately does not govern.
 *
 * Both render somewhere CSS custom properties cannot reach, so routing them
 * through the palette would not single-source anything — it would just move
 * the literal. Keep this list short and justified; it is the escape hatch the
 * rest of this test exists to prevent.
 */
const EXEMPT: { prefix: string; because: string }[] = [
  {
    prefix: "subscription/",
    because: "HTML email — most mail clients do not support var().",
  },
  {
    prefix: "standalone.ts",
    because: "dev-only 'Astro dev server not reachable' page; no stylesheet.",
  },
];

/** `#abc`, `#aabbcc`, `#aabbccdd`. */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
/** `rgb(...)` / `rgba(...)`, capturing the channel list. */
const RGB = /rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)/g;

async function tsFilesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return tsFilesUnder(full);
      if (!entry.name.endsWith(".ts")) return [];
      if (entry.name.endsWith(".test.ts")) return [];
      return [full];
    }),
  );
  return files.flat();
}

describe("palette is the single source of colour", () => {
  it("no colour literal appears outside palette.ts", async () => {
    const files = await tsFilesUnder(SRC);
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(SRC, file);
      if (rel === PALETTE_MODULE) continue;
      if (EXEMPT.some((e) => rel.startsWith(e.prefix))) continue;

      const source = await readFile(file, "utf8");

      for (const [match] of source.matchAll(HEX)) {
        offenders.push(`${rel}: ${match}`);
      }

      // Neutral overlays — black, white, any grey — are opacity, not colour:
      // a shadow or a hover wash is not a palette entry. Anything with a hue
      // is, and belongs in palette.ts.
      for (const [match, r, g, b] of source.matchAll(RGB)) {
        if (r === g && g === b) continue;
        offenders.push(`${rel}: ${match})`);
      }
    }

    expect(
      offenders,
      `Colour literals must live in src/${PALETTE_MODULE}. Found:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the generated stylesheet regions are up to date", async () => {
    const targets = [
      { path: join(ROOT, "public/style.css"), render: renderFallbackCss },
      { path: join(ROOT, "public/editor.css"), render: renderEditorCss },
    ];

    for (const target of targets) {
      const current = await readFile(target.path, "utf8");
      const expected = replaceGeneratedRegion(current, target.render(), target.path);
      expect(
        current,
        `${relative(ROOT, target.path)} is out of step with the palette. ` +
          `Run \`npm run build:palette\`.`,
      ).toBe(expected);
    }
  });

  it("alpha() renders a palette colour at opacity", () => {
    expect(alpha(PALETTE.light.text, 0.04)).toBe("rgba(35, 48, 42, 0.04)");
    expect(alpha("#fff", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
    expect(() => alpha("not-a-colour", 0.5)).toThrow();
  });
});

describe("wordmark", () => {
  it("the footer follows the header rather than hardcoding a brand", () => {
    const html = generateHtml({
      ...DEFAULT_TEMPLATE,
      sections: DEFAULT_TEMPLATE.sections.map((section) =>
        section.type === "header"
          ? { ...section, logoText: "field", logoDotText: "notes" }
          : section,
      ),
    });

    const footer = html.slice(html.indexOf("<footer"));
    expect(footer).toContain("field");
    expect(footer).toContain("notes");
    expect(footer).not.toContain("nobodyreads");
  });

  it("a footer may override the header's wordmark", () => {
    const html = generateHtml({
      ...DEFAULT_TEMPLATE,
      sections: DEFAULT_TEMPLATE.sections.map((section) =>
        section.type === "footer"
          ? { ...section, logoText: "sub", logoDotText: "stack" }
          : section,
      ),
    });

    expect(html.slice(html.indexOf("<footer"))).toContain("sub");
  });

  it("falls back to the site's own name when there is no header", () => {
    const html = generateHtml({
      ...DEFAULT_TEMPLATE,
      sections: [{ type: "footer", enabled: true, showWordmark: true }],
    });

    expect(html).toContain("{{siteName}}");
    expect(html).not.toContain("nobodyreads");
  });

  it("omits the dot when there is no suffix to follow it", () => {
    const html = generateHtml({
      ...DEFAULT_TEMPLATE,
      sections: [
        {
          type: "header",
          enabled: true,
          showHero: false,
          showTagline: false,
          logoText: "field notes",
          logoDotText: "",
        },
      ],
    });

    expect(html).toContain("field notes");
    expect(html).not.toContain('class="dot"');
  });
});
