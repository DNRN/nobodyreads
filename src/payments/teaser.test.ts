import { describe, it, expect } from "vitest";
import type { Page } from "../content/types.js";
import { buildTeaser } from "./teaser.js";

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: "p1",
    slug: "post",
    title: "Post",
    content: "",
    excerpt: "",
    tags: [],
    date: "2026-01-01",
    published: true,
    kind: "post",
    commentsEnabled: true,
    inFeed: true,
    accessTier: "paid",
    priceAmount: null,
    ...overrides,
  };
}

describe("priority order", () => {
  it("prefers an explicit <!--paywall--> marker over everything else", () => {
    const page = makePage({
      excerpt: "The stored excerpt.",
      content: "Above the fold.\n\n<!--paywall-->\n\nPaid body.",
    });

    const teaser = buildTeaser(page);
    expect(teaser).toBe("Above the fold.");
    expect(teaser).not.toContain("Paid body.");
  });

  it("accepts <!--more--> as the same marker", () => {
    const page = makePage({ content: "Free part.\n\n<!--more-->\n\nPaid part." });
    expect(buildTeaser(page)).toBe("Free part.");
  });

  it("falls back to the author's excerpt when there is no marker", () => {
    const page = makePage({ excerpt: "The stored excerpt.", content: "Paid body." });
    expect(buildTeaser(page)).toBe("The stored excerpt.");
  });

  it("falls back to the body when there is no marker and no excerpt", () => {
    const page = makePage({ content: "First paragraph.\n\nSecond paragraph." });
    expect(buildTeaser(page)).toContain("First paragraph.");
  });

  it("ignores a marker with nothing above it and falls through", () => {
    const page = makePage({ excerpt: "Excerpt.", content: "<!--paywall-->\n\nBody." });
    expect(buildTeaser(page)).toBe("Excerpt.");
  });
});

describe("word-budget fallback", () => {
  it("stops once the budget is spent and marks the cut", () => {
    const page = makePage({
      content: ["one two three", "four five six", "seven eight nine"].join("\n\n"),
    });

    const teaser = buildTeaser(page, { words: 4 });
    expect(teaser).toContain("one two three");
    expect(teaser).toContain("four five six");
    expect(teaser).not.toContain("seven eight nine");
    expect(teaser.endsWith("…")).toBe(true);
  });

  it("does not append an ellipsis when the whole body fits", () => {
    const page = makePage({ content: "short body" });
    expect(buildTeaser(page, { words: 50 })).toBe("short body");
  });

  it("returns empty for an empty body", () => {
    expect(buildTeaser(makePage({ content: "" }))).toBe("");
  });
});

describe("never cuts mid-markdown", () => {
  it("takes a fenced code block whole or not at all", () => {
    const page = makePage({
      content: ["intro words here", "```js\nconst secret = 1;\nconst more = 2;\n```", "after"].join(
        "\n\n",
      ),
    });

    const teaser = buildTeaser(page, { words: 2 });
    // An unbalanced ``` would swallow the rest of the page, paywall CTA included.
    const fences = (teaser.match(/```/g) ?? []).length;
    expect(fences % 2).toBe(0);
  });

  it("never leaves a dangling HTML comment open", () => {
    const page = makePage({
      content: ["some intro text", "<!-- a long\nmulti-line note -->", "body"].join("\n\n"),
    });

    const teaser = buildTeaser(page, { words: 2 });
    const opens = (teaser.match(/<!--/g) ?? []).length;
    const closes = (teaser.match(/-->/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});

describe("collection tokens", () => {
  it("strips {{collection:slug}} so no query runs for an unpaid reader", () => {
    const page = makePage({ content: "Intro.\n\n{{collection:latest-posts}}\n\nMore." });
    expect(buildTeaser(page)).not.toContain("{{collection:");
  });

  it("strips them from above a paywall marker too", () => {
    const page = makePage({
      content: "Intro {{collection:secret-list}} tail.\n\n<!--paywall-->\n\nBody.",
    });
    const teaser = buildTeaser(page);
    expect(teaser).not.toContain("{{collection:");
    expect(teaser).toContain("Intro");
  });

  it("strips several tokens in one teaser", () => {
    const page = makePage({
      content: "A {{collection:one}} B {{collection:two}} C.\n\n<!--paywall-->\n\nBody.",
    });
    const teaser = buildTeaser(page);
    expect(teaser).not.toContain("{{");
    expect(teaser).toContain("A");
    expect(teaser).toContain("C");
  });
});

describe("the stored excerpt is never modified", () => {
  it("derives in memory only", () => {
    const page = makePage({ content: "a b c d e f g h" });
    buildTeaser(page, { words: 2 });
    // RSS, the newsletter and meta descriptions all keep reading this verbatim.
    expect(page.excerpt).toBe("");
  });
});
