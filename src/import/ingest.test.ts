import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  IMPORT_LIMITS,
  IngestError,
  ingestHtml,
  ingestUrl,
  ingestZip,
  isBlockedAddress,
  normalizeEntryName,
  type ImportLimits,
} from "./ingest.js";
import { extractOutline } from "./extract.js";
import { resolveAssetKey } from "./manifest.js";
import { createServer, type AddressInfo, type IncomingMessage, type Server, type ServerResponse } from "node:http";

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

// --- URL ingest ---
//
// The URL path adds an untrusted *host* to the untrusted bytes, so these
// tests pin the SSRF boundary (who may be fetched, ever) and the contract
// with the rest of the pipeline (a URL document must stage exactly like a
// zipped web root: rewritten srcs resolve back to the fetched assets).

type LocalServer = { server: Server; origin: string; hits: string[] };

async function localServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<LocalServer> {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url ?? "");
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    hits,
  };
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

const urlLimits: ImportLimits = { maxEntries: 5, maxTotalBytes: 64 * 1024, maxFileBytes: 32 * 1024 };

describe("isBlockedAddress", () => {
  it("blocks loopback only without the opt-in, private ranges never", () => {
    expect(isBlockedAddress("8.8.8.8", false)).toBe(false);
    expect(isBlockedAddress("2606:4700::1111", false)).toBe(false);
    expect(isBlockedAddress("127.0.0.1", false)).toBe(true);
    expect(isBlockedAddress("::1", false)).toBe(true);
    expect(isBlockedAddress("127.0.0.1", true)).toBe(false);
    expect(isBlockedAddress("::1", true)).toBe(false);
    // Private, link-local, and unique-local stay refused with the opt-in.
    expect(isBlockedAddress("10.0.0.1", true)).toBe(true);
    expect(isBlockedAddress("172.16.0.9", true)).toBe(true);
    expect(isBlockedAddress("192.168.4.4", true)).toBe(true);
    expect(isBlockedAddress("169.254.169.254", true)).toBe(true);
    expect(isBlockedAddress("0.0.0.0", true)).toBe(true);
    expect(isBlockedAddress("fe80::1", true)).toBe(true);
    expect(isBlockedAddress("fc00::5", true)).toBe(true);
    // An IPv4-in-IPv6 address is judged by the embedded address too.
    expect(isBlockedAddress("::ffff:10.0.0.1", true)).toBe(true);
    expect(isBlockedAddress("::ffff:8.8.8.8", false)).toBe(false);
    expect(isBlockedAddress("64:ff9b::10.0.0.1", true)).toBe(true);
    expect(isBlockedAddress("64:ff9b::8.8.8.8", false)).toBe(false);
  });
});

