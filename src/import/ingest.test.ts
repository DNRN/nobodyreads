import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  IMPORT_LIMITS,
  IngestError,
  ingestHtml,
  ingestZip,
  normalizeEntryName,
  type ImportLimits,
} from "./ingest.js";

/**
 * Ingest is the only stage that touches untrusted archive bytes. These tests
 * pin the safety boundary (path traversal, lying headers, caps) and the
 * document-selection rule, because a mistake in either imports the wrong
 * files or the wrong half of somebody's site.
 */

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function zipped(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: "uint8array" });
}

const tinyLimits: ImportLimits = { maxEntries: 5, maxTotalBytes: 1024, maxFileBytes: 512 };

describe("ingestZip", () => {
  it("reads the document, keeps image assets, and records the rest as skipped", async () => {
    const archive = await zipped({
      "index.html": "<p>hello</p>",
      "deck.css": "body { color: red; }",
      "photos/hero.png": PNG_BYTES,
      "photos/sub/deep.jpg": PNG_BYTES,
    });

    const doc = await ingestZip(archive, tinyLimits);

    expect(doc.htmlName).toBe("index.html");
    expect(doc.html).toBe("<p>hello</p>");
    expect([...doc.assets.keys()].sort()).toEqual(["photos/hero.png", "photos/sub/deep.jpg"]);
    expect(doc.assets.get("photos/hero.png")).toEqual(Buffer.from(PNG_BYTES));
    expect(doc.skipped).toEqual(["deck.css"]);
  });

  it("accepts a lone .html whatever it is named, case-insensitively", async () => {
    const archive = await zipped({ "SVAMPE.HTM": "<p>hej</p>", "photo.jpg": PNG_BYTES });

    const doc = await ingestZip(archive, tinyLimits);

    expect(doc.htmlName).toBe("SVAMPE.HTM");
  });

  it("refuses an archive with two competing documents", async () => {
    const archive = await zipped({ "a.html": "a", "b/index.html": "b" });

    await expect(ingestZip(archive, tinyLimits)).rejects.toMatchObject({
      code: "ambiguous-html",
      message: expect.stringContaining("a.html"),
    });
  });

  it("refuses an archive with no document", async () => {
    const archive = await zipped({ "photo.png": PNG_BYTES });

    await expect(ingestZip(archive, tinyLimits)).rejects.toMatchObject({ code: "no-html" });
  });

  it("refuses non-zip bytes", async () => {
    await expect(ingestZip(new TextEncoder().encode("not a zip"), tinyLimits)).rejects.toMatchObject({
      code: "not-a-zip",
    });
  });
  it("refuses unsafe entry names that survive in real archives", async () => {
    // jszip's writer normalizes "../x" and "a/../../x" away, so only the
    // backslash and absolute forms can actually be written and read back.
    // Hand-crafted archives carrying the rest are covered by the
    // normalizeEntryName unit tests below.
    for (const evil of ["..\\evil.png", "/etc/evil.png"]) {
      const archive = await zipped({ "index.html": "x", [evil]: PNG_BYTES });
      await expect(ingestZip(archive, tinyLimits), evil).rejects.toMatchObject({ code: "not-a-zip" });
    }
  });

  it("enforces the entry cap", async () => {
    const archive = await zipped({
      "index.html": "x",
      "a.png": PNG_BYTES,
      "b.png": PNG_BYTES,
      "c.png": PNG_BYTES,
      "d.png": PNG_BYTES,
      "e.png": PNG_BYTES,
      "f.png": PNG_BYTES,
    });

    await expect(ingestZip(archive, tinyLimits)).rejects.toMatchObject({ code: "too-many-entries" });
  });

  it("enforces the per-file cap on declared sizes before inflating", async () => {
    const archive = await zipped({ "index.html": "x", "big.png": PNG_BYTES });
    const limits: ImportLimits = { maxEntries: 5, maxTotalBytes: 1024, maxFileBytes: 4 };

    await expect(ingestZip(archive, limits)).rejects.toMatchObject({ code: "entry-too-large" });
  });

  it("enforces the total cap on actual inflated bytes", async () => {
    // Each file is under the per-file cap, together they exceed the total.
    const archive = await zipped({
      "index.html": "x",
      "a.png": new Uint8Array(400),
      "b.png": new Uint8Array(400),
      "c.png": new Uint8Array(400),
    });
    const limits: ImportLimits = { maxEntries: 5, maxTotalBytes: 1024, maxFileBytes: 512 };

    await expect(ingestZip(archive, limits)).rejects.toMatchObject({ code: "archive-too-large" });
  });

  it("uses the documented default limits when none are passed", () => {
    expect(IMPORT_LIMITS.maxEntries).toBe(200);
    expect(IMPORT_LIMITS.maxFileBytes).toBe(50 * 1024 * 1024);
  });
});

describe("normalizeEntryName", () => {
  it("normalizes separators and strips a leading ./", () => {
    expect(normalizeEntryName("./photos/hero.png")).toBe("photos/hero.png");
    expect(normalizeEntryName("photos\\hero.png")).toBe("photos/hero.png");
  });

  it("rejects unsafe names", () => {
    expect(normalizeEntryName("../evil.png")).toBeNull();
    expect(normalizeEntryName("photos/../evil.png")).toBeNull();
    expect(normalizeEntryName("/abs.png")).toBeNull();
    expect(normalizeEntryName("C:\\abs.png")).toBeNull();
    expect(normalizeEntryName("a//b.png")).toBeNull();
    expect(normalizeEntryName("bad\u0000name.png")).toBeNull();
    expect(normalizeEntryName("")).toBeNull();
  });
});

describe("ingestHtml", () => {
  it("wraps a pasted document with no assets", () => {
    const doc = ingestHtml("<p>hej</p>");

    expect(doc).toEqual({
      html: "<p>hej</p>",
      htmlName: "index.html",
      assets: new Map(),
      skipped: [],
    });
  });
});

describe("IngestError", () => {
  it("carries its code for route-level status mapping", () => {
    const error = new IngestError("no-html", "nothing here");

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("no-html");
    expect(error.message).toBe("nothing here");
  });
});
