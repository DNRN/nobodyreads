import { describe, expect, it } from "vitest";
import type { ManifestEntry } from "./manifest.js";
import type { ImportItem, ImportProposal } from "./proposal.js";
import { proposalIsValid, validateProposal } from "./validate.js";

/**
 * Validation is the mechanical half of "accept or reject": it must catch
 * what a model plausibly gets wrong — slug collisions, invented media urls,
 * smuggled markup — deterministically, before the owner ever weighs in.
 */

function entry(key: string): ManifestEntry {
  return { source: `${key}`, key, url: `/media/${key}`, alt: null, mediaId: `m-${key}` };
}

function item(overrides: Partial<ImportItem>): ImportItem {
  return {
    kind: "post",
    title: "A title",
    slug: "a-title",
    excerpt: "x",
    tags: [],
    bodyMarkdown: "Some prose.",
    reason: "r",
    ...overrides,
  };
}

function proposal(items: ImportItem[], notes = "n"): ImportProposal {
  return { items, notes };
}

const manifest = [entry("one.png"), entry("two.png")];

describe("validateProposal", () => {
  it("passes a clean proposal", () => {
    const validation = validateProposal(proposal([item({})]), manifest, new Set());

    expect(proposalIsValid(validation)).toBe(true);
  });

  it("flags slugs that are not kebab-case", () => {
    const validation = validateProposal(
      proposal([item({ slug: "Ikke Kebab" })]),
      manifest,
      new Set(),
    );

    expect(validation.itemErrors[0]?.[0]).toContain("kebab-case");
  });

  it("flags a slug reused within the proposal and one already owned by the tenant", () => {
    const validation = validateProposal(
      proposal([item({ slug: "same" }), item({ slug: "same" })]),
      manifest,
      new Set(["existing"]),
    );

    expect(validation.itemErrors[1]).toContainEqual(expect.stringContaining("item 1"));
    const second = validateProposal(proposal([item({ slug: "existing" })]), manifest, new Set(["existing"]));
    expect(second.itemErrors[0]).toContainEqual(expect.stringContaining("already used"));
  });

  it("flags body and cover references to images that were never staged", () => {
    const invented = item({ bodyMarkdown: "![x](/media/invented.png)" });
    const hotlink = item({ bodyMarkdown: "![x](https://cdn.example.net/x.png)", coverImageKey: "nope.png" });

    const validation = validateProposal(proposal([invented, hotlink]), manifest, new Set());

    expect(validation.itemErrors[0]).toContainEqual(expect.stringContaining("/media/invented.png"));
    expect(validation.itemErrors[1]).toContainEqual(expect.stringContaining("Cover image"));
  });

  it("accepts staged urls wherever they appear in the body", () => {
    const body = "Before\n\n![one](/media/one.png)\n\nAfter ![two](/media/two.png)";
    const validation = validateProposal(
      proposal([item({ bodyMarkdown: body, coverImageKey: "two.png" })]),
      manifest,
      new Set(),
    );

    expect(proposalIsValid(validation)).toBe(true);
  });

  it("refuses script and iframe markup in bodies", () => {
    const validation = validateProposal(
      proposal([item({ bodyMarkdown: "hi <SCRIPT>alert(1)</script>" })]),
      manifest,
      new Set(),
    );

    expect(validation.itemErrors[0]).toContainEqual(expect.stringContaining("script/iframe"));
  });

  it("flags empty and oversized proposals at the proposal level", () => {
    expect(validateProposal(proposal([]), manifest, new Set()).errors).toContainEqual(
      "The proposal contains no items.",
    );
    const many = Array.from({ length: 51 }, () => item({ slug: `i-${Math.random()}`.slice(0, 12) }));
    expect(validateProposal(proposal(many), manifest, new Set()).errors[0]).toContain("cap is 50");
  });
});
