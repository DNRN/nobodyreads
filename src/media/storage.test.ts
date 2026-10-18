import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalMediaStorage } from "./storage.js";

/**
 * Local storage is what self-hosters and dev run on, and the only backend that
 * serves bytes itself (the cloud ones redirect to a bucket). Exercised over a
 * real HTTP server because `serve` writes to a Node response directly.
 */

let dir: string;
let storage: LocalMediaStorage;
let server: Server;
let base: string;

// 0..255 repeating, so any byte's value proves its offset.
const BODY = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "nr-storage-"));
  storage = new LocalMediaStorage(dir);
  await storage.init();
  await storage.put("ep.mp3", BODY, "audio/mpeg");

  server = createServer((req, res) => {
    void storage
      .serve(req.url!.slice(1), res, { range: req.headers.range, method: req.method })
      .then((served) => {
        if (!served) res.writeHead(404).end();
      });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterEach(async () => {
  server.close();
  await once(server, "close");
  await rm(dir, { recursive: true, force: true });
});

describe("LocalMediaStorage.serve", () => {
  it("returns exactly the requested bytes for a range", async () => {
    const res = await fetch(`${base}/ep.mp3`, { headers: { Range: "bytes=300-309" } });

    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 300-309/1000");
    expect(res.headers.get("content-length")).toBe("10");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(BODY.subarray(300, 310));
  });

  it("serves the whole file and advertises range support without a Range header", async () => {
    const res = await fetch(`${base}/ep.mp3`);

    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(BODY);
  });

  it("answers 416 with the real size for a range past EOF", async () => {
    const res = await fetch(`${base}/ep.mp3`, { headers: { Range: "bytes=5000-" } });

    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */1000");
  });

  it("sends headers but no body for HEAD", async () => {
    const res = await fetch(`${base}/ep.mp3`, { method: "HEAD" });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("1000");
    expect((await res.arrayBuffer()).byteLength).toBe(0);
  });

  it("404s a key that escapes the media directory", async () => {
    const res = await fetch(`${base}/..%2F..%2Fetc%2Fpasswd`);

    expect(res.status).toBe(404);
  });
});

describe("LocalMediaStorage.assemble", () => {
  it("joins parts in the given order and removes them", async () => {
    await storage.put("parts/0", Buffer.from("first-"), "application/octet-stream");
    await storage.put("parts/1", Buffer.from("second-"), "application/octet-stream");
    await storage.put("parts/2", Buffer.from("third"), "application/octet-stream");

    await storage.assemble(["parts/0", "parts/1", "parts/2"], "out.mp3", "audio/mpeg");

    expect(await readFile(join(dir, "out.mp3"), "utf8")).toBe("first-second-third");
    // The emptied per-upload folder goes too; one per upload would pile up.
    expect(await readdir(dir)).not.toContain("parts");
  });

  it("leaves nothing at the destination when a part is missing", async () => {
    await storage.put("parts/0", Buffer.from("first-"), "application/octet-stream");

    await expect(
      storage.assemble(["parts/0", "parts/1"], "out.mp3", "audio/mpeg"),
    ).rejects.toThrow();

    expect(await storage.openRead("out.mp3")).toBeNull();
    expect(await readdir(dir)).not.toContain("out.mp3.partial");
    // The surviving part is kept so the upload can be retried.
    expect(await storage.openRead("parts/0")).not.toBeNull();
  });
});
