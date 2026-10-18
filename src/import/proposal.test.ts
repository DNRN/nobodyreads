import { describe, expect, it } from "vitest";
import { assembleBody, importItemSchema, importProposalSchema, parseImportProposal } from "./proposal.js";

/** The schema is the boundary between the model and the pipeline. */
const validItem = {
  kind: "post",
  title: "First find",
  slug: "first-find",
  excerpt: "What the walk produced.",
  tags: ["walks"],
  bodyLines: ["# First find", "", "A specimen."],
  reason: "The deck's opening topic.",
};

const validProposal = { items: [validItem], notes: "One post: the deck is short." };

describe("importProposalSchema", () => {
  it("accepts a minimal valid proposal", () => {
    const parsed = importProposalSchema.parse(validProposal);

    expect(parsed.items[0].coverImageKey).toBeUndefined();
    expect(parsed.items[0].nav).toBeUndefined();
  });

  it("accepts pages, nav, and cover images", () => {
    const parsed = importProposalSchema.parse({
      items: [
        {
          ...validItem,
          kind: "page",
          coverImageKey: "abc.png",
          nav: { label: "Guide", order: 2 },
        },
      ],
      notes: "n",
    });

    expect(parsed.items[0].kind).toBe("page");
    expect(parsed.items[0].nav?.label).toBe("Guide");
  });

  it("refuses items without title or body lines", () => {
    expect(importItemSchema.safeParse({ ...validItem, title: " " }).success).toBe(false);
    expect(importItemSchema.safeParse({ ...validItem, bodyLines: [] }).success).toBe(false);
  });

  it("refuses embedded newlines inside a body line", () => {
    expect(
      importItemSchema.safeParse({ ...validItem, bodyLines: ["a\nb"] }).success,
    ).toBe(false);
  });

  it("refuses unknown kinds and missing notes", () => {
    expect(importItemSchema.safeParse({ ...validItem, kind: "category" }).success).toBe(false);
    expect(importProposalSchema.safeParse({ items: [validItem] }).success).toBe(false);
  });

  it("caps the item count at 50", () => {
    const items = Array.from({ length: 51 }, () => validItem);

    expect(importProposalSchema.safeParse({ items, notes: "n" }).success).toBe(false);
  });
});

describe("assembleBody", () => {
  it("joins lines, keeping blank-line entries as paragraph breaks", () => {
    expect(assembleBody(["# T", "", "One.", "", "Two."])).toBe("# T\n\nOne.\n\nTwo.");
  });

  it("strips trailing spaces that would become hard breaks", () => {
    expect(assembleBody(["One.  ", "Two.\t"])).toBe("One.\nTwo.");
  });
});

describe("parseImportProposal", () => {
  it("assembles bodyMarkdown from bodyLines and returns the public shape", () => {
    const parsed = parseImportProposal(validProposal);
    const { bodyLines: _bodyLines, ...expectedItem } = validItem;

    expect(parsed).toEqual({
      items: [{ ...expectedItem, bodyMarkdown: "# First find\n\nA specimen." }],
      notes: "One post: the deck is short.",
    });
  });

  it("returns null on garbage, never throws", () => {
    expect(parseImportProposal("{oops")).toBeNull();
    expect(parseImportProposal({ items: [], notes: "" })).toEqual({ items: [], notes: "" });
  });
});