describe("ingestUrl", () => {
  it("refuses loopback targets without the opt-in", async () => {
    await expect(ingestUrl("http://127.0.0.1:1/x.html", urlLimits)).rejects.toMatchObject({
      code: "blocked-host",
    });
    await expect(ingestUrl("http://localhost:1/x.html", urlLimits)).rejects.toMatchObject({
      code: "blocked-host",
    });
  });

  it("refuses private, link-local, and unique-local targets despite the opt-in", async () => {
    for (const host of [
      "10.1.2.3",
      "172.16.0.9",
      "192.168.4.4",
      "169.254.169.254",
      "0.0.0.0",
      "[fe80::1]",
      "[fc00::5]",
    ]) {
      await expect(
        ingestUrl(`http://${host}/x.html`, { limits: urlLimits, allowLoopback: true }),
      ).rejects.toMatchObject({ code: "blocked-host" });
    }
  });

  it("refuses non-http URLs and unparsable input", async () => {
    await expect(ingestUrl("ftp://example.com/x.html", urlLimits)).rejects.toMatchObject({
      code: "bad-url",
    });
    await expect(ingestUrl("not a url", urlLimits)).rejects.toMatchObject({ code: "bad-url" });
  });

  it("refuses a redirect to a private target", async () => {
    const local = await localServer((_req, res) => {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      res.end();
    });
    try {
      await expect(
        ingestUrl(`${local.origin}/hop`, { limits: urlLimits, allowLoopback: true }),
      ).rejects.toMatchObject({ code: "blocked-host" });
    } finally {
      await closeServer(local.server);
    }
  });

  it("follows at most three redirects", async () => {
    const local = await localServer((req, res) => {
      const hop = Number(/\/hop\/(\d+)/.exec(req.url ?? "")?.[1] ?? -1);
      if (hop >= 0 && hop <= 2) {
        res.writeHead(302, { location: `/hop/${hop + 1}` });
        res.end();
        return;
      }
      if (req.url === "/hop/3") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<p>fired</p>");
        return;
      }
      if (req.url === "/spin" || req.url === "/spin/0") {
        res.writeHead(302, { location: "/spin/0" });
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });
    try {
      const doc = await ingestUrl(`${local.origin}/hop/0`, { limits: urlLimits, allowLoopback: true });
      expect(doc.html).toContain("fired");
      await expect(
        ingestUrl(`${local.origin}/spin`, { limits: urlLimits, allowLoopback: true }),
      ).rejects.toMatchObject({ code: "too-many-redirects" });
    } finally {
      await closeServer(local.server);
    }
  });

  it("refuses a non-HTML content type", async () => {
    const local = await localServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("just words");
    });
    try {
      await expect(
        ingestUrl(`${local.origin}/notes.txt`, { limits: urlLimits, allowLoopback: true }),
      ).rejects.toMatchObject({ code: "not-html" });
    } finally {
      await closeServer(local.server);
    }
  });

  it("fetches same-origin images, leaves cross-origin and data srcs alone, survives missing ones", async () => {
    const page = `<!doctype html><html lang="da"><body><section><h2>Hej</h2>
      <img src="giftige/a.jpg" alt="Galder">
      <img src="/spiselige/b.png">
      <img src="https://elsewhere.example/x.jpg">
      <img src="data:image/png;base64,AAAA">
      <img src="gone.jpg">
      </section></body></html>`;
    const local = await localServer((req, res) => {
      if (req.url === "/svampe.html") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(page);
      } else if (req.url === "/giftige/a.jpg" || req.url === "/spiselige/b.png") {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.end(PNG_BYTES);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    try {
      const doc = await ingestUrl(`${local.origin}/svampe.html`, {
        limits: urlLimits,
        allowLoopback: true,
      });

      expect(doc.htmlName).toBe("svampe.html");
      expect([...doc.assets.keys()].sort()).toEqual(["giftige/a.jpg", "spiselige/b.png"]);
      expect(doc.assets.get("giftige/a.jpg")).toEqual(Buffer.from(PNG_BYTES));
      expect(doc.skipped).toEqual(["gone.jpg"]);
      // Only the document and its same-origin images were requested.
      expect(local.hits).toEqual([
        "/svampe.html",
        "/giftige/a.jpg",
        "/spiselige/b.png",
        "/gone.jpg",
      ]);
      // Same-origin srcs are rewritten to zip-style relative paths; the
      // others survive verbatim.
      expect(doc.html).toContain('src="giftige/a.jpg"');
      expect(doc.html).toContain('src="spiselige/b.png"');
      expect(doc.html).toContain('src="https://elsewhere.example/x.jpg"');
      expect(doc.html).toContain('src="data:image/png;base64,AAAA"');
    } finally {
      await closeServer(local.server);
    }
  });

  it("stages a document in a subfolder exactly like a zipped web root", async () => {
    const page = `<!doctype html><html lang="da"><body><section>
      <img src="img/a.png">
      <img src="/top.png">
      </section></body></html>`;
    const local = await localServer((req, res) => {
      if (req.url === "/docs/page.html") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(page);
      } else if (req.url === "/docs/img/a.png" || req.url === "/top.png") {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(PNG_BYTES);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    try {
      const doc = await ingestUrl(`${local.origin}/docs/page.html`, {
        limits: urlLimits,
        allowLoopback: true,
      });

      // The staging contract: every outline image resolves through
      // resolveAssetKey to a key that exists in the assets map.
      const outline = extractOutline(doc.html);
      expect(outline.images.length).toBe(2);
      for (const src of outline.images) {
        const key = resolveAssetKey(doc.htmlName, src);
        expect(key, src).toBeTruthy();
        expect(doc.assets.has(key!), src).toBe(true);
      }
      expect(doc.htmlName).toBe("docs/page.html");
    } finally {
      await closeServer(local.server);
    }
  });

  it("enforces the size caps", async () => {
    const local = await localServer((req, res) => {
      if (req.url === "/big.html") {
        res.writeHead(200, { "content-type": "text/html", "content-length": String(40 * 1024) });
        res.end("x".repeat(40 * 1024));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    try {
      await expect(
        ingestUrl(`${local.origin}/big.html`, { limits: urlLimits, allowLoopback: true }),
      ).rejects.toMatchObject({ code: "entry-too-large" });
    } finally {
      await closeServer(local.server);
    }
  });
});
