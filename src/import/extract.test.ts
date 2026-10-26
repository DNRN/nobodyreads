import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractOutline } from "./extract.js";
import type { DocumentOutline } from "./types.js";

/**
 * The extractor decides what an imported page *is* — which text, lists and
 * images survive, and which presentation never reaches the model. These
 * tests pin that boundary on a fixture shaped like the real first target
 * (a reveal.js-style deck): fragments, gallery cards, quiz flips, speaker
 * notes, credits.
 */

const deckFixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures", "deck.html"),
  "utf8",
);

function section(outline: DocumentOutline, index: number) {
  return outline.sections[index];
}

describe("extractOutline — sectioned deck", () => {
  const outline = extractOutline(deckFixture);

  it("takes the title and language from the document", () => {
    expect(outline.title).toBe("Field Notes");
    expect(outline.language).toBe("en");
  });

  it("makes one section per top-level section element", () => {
    expect(outline.sections).toHaveLength(6);
  });

  it("promotes the first heading and keeps kicker/author as prose", () => {
    const title = section(outline, 0);
    expect(title.heading).toBe("Field Notes");
    expect(title.blocks).toEqual([
      { type: "text", text: "Autumn walks" },
      { type: "text", text: "A. Collector" },
    ]);
  });

  it("flattens inline emphasis and keeps document order", () => {
    const found = section(outline, 1);
    expect(found.heading).toBe("What we found");
    expect(found.blocks).toEqual([
      { type: "text", text: "We found the first specimens after rain." },
      { type: "text", text: "Note the ring on the stalk." },
      { type: "image", src: "photos/hero.png", alt: "A specimen in situ" },
    ]);
  });

  it("keeps h3s inside a section as sub-headings, not section titles", () => {
    const habitats = section(outline, 2);
    expect(habitats.heading).toBe("Three habitats");
    const headings = habitats.blocks.filter((block) => block.type === "heading");
    expect(headings).toEqual([
      { type: "heading", level: 3, text: "Moss" },
      { type: "heading", level: 3, text: "Pine" },
    ]);
    // Gallery label text survives as prose.
    expect(habitats.blocks).toContainEqual({ type: "text", text: "Tap a photo to enlarge" });
  });

  it("drops buttons but keeps the image and verdict text around them", () => {
    const quiz = section(outline, 3);
    expect(quiz.blocks).toEqual([
      { type: "image", src: "photos/quiz-1.jpg", alt: "" },
      { type: "text", text: "Keep" },
      { type: "text", text: "Waxy cap" },
      { type: "footnote", text: "Let the audience shout before flipping." },
    ]);
  });

  it("captures lists, captions, and rule text", () => {
    const comparison = section(outline, 4);
    expect(comparison.blocks).toEqual([
      { type: "list", ordered: false, items: ["Grows in tight clusters", "Small outward scales"] },
      { type: "image", src: "photos/compare.png", alt: "Side by side" },
      { type: "caption", text: "The two species side by side" },
      { type: "text", text: "When in doubt, leave it." },
    ]);
  });

  it("never emits script, style, canvas, or svg content", () => {
    const allText = JSON.stringify(outline);
    expect(allText).not.toContain("rebeccapurple");
    expect(allText).not.toContain("window.deck");
    expect(allText).not.toContain("decoration only");
    expect(allText).not.toContain("deck.css");
  });

  it("lists every unique image in document order", () => {
    expect(outline.images).toEqual([
      "photos/hero.png",
      "photos/moss.jpg",
      "photos/pine.jpg",
      "photos/quiz-1.jpg",
      "photos/compare.png",
    ]);
  });
});

describe("extractOutline — plain document", () => {
  const outline = extractOutline(`<!doctype html>
<html lang="da">
<head><title>En gammel side</title></head>
<body>
  <p>En indledning uden overskrift.</p>
  <h1>Første afsnit</h1>
  <p>Tekst &mdash; med tankestreg.</p>
  <img src="billede.jpg" alt="Et billede">
  <h2>Underafsnit</h2>
  <ol><li>Et</li><li>To</li></ol>
  <h1>Andet afsnit</h1>
  <img src="data:image/png;base64,AAAA" alt="indlejret">
  <img src="https://cdn.example.net/fjern.png" alt="fjern">
</body>
</html>`);

  it("splits by headings when there are no section elements", () => {
    expect(outline.language).toBe("da");
    expect(outline.title).toBe("En gammel side");
    expect(outline.sections.map((s) => s.heading)).toEqual([
      null,
      "Første afsnit",
      "Underafsnit",
      "Andet afsnit",
    ]);
  });

  it("keeps the preamble as its own untitled section", () => {
    expect(outline.sections[0].blocks).toEqual([{ type: "text", text: "En indledning uden overskrift." }]);
  });

  it("captures ordered lists", () => {
    expect(outline.sections[2].blocks).toEqual([
      { type: "list", ordered: true, items: ["Et", "To"] },
    ]);
  });

  it("skips data: URIs but keeps remote and relative srcs", () => {
    expect(outline.images).toEqual(["billede.jpg", "https://cdn.example.net/fjern.png"]);
  });
});
