import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTestDb, type TestDb } from "../../../test/db.js";
import { LocalMediaStorage } from "../../../media/storage.js";
import { uploadSession } from "../../../media/schema.js";
import { UPLOAD_CHUNK_BYTES } from "../../../media/upload/session.js";
import { listMedia } from "../../../content/db.js";
import { createUploadSessionRoutes } from "./upload-sessions.js";
import type { AdminModuleContext, MediaUploadedEvent } from "./types.js";

/**
 * The chunked upload protocol end to end, on real local storage: what reaches
 * the media library, what is left on disk, and what a client can retry.
 */

const TENANT = "_default";
const SAMPLE_RATE = 8000;

const Started = z.object({ sessionId: z.string(), chunkBytes: z.number(), partCount: z.number() });
const Completed = z.object({ id: z.string(), durationSeconds: z.number() });
const Failed = z.object({ error: z.string() });

/** 8-bit mono PCM WAV whose sample bytes encode their own offset. */
function makeWav(dataBytes: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE, 28); // byte rate
  header.writeUInt16LE(1, 32); // block align
  header.writeUInt16LE(8, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(dataBytes, 40);
  const data = Buffer.alloc(dataBytes);
  for (let i = 0; i < dataBytes; i++) data[i] = i % 251;
  return Buffer.concat([header, data]);
}

let t: TestDb;
let dir: string;
let storage: LocalMediaStorage;
let events: MediaUploadedEvent[];

