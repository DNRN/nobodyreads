import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { createTestDb, type TestDb } from "../../../test/db.js";
import { createMediaRoutes } from "./media.js";
import { listMedia } from "../../../content/db.js";
import type { MediaStorage } from "../../../media/storage.js";
import type { AdminModuleContext } from "./types.js";

/**
 * Guard paths for `POST {admin}/media/generate`.
 *
 * The generation itself needs Comfy Cloud and a real storage backend, so what
 * is worth pinning here is everything that happens *before* the network call:
 * an unconfigured site must be told so rather than crash, a blank prompt must
 * not spend GPU credits, and neither may leave a row in the media library.
 */

const TENANT = "_default";

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

/** Enough of the interface to register the routes; no call should reach it. */
const storage: MediaStorage = {
  put: async () => {
    throw new Error("storage.put must not be reached on a rejected request");
  },
  delete: async () => {},
  url: (key) => `/media/${key}`,
  serve: async () => false,
};

function mount(comfy?: AdminModuleContext["comfy"]): Hono {
  const ctx = {
    db: t.db,
    storage,
    tenantId: TENANT,
    urlPrefix: "",
    adminBase: "/admin",
    editorBase: "/admin/editor",
    comfy,
  } satisfies AdminModuleContext;

  const app = new Hono();
  app.route("/", createMediaRoutes(ctx));
  return app;
}

function generate(app: Hono, body: unknown) {
  return app.request("/media/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /media/generate", () => {
  it("503s when neither the tenant nor the platform has Comfy configured", async () => {
    const res = await generate(mount(undefined), { prompt: "a foggy harbour" });

    expect(res.status).toBe(503);
    expect(await listMedia(t.db, TENANT, (k) => k)).toHaveLength(0);
  });

  it("400s on a missing prompt", async () => {
    const res = await generate(mount({ baseUrl: "https://comfy.test", apiKey: "k" }), {});

    expect(res.status).toBe(400);
    expect(await listMedia(t.db, TENANT, (k) => k)).toHaveLength(0);
  });

  it("400s on a whitespace-only prompt", async () => {
    const app = mount({ baseUrl: "https://comfy.test", apiKey: "k" });

    const res = await generate(app, { prompt: "   " });

    expect(res.status).toBe(400);
  });

  it("400s on a body that is not JSON at all", async () => {
    const app = mount({ baseUrl: "https://comfy.test", apiKey: "k" });

    const res = await app.request("/media/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
  });

  it("is not registered at all when storage is unconfigured", async () => {
    // The factory returns an empty app rather than routes that would throw on
    // the first write — a media library with nowhere to put media has none.
    const ctx = {
      db: t.db,
      tenantId: TENANT,
      urlPrefix: "",
      adminBase: "/admin",
      editorBase: "/admin/editor",
      comfy: { baseUrl: "https://comfy.test", apiKey: "k" },
    } satisfies AdminModuleContext;

    const app = new Hono();
    app.route("/", createMediaRoutes(ctx));

    const res = await generate(app, { prompt: "a foggy harbour" });
    expect(res.status).toBe(404);
  });
});
