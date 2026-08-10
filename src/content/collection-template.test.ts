import { describe, it, expect } from "vitest";
import {
  DEFAULT_COLLECTION_TEMPLATE,
  parseCollectionTemplate,
  renderCollectionTemplate,
  validateCollectionTemplate,
} from "./collection-template.js";

const render = (source: string, rows: Record<string, unknown>[] = [], urlPrefix = "") =>
  renderCollectionTemplate(source, { rows, urlPrefix });

const POSTS = [
  { slug: "reeling-in", title: "Reeling In the Right Gear", excerpt: "About gear.", date: "2026-08-02" },
  { slug: "reading-water", title: "Reading the Water", excerpt: "", date: "2026-07-18" },
];

describe("literal markup", () => {
  it("passes HTML through untouched", () => {
    expect(render('<div class="x">hi</div>')).toBe('<div class="x">hi</div>');
  });

  it("renders a value", () => {
    expect(render("{{#each rows}}{{title}}{{/each}}", [{ title: "One" }])).toBe("One");
  });

  it("renders a dotted path", () => {
    expect(render("{{#each rows}}{{a.b}}{{/each}}", [{ a: { b: "deep" } }])).toBe("deep");
  });

  it("renders a missing field as empty rather than failing", () => {
    expect(render("{{#each rows}}[{{nope}}]{{/each}}", [{ title: "x" }])).toBe("[]");
  });
});

describe("each", () => {
  it("repeats its body per row", () => {
    expect(render("{{#each rows}}<li>{{title}}</li>{{/each}}", POSTS)).toBe(
      "<li>Reeling In the Right Gear</li><li>Reading the Water</li>",
    );
  });

  it("renders nothing for no rows", () => {
    expect(render("{{#each rows}}<li>{{title}}</li>{{/each}}", [])).toBe("");
  });

  it("renders nothing when the value is not a list", () => {
    expect(render("{{#each title}}x{{/each}}", [{ title: "not a list" }])).toBe("");
  });

  it("lets a row field shadow the outer scope", () => {
    expect(render("{{#each rows}}{{rows}}{{/each}}", [{ rows: "inner" }])).toBe("inner");
  });
});

describe("if / else", () => {
  it("takes the branch when a value is present", () => {
    const out = render("{{#each rows}}{{#if excerpt}}<p>{{excerpt}}</p>{{/if}}{{/each}}", POSTS);
    expect(out).toBe("<p>About gear.</p>");
  });

  it("falls through to else", () => {
    const out = render("{{#each rows}}{{#if excerpt}}yes{{else}}no{{/if}}{{/each}}", POSTS);
    expect(out).toBe("yesno");
  });

  // Whitespace-only strings read as absent: an empty excerpt column should not
  // produce an empty <p>.
  it("treats blank strings and empty lists as absent", () => {
    expect(render("{{#if a}}y{{else}}n{{/if}}", [], "")).toBe("n");
    expect(render("{{#each rows}}{{#if a}}y{{else}}n{{/if}}{{/each}}", [{ a: "   " }])).toBe("n");
    expect(render("{{#each rows}}{{#if a}}y{{else}}n{{/if}}{{/each}}", [{ a: [] }])).toBe("n");
  });
});

describe("helpers", () => {
  it("builds site and post URLs with the tenant prefix", () => {
    expect(render("{{#each rows}}{{url slug}}{{/each}}", [{ slug: "about" }], "/alice")).toBe(
      "/alice/about",
    );
    expect(render("{{#each rows}}{{postUrl slug}}{{/each}}", [{ slug: "a" }], "/alice")).toBe(
      "/alice/posts/a",
    );
  });

  it("does not double the separator on a leading slash", () => {
    expect(render("{{#each rows}}{{url slug}}{{/each}}", [{ slug: "/about" }], "/alice")).toBe(
      "/alice/about",
    );
  });

  it("formats a date and leaves nonsense alone", () => {
    expect(render("{{#each rows}}{{date date}}{{/each}}", [{ date: "2026-08-02" }])).toBe(
      "2 Aug 2026",
    );
    expect(render("{{#each rows}}{{date date}}{{/each}}", [{ date: "soon" }])).toBe("soon");
  });
});

/**
 * The reason this language exists. The previous implementation was
 * `new Function(rows, urlPrefix, escapeHtml, template)` — arbitrary server-side
 * JavaScript with `process.env` in scope, which is why custom collections had
 * to ship disabled. Nothing here may evaluate code or reach beyond the row.
 */
describe("a template cannot execute code or escape its data", () => {
  it("escapes every interpolated value", () => {
    const out = render("{{#each rows}}{{title}}{{/each}}", [
      { title: '<script>alert(1)</script>' },
    ]);
    expect(out).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).not.toContain("<script>");
  });

  it("escapes quotes so a value cannot break out of an attribute", () => {
    const out = render('{{#each rows}}<a title="{{title}}">x</a>{{/each}}', [
      { title: '" onmouseover="alert(1)' },
    ]);
    expect(out).toContain("&quot;");
    expect(out).not.toContain('onmouseover="alert');
  });

  it("has no raw-output form", () => {
    // Triple braces are not special: the inner brace is literal text.
    const out = render("{{#each rows}}{{{title}}}{{/each}}", [{ title: "<b>x</b>" }]);
    expect(out).not.toContain("<b>");
  });

  it("cannot reach the prototype chain", () => {
    for (const path of ["constructor", "__proto__", "constructor.constructor", "toString"]) {
      expect(render(`{{#each rows}}[{{${path}}}]{{/each}}`, [{ title: "x" }])).toBe("[]");
    }
  });

  it("rejects an unknown helper instead of trying to call it", () => {
    expect(validateCollectionTemplate("{{require fs}}")).toMatch(/unknown helper/);
    expect(validateCollectionTemplate("{{eval x}}")).toMatch(/unknown helper/);
  });
});

describe("parse errors", () => {
  it("reports an unclosed block", () => {
    expect(validateCollectionTemplate("{{#each rows}}<li>")).toMatch(/never closed/);
  });

  it("reports a mismatched close", () => {
    expect(validateCollectionTemplate("{{#each rows}}{{/if}}")).toMatch(/closes a/);
  });

  it("reports a stray close and a stray else", () => {
    expect(validateCollectionTemplate("{{/each}}")).toMatch(/no matching opening tag/);
    expect(validateCollectionTemplate("{{else}}")).toMatch(/outside an/);
  });

  it("reports an empty tag and a bad helper arity", () => {
    expect(validateCollectionTemplate("{{}}")).toMatch(/empty/);
    expect(validateCollectionTemplate("{{date a b}}")).toMatch(/exactly one value/);
  });

  it("passes a well-formed template", () => {
    expect(validateCollectionTemplate(DEFAULT_COLLECTION_TEMPLATE)).toBeNull();
  });

  it("throws on render only when the template does not parse", () => {
    expect(() => render("{{#each rows}}")).toThrow(/never closed/);
  });
});

describe("the default template", () => {
  it("renders real rows into post markup", () => {
    const out = render(DEFAULT_COLLECTION_TEMPLATE, POSTS, "/alice");
    expect(out).toContain("Reeling In the Right Gear");
    expect(out).toContain('href="/alice/posts/reeling-in"');
    expect(out).toContain("2 Aug 2026");
    // The second post has no excerpt, so only one <p> should appear.
    expect(out.match(/post-excerpt/g)).toHaveLength(1);
  });

  it("parses to a stable node tree", () => {
    const parsed = parseCollectionTemplate(DEFAULT_COLLECTION_TEMPLATE);
    expect(parsed.ok).toBe(true);
  });
});
