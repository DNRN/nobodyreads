import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./render.js";

describe("renderMarkdown heading normalisation", () => {
  const title = "Amateur Mycologist #1";

  it("drops a leading H1 that repeats the page title", () => {
    const html = renderMarkdown(`# ${title}\n\nSpores everywhere.`, { pageTitle: title });
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<h2");
    expect(html).toContain("Spores everywhere.");
  });

  it("ignores punctuation and case when matching the title", () => {
    const html = renderMarkdown("# amateur mycologist 1\n\nBody.", { pageTitle: title });
    expect(html).not.toMatch(/<h[12]/);
  });

  it("keeps a leading H1 that says something else, demoted to H2", () => {
    const html = renderMarkdown("# Field notes\n\nBody.", { pageTitle: title });
    expect(html).toContain("<h2");
    expect(html).toContain("Field notes");
    expect(html).not.toContain("<h1");
  });

  it("demotes H1s further down the body", () => {
    const html = renderMarkdown(`# ${title}\n\n## Part one\n\n# Part two`, { pageTitle: title });
    expect(html).not.toContain("<h1");
    expect(html).toContain("Part one");
    expect(html).toContain("Part two");
    expect(html.match(/<h2/g)).toHaveLength(2);
  });

  it("leaves deeper headings alone", () => {
    const html = renderMarkdown("## Two\n\n### Three", { pageTitle: title });
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
  });

  it("does not touch '#' inside fenced code blocks", () => {
    const md = "Intro.\n\n```sh\n# not a heading\necho hi\n```\n";
    const html = renderMarkdown(md, { pageTitle: title });
    expect(html).toContain("# not a heading");
    expect(html).not.toMatch(/<h[1-6]/);
  });

  it("only strips the title when it leads the document", () => {
    const html = renderMarkdown(`Intro.\n\n# ${title}\n`, { pageTitle: title });
    expect(html).toContain("<h2");
    expect(html).toContain(title);
  });

  it("leaves the body untouched when no page title is supplied", () => {
    const html = renderMarkdown(`# ${title}\n\nBody.`);
    expect(html).toContain("<h1");
  });

  it("treats a blank page title as no page title", () => {
    const html = renderMarkdown("# Heading\n\nBody.", { pageTitle: "   " });
    expect(html).toContain("<h1");
  });

  it("still renders images through the custom renderer", () => {
    const html = renderMarkdown(`# ${title}\n\n![shot|w=50](/a.png)`, { pageTitle: title });
    expect(html).toContain("<img");
    expect(html).not.toContain("<h1");
  });
});
