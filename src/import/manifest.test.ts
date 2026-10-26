import { describe, expect, it, vi } from "vitest";
import type { ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { MediaStorage, StoredFile } from "../media/storage.js";
import { createTestDb } from "../test/db.js";
import { resolveAssetKey, stageMedia } from "./manifest.js";
import type { DocumentOutline } from "./types.js";

/**
 * Staging is where imported bytes become the tenant's media: real DB rows,
 * real storage calls. The storage backend is faked (a Map), because what
 * matters here is the bookkeeping — key shape, MIME mapping, alt selection,
 * resolution of relative srcs — not GCS.
 */

const outline: DocumentOutline = {
  title: "T",
  language: "da",
  sections: [
    {
      heading: "S",
      blocks: [
        { type: "image", src: "billeder/hero.png", alt: "Et fund" },
        { type: "image", src: "billeder/hero.png", alt: "Ignored duplicate alt" },
        { type: "image", src: "billeder/labeløst.jpg", alt: "" },
        { type: "image", src: "https://cdn.example.net/fjern.png", alt: "fjern" },
        { type: "image", src: "billedes/mangler.png", alt: "" },
      ],
    },
  ],
  images: [
    "billeder/hero.png",
    "billeder/labeløst.jpg",
    "https://cdn.example.net/fjern.png",
    "billedes/mangler.png",
  ],
};

function fakeStorage() {
  const stored = new Map<string, { bytes: Buffer; mimeType: string }>();
  const storage: MediaStorage = {
    maxParts: undefined,
    put: vi.fn(async (key: string, data: Buffer, mimeType: string): Promise<StoredFile> => {
      stored.set(key, { bytes: data, mimeType });
      return { key, url: `/media/${key}` };
    }),
    assemble: vi.fn(),
    openRead: vi.fn(async (key: string) =>
      stored.has(key) ? Readable.from(stored.get(key)!.bytes) : null,
    ),
    delete: vi.fn(async (key: string) => {
      stored.delete(key);
    }),
    url: (key: string) => `/media/${key}`,
    serve: vi.fn(async (_key: string, _res: ServerResponse) => false),
  };
  return { storage, stored };
}

describe("resolveAssetKey", () => {
  it("resolves relative to the document's archive directory", () => {
    expect(resolveAssetKey("svampe.html", "photos/hero.png")).toBe("photos/hero.png");
    expect(resolveAssetKey("decks/main.html", "../photos/hero.png")).toBe("photos/hero.png");
  });

  it("refuses remote, embedded, and escaping srcs", () => {
    expect(resolveAssetKey("index.html", "https://x/y.png")).toBeNull();
    expect(resolveAssetKey("index.html", "data:image/png;base64,AAAA")).toBeNull();
    expect(resolveAssetKey("index.html", "../outside.png")).toBeNull();
  });
});

describe("stageMedia", () => {
  it("uploads resolvable images, records them, and reports the rest as unstaged", async () => {
    const t = await createTestDb();
    const { storage, stored } = fakeStorage();
    const assets = new Map<string, Buffer>([
      ["billeder/hero.png", Buffer.from([1, 2, 3])],
      ["billeder/labeløst.jpg", Buffer.from([4])],
    ]);

    const { manifest, unstaged } = await stageMedia({
      db: t.db,
      storage,
      tenantId: "t1",
      assets,
      outline,
      htmlName: "index.html",
    });

    expect(manifest).toHaveLength(2);
    expect(unstaged).toEqual(["https://cdn.example.net/fjern.png", "billedes/mangler.png"]);

    const hero = manifest[0];
    expect(hero.source).toBe("billeder/hero.png");
    expect(hero.url).toMatch(/^\/media\/.+\.png$/);
    expect(hero.alt).toBe("Et fund"); // first non-empty alt wins
    expect(stored.get(hero.key)?.mimeType).toBe("image/png");
    expect(manifest[1].alt).toBeNull(); // empty alt is no alt

    const rows = await t.client.execute("SELECT storage_key, original_name, mime_type FROM media");
    expect(rows.rows).toHaveLength(2);
  });

  it("honors the tenant key prefix the admin upload route uses", async () => {
    const t = await createTestDb();
    const { storage } = fakeStorage();

    const { manifest } = await stageMedia({
      db: t.db,
      storage,
      tenantId: "t1",
      keyPrefix: "tenants/t1/",
      assets: new Map([["billeder/hero.png", Buffer.from([1])]]),
      outline,
      htmlName: "index.html",
    });

    expect(manifest[0].key.startsWith("tenants/t1/")).toBe(true);
    expect(manifest[0].url).toBe(`/media/${manifest[0].key}`);
  });
});