beforeEach(async () => {
  t = await createTestDb();
  dir = await mkdtemp(join(tmpdir(), "nr-upload-"));
  storage = new LocalMediaStorage(dir);
  await storage.init();
  events = [];
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function mount(overrides: Partial<AdminModuleContext> = {}): Hono {
  const ctx: AdminModuleContext = {
    db: t.db,
    storage,
    tenantId: TENANT,
    urlPrefix: "",
    adminBase: "/admin",
    editorBase: "/admin/editor",
    keyPrefix: "tenants/t1/",
    onMediaUploaded: (e) => {
      events.push(e);
    },
    ...overrides,
  };
  const app = new Hono();
  app.route("/", createUploadSessionRoutes(ctx));
  return app;
}

function start(app: Hono, body: { filename: string; mimeType: string; size: number }) {
  return app.request("/media/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function startWav(app: Hono, file: Buffer, mimeType = "audio/wav") {
  const res = await start(app, { filename: "episode.wav", mimeType, size: file.length });
  expect(res.status).toBe(201);
  return Started.parse(await res.json());
}

function putPart(app: Hono, sessionId: string, n: number, bytes: Buffer) {
  return app.request(`/media/upload-session/${sessionId}/parts/${n}`, {
    method: "PUT",
    body: bytes,
  });
}

function complete(app: Hono, sessionId: string) {
  return app.request(`/media/upload-session/${sessionId}/complete`, { method: "POST" });
}

function partsDir(sessionId: string): string {
  return join(dir, "tenants/t1/upload-sessions", sessionId);
}

/** Start a session for `file` and send every part. Returns the session id. */
async function uploadAllParts(app: Hono, file: Buffer, mimeType = "audio/wav") {
  const { sessionId, chunkBytes, partCount } = await startWav(app, file, mimeType);
  for (let n = 0; n < partCount; n++) {
    const res = await putPart(app, sessionId, n, file.subarray(n * chunkBytes, (n + 1) * chunkBytes));
    expect(res.status).toBe(200);
  }
  return sessionId;
}

describe("chunked upload sessions", () => {
  it("assembles a multi-part file byte-for-byte into the media library", async () => {
    const app = mount();
    const file = makeWav(UPLOAD_CHUNK_BYTES + 1_000_000);
    const sessionId = await uploadAllParts(app, file);

    const res = await complete(app, sessionId);

    expect(res.status).toBe(201);
    const item = Completed.parse(await res.json());
    expect(item.durationSeconds).toBe(Math.round((file.length - 44) / SAMPLE_RATE));

    const [stored] = await listMedia(t.db, TENANT, (k) => k);
    expect(stored).toMatchObject({
      id: item.id,
      mimeType: "audio/wav",
      size: file.length,
      durationSeconds: item.durationSeconds,
    });
    expect(stored.storageKey).toBe(`tenants/t1/${item.id}.wav`);
    expect((await readFile(join(dir, stored.storageKey))).equals(file)).toBe(true);
    // No part objects survive a successful assembly.
    expect(existsSync(partsDir(sessionId))).toBe(false);
  });

  it("tells the host about the upload without handing it the bytes", async () => {
    const app = mount();
    const sessionId = await uploadAllParts(app, makeWav(SAMPLE_RATE * 2));

    await complete(app, sessionId);
    // The hook is fire-and-forget; let it run before looking.
    await setImmediate();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ mimeType: "audio/wav", durationSeconds: 2 });
    expect(events[0].data).toBeUndefined();
  });

  it("accepts a re-sent part and records it once", async () => {
    const app = mount();
    const file = makeWav(SAMPLE_RATE * 2);
    const sessionId = await uploadAllParts(app, file);

    expect((await putPart(app, sessionId, 0, file)).status).toBe(200);

    expect((await complete(app, sessionId)).status).toBe(201);
    expect(await listMedia(t.db, TENANT, (k) => k)).toHaveLength(1);
  });

  it("rejects a part whose length is not exactly the part's share", async () => {
    const app = mount();
    const file = makeWav(SAMPLE_RATE);
    const { sessionId } = await startWav(app, file);

    const res = await putPart(app, sessionId, 0, file.subarray(1));

    expect(res.status).toBe(400);
  });

  it("rejects a part number outside the file", async () => {
    const app = mount();
    const file = makeWav(SAMPLE_RATE);
    const { sessionId } = await startWav(app, file);

    expect((await putPart(app, sessionId, 1, file)).status).toBe(400);
    expect((await putPart(app, sessionId, -1, file)).status).toBe(400);
  });

  it("refuses to complete early, and stays open so the missing part can follow", async () => {
    const app = mount();
    const file = makeWav(UPLOAD_CHUNK_BYTES + 1000);
    const { sessionId } = await startWav(app, file);
    await putPart(app, sessionId, 0, file.subarray(0, UPLOAD_CHUNK_BYTES));

    expect((await complete(app, sessionId)).status).toBe(409);

    await putPart(app, sessionId, 1, file.subarray(UPLOAD_CHUNK_BYTES));
    expect((await complete(app, sessionId)).status).toBe(201);
  });

  it("lets only one of two completes win", async () => {
    const app = mount();
    const sessionId = await uploadAllParts(app, makeWav(SAMPLE_RATE));

    const [a, b] = await Promise.all([complete(app, sessionId), complete(app, sessionId)]);

    expect([a.status, b.status].sort()).toEqual([201, 404]);
    expect(await listMedia(t.db, TENANT, (k) => k)).toHaveLength(1);
  });

  it("rejects a file that is not what it was declared as, and cleans up its parts", async () => {
    const app = mount();
    const sessionId = await uploadAllParts(app, makeWav(SAMPLE_RATE), "audio/mpeg");

    const res = await complete(app, sessionId);

    expect(res.status).toBe(422);
    expect(Failed.parse(await res.json()).error).toContain("audio/wav");
    expect(await listMedia(t.db, TENANT, (k) => k)).toHaveLength(0);
    expect(await readdir(partsDir(sessionId))).toEqual([]);
  });

  it("refuses an unsupported type before anything is stored", async () => {
    const res = await start(mount(), { filename: "a.flac", mimeType: "audio/flac", size: 100 });

    expect(res.status).toBe(415);
  });

  it("refuses a file over the configured cap", async () => {
    const app = mount({ maxUploadBytes: 1000 });

    const res = await start(app, { filename: "a.wav", mimeType: "audio/wav", size: 1001 });

    expect(res.status).toBe(413);
  });

  it("refuses a file the storage backend could not assemble", async () => {
    // A backend that joins at most one part cannot take a two-part file.
    const oneParter = Object.assign(new LocalMediaStorage(dir), { maxParts: 1 });
    const app = mount({ storage: oneParter });

    const res = await start(app, {
      filename: "a.wav",
      mimeType: "audio/wav",
      size: UPLOAD_CHUNK_BYTES + 1,
    });

    expect(res.status).toBe(413);
  });

  it("aborts a session and deletes what it uploaded", async () => {
    const app = mount();
    const file = makeWav(SAMPLE_RATE);
    const { sessionId } = await startWav(app, file);
    await putPart(app, sessionId, 0, file);

    const res = await app.request(`/media/upload-session/${sessionId}`, { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(await readdir(partsDir(sessionId))).toEqual([]);
    expect((await complete(app, sessionId)).status).toBe(404);
  });

  it("sweeps sessions abandoned for over a day when a new one starts", async () => {
    const app = mount();
    const file = makeWav(SAMPLE_RATE);
    const old = await startWav(app, file);
    await putPart(app, old.sessionId, 0, file);
    const dayAndAHourAgo = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
    await t.db
      .update(uploadSession)
      .set({ createdAt: dayAndAHourAgo })
      .where(eq(uploadSession.sessionId, old.sessionId));

    await startWav(app, file);

    expect(await readdir(partsDir(old.sessionId))).toEqual([]);
    expect((await putPart(app, old.sessionId, 0, file)).status).toBe(404);
  });
});
