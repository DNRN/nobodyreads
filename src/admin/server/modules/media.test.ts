import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb, type TestDb } from "../../../test/db.js";
import { LocalMediaStorage } from "../../../media/storage.js";
import { listMedia } from "../../../content/db.js";
import { createMediaRoutes } from "./media.js";
import type { AdminModuleContext } from "./types.js";

/**
 * The single-request upload route refuses audio: audio has to come through the
 * upload session, which checks the bytes and records the duration an episode
 * needs. A file picker's `accept` filter is not enough — drag-and-drop skips
 * it, and a browser's declared type is a guess.
 */

const TENANT = "_default";

let t: TestDb;
let dir: string;

beforeEach(async () => {
  t = await createTestDb();
  dir = await mkdtemp(join(tmpdir(), "nr-media-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function mount(): Hono {
  const ctx = {
    db: t.db,
    storage: new LocalMediaStorage(dir),
    tenantId: TENANT,
    urlPrefix: "",
    adminBase: "/admin",
    editorBase: "/admin/editor",
  } satisfies AdminModuleContext;
  const app = new Hono();
  app.route("/", createMediaRoutes(ctx));
  return app;
}

function upload(app: Hono, file: File) {
  const body = new FormData();
  body.append("file", file);
  return app.request("/media/upload", {
    method: "POST",
    headers: { Accept: "application/json" },
    body,
  });
}

describe("POST /media/upload", () => {
  it("refuses audio by its declared type", async () => {
    const res = await upload(mount(), new File([new Uint8Array(8)], "ep.mp3", { type: "audio/mpeg" }));

    expect(res.status).toBe(415);
    expect(await listMedia(t.db, TENANT, (k) => k)).toHaveLength(0);
  });

  it("refuses audio by extension when no type was declared", async () => {
    const res = await upload(mount(), new File([new Uint8Array(8)], "ep.m4a"));

    expect(res.status).toBe(415);
  });

  it("still stores images", async () => {
    const res = await upload(mount(), new File([new Uint8Array(8)], "cover.png", { type: "image/png" }));

    expect(res.status).toBe(200);
    expect(await listMedia(t.db, TENANT, (k) => k)).toHaveLength(1);
  });
});
