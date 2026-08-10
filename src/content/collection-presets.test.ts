import { describe, it, expect } from "vitest";
import { COLLECTION_PRESETS, getCollectionPreset } from "./collection-presets.js";
import { validateCollectionTemplate, renderCollectionTemplate } from "./collection-template.js";
import { validateCustomQuery, CUSTOM_VIEW_ALLOWED_TABLES } from "./custom-view-sql.js";

/**
 * A preset exists so the create screen never starts from an empty SQL box. That
 * only holds if every preset is something the save route would actually accept
 * — a preset the author has to fix before saving is worse than no preset.
 */
describe("every preset is savable as-is", () => {
  it.each(COLLECTION_PRESETS.map((p) => [p.id, p] as const))(
    "%s passes query validation",
    (_id, preset) => {
      expect(validateCustomQuery(preset.query)).toBeNull();
    },
  );

  it.each(COLLECTION_PRESETS.map((p) => [p.id, p] as const))(
    "%s passes template validation",
    (_id, preset) => {
      expect(validateCollectionTemplate(preset.template)).toBeNull();
    },
  );

  it.each(COLLECTION_PRESETS.map((p) => [p.id, p] as const))(
    "%s renders rows without throwing",
    (_id, preset) => {
      const html = renderCollectionTemplate(preset.template, {
        rows: [{ slug: "a", title: "A post", excerpt: "Words.", date: "2026-08-02", likes: 3 }],
        urlPrefix: "/alice",
      });
      expect(html).toContain("A post");
      expect(html).toContain("/alice/posts/a");
    },
  );
});

describe("preset queries stay inside the allowlist", () => {
  it("reads only permitted tables", () => {
    for (const preset of COLLECTION_PRESETS) {
      for (const table of ["page", "tenant", "site_settings", "subscriber"]) {
        expect(preset.query.toLowerCase(), preset.id).not.toMatch(
          new RegExp(`\\b(from|join)\\s+${table}\\b`),
        );
      }
    }
  });

  it("scopes every preset to the tenant", () => {
    for (const preset of COLLECTION_PRESETS) {
      expect(preset.query, preset.id).toContain(":tenant_id");
    }
  });

  it("only joins tables the allowlist names", () => {
    const joined = COLLECTION_PRESETS.flatMap((p) => [...p.query.matchAll(/\bJOIN\s+(\w+)/gi)]).map(
      (m) => m[1]!.toLowerCase(),
    );
    for (const table of joined) {
      expect(CUSTOM_VIEW_ALLOWED_TABLES as readonly string[]).toContain(table);
    }
  });
});

describe("preset metadata", () => {
  it("has unique ids and a prompt for each", () => {
    const ids = COLLECTION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of COLLECTION_PRESETS) {
      expect(preset.prompt.trim().length, preset.id).toBeGreaterThan(0);
      expect(preset.description.trim().length, preset.id).toBeGreaterThan(0);
    }
  });

  it("offers the four §8 names", () => {
    expect(COLLECTION_PRESETS.map((p) => p.label)).toEqual([
      "All posts",
      "By tag",
      "Most liked",
      "A series",
    ]);
  });

  it("looks up by id", () => {
    expect(getCollectionPreset("by-tag")?.label).toBe("By tag");
    expect(getCollectionPreset("nope")).toBeUndefined();
  });
});
