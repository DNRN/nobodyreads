import { describe, it, expect } from "vitest";
import {
  formatImageAlt,
  parseImageAlt,
  renderImage,
  firstImageUrl,
  imageMarkdown,
} from "./image-markdown.js";

/**
 * The alt slot is the contract between what an author writes, what the editor's
 * image controls manipulate, and what the server renders. It had no tests.
 */
describe("parseImageAlt", () => {
  it("reads plain alt text", () => {
    expect(parseImageAlt("a sunset")).toEqual({ alt: "a sunset", extra: [] });
  });

  it("reads a width hint", () => {
    expect(parseImageAlt("sunset|600px")).toMatchObject({ alt: "sunset", size: "600px" });
  });

  it("reads percentage and fixed dimensions", () => {
    expect(parseImageAlt("x|50%").size).toBe("50%");
    expect(parseImageAlt("x|300x200").size).toBe("300x200");
  });

  it("reads alignment in any order, combined with size", () => {
    expect(parseImageAlt("sunset|400px|right")).toMatchObject({
      alt: "sunset",
      size: "400px",
      align: "right",
    });
    expect(parseImageAlt("sunset|right|400px")).toMatchObject({
      size: "400px",
      align: "right",
    });
  });

  it("keeps unrecognised segments instead of dropping them", () => {
    expect(parseImageAlt("sunset|wat|left")).toMatchObject({
      alt: "sunset",
      align: "left",
      extra: ["wat"],
    });
  });

  it("treats the first segment as alt even when it looks like a hint", () => {
    expect(parseImageAlt("600px").alt).toBe("600px");
  });

  it("tolerates an empty alt and stray separators", () => {
    expect(parseImageAlt("|left")).toMatchObject({ alt: "", align: "left" });
    expect(parseImageAlt("a||left")).toMatchObject({ alt: "a", align: "left" });
  });
});

describe("formatImageAlt", () => {
  it("round-trips a canonically ordered slot exactly", () => {
    for (const slot of ["sunset", "sunset|600px", "sunset|400px|right"]) {
      expect(formatImageAlt(parseImageAlt(slot))).toBe(slot);
    }
  });

  // Hints are order-independent to the renderer, so re-emitting them in
  // canonical order is normalisation rather than data loss. What matters is
  // that nothing disappears and a second pass is stable.
  it("normalises hint order without dropping anything", () => {
    expect(formatImageAlt(parseImageAlt("sunset|right|400px"))).toBe("sunset|400px|right");
    expect(formatImageAlt(parseImageAlt("sunset|wat|left"))).toBe("sunset|left|wat");
  });

  it("is stable on a second pass", () => {
    for (const slot of ["sunset|right|400px", "sunset|wat|left", "a||left"]) {
      const once = formatImageAlt(parseImageAlt(slot));
      expect(formatImageAlt(parseImageAlt(once))).toBe(once);
    }
  });

  it("omits absent parts", () => {
    expect(formatImageAlt({ alt: "a" })).toBe("a");
    expect(formatImageAlt({ alt: "a", align: "center" })).toBe("a|center");
  });

  // An image with no alt text is exactly the case the editor's alt-text nudge
  // exists for, so it is the one that must not corrupt. Dropping the empty alt
  // slot would shift the first hint into it: `![|600px]` → `![600px]`, an
  // unlabelled image silently described as "600px" and losing its width.
  it("holds the alt slot open when alt is empty but hints follow", () => {
    expect(formatImageAlt({ alt: "", size: "600px" })).toBe("|600px");
    expect(formatImageAlt({ alt: "", size: "300px", align: "right" })).toBe("|300px|right");
    expect(formatImageAlt({ alt: "" })).toBe("");
  });

  it("round-trips an empty alt with hints", () => {
    for (const slot of ["|600px", "|300px|right", "|left"]) {
      expect(formatImageAlt(parseImageAlt(slot))).toBe(slot);
      expect(parseImageAlt(slot).alt).toBe("");
    }
  });
});

describe("renderImage", () => {
  it("renders a bare image", () => {
    expect(renderImage({ href: "/m/a.png", text: "sunset" })).toBe(
      '<img src="/m/a.png" alt="sunset" />',
    );
  });

  it("applies a max-width for a size hint", () => {
    expect(renderImage({ href: "/m/a.png", text: "sunset|600px" })).toContain(
      'style="max-width: 600px"',
    );
  });

  it("applies fixed dimensions with cover", () => {
    const html = renderImage({ href: "/m/a.png", text: "x|300x200" });
    expect(html).toContain("width: 300px");
    expect(html).toContain("height: 200px");
    expect(html).toContain("object-fit: cover");
  });

  it("applies an alignment class", () => {
    expect(renderImage({ href: "/m/a.png", text: "x|right" })).toContain('class="nbr-img-right"');
  });

  it("escapes the alt text and href", () => {
    const html = renderImage({ href: '/m/a".png', text: 'a "quote" & <tag>' });
    expect(html).toContain("&quot;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;tag&gt;");
  });

  it("keeps the hints out of the rendered alt attribute", () => {
    expect(renderImage({ href: "/m/a.png", text: "sunset|400px|right" })).toContain(
      'alt="sunset"',
    );
  });
});

describe("helpers", () => {
  it("pre-fills the default width when inserting", () => {
    expect(imageMarkdown("sunset", "/m/a.png")).toBe("![sunset|600px](/m/a.png)");
  });

  it("finds the first image url in a body", () => {
    expect(firstImageUrl("text\n\n![a|600px](/m/a.png)\n\n![b](/m/b.png)")).toBe("/m/a.png");
    expect(firstImageUrl("no images here")).toBeUndefined();
  });
});
