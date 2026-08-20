import { describe, it, expect } from "vitest";
import { readScratchTemplate } from "./preview.js";
import { DEFAULT_TEMPLATE } from "../template/defaults.js";

function post(body: string): Request {
  return new Request("https://example.com/preview", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ template: body }),
  });
}

describe("readScratchTemplate", () => {
  it("reads a template the editor posted", async () => {
    const sent = { ...DEFAULT_TEMPLATE, customCss: ".x { color: red }" };

    const got = await readScratchTemplate(post(JSON.stringify(sent)));

    expect(got?.customCss).toBe(".x { color: red }");
  });

  it("ignores a GET, so the saved draft still renders", async () => {
    const request = new Request("https://example.com/preview");

    expect(await readScratchTemplate(request)).toBeNull();
  });

  it("ignores a POST carrying no template", async () => {
    const request = new Request("https://example.com/preview", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ something: "else" }),
    });

    expect(await readScratchTemplate(request)).toBeNull();
  });

  it("ignores unparseable JSON rather than failing the render", async () => {
    expect(await readScratchTemplate(post("{ not json"))).toBeNull();
  });

  /**
   * The layout reads `tokens.light` without guarding it. A body that parses but
   * has no tokens would take the whole page down mid-edit, which is a worse
   * answer than showing the last good render.
   */
  it("ignores a template with no token set", async () => {
    expect(await readScratchTemplate(post(JSON.stringify({ layoutHtml: "<p>hi</p>" })))).toBeNull();
    expect(await readScratchTemplate(post(JSON.stringify({ tokens: {} })))).toBeNull();
    expect(await readScratchTemplate(post("null"))).toBeNull();
  });
});
