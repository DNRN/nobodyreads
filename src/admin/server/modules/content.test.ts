import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { z } from "zod";
import type { Client } from "@libsql/client";
import { createTestDb, type TestDb } from "../../../test/db.js";
import type { AdminModuleContext } from "./types.js";

vi.mock("../../../shared/db.js", () => ({ getRawClient: () => testClient }));

import { createContentRoutes } from "./content.js";
import { getPageById, insertMedia } from "../../../content/db.js";

/**
 * `/editor/save` for episodes. The save route is the one gate between an
 * author's form and the podcast feed, so what it must refuse — audio it cannot
 * vouch for — matters as much as what it stores.
 */

const TENANT = "_default";
const OTHER_TENANT = "someone-else";

let t: TestDb;
let testClient: Client;

const Saved = z.object({ ok: z.literal(true), id: z.string() });
const Failed = z.object({ error: z.string() });

beforeEach(async () => {
  t = await createTestDb();
  testClient = t.client;

  // What a finished chunked upload leaves behind: audio with a duration.
  await insertMedia(
    t.db,
    { id: "m-audio", storageKey: "m-audio.mp3", originalName: "ep1.mp3", mimeType: "audio/mpeg", size: 9, durationSeconds: 2700 },
    TENANT,
  );
  // Audio from before durations were recorded, and a plain image.
  await insertMedia(
    t.db,
    { id: "m-untimed", storageKey: "m-untimed.mp3", originalName: "old.mp3", mimeType: "audio/mpeg", size: 9 },
    TENANT,
  );
  await insertMedia(
    t.db,
    { id: "m-image", storageKey: "m-image.png", originalName: "cover.png", mimeType: "image/png", size: 9 },
    TENANT,
  );
  await insertMedia(
    t.db,
    { id: "m-theirs", storageKey: "m-theirs.mp3", originalName: "theirs.mp3", mimeType: "audio/mpeg", size: 9, durationSeconds: 60 },
    OTHER_TENANT,
  );
});

function mount(): Hono {
  const ctx = {
    db: t.db,
    tenantId: TENANT,
    urlPrefix: "",
    adminBase: "/admin",
    editorBase: "/admin/editor",
  } satisfies AdminModuleContext;
  const app = new Hono();
  app.route("/", createContentRoutes(ctx));
  return app;
}

function save(app: Hono, fields: Record<string, string>) {
  return app.request("/editor/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ title: "Episode one", slug: "episode-one", kind: "post", ...fields }),
  });
}

async function savedId(res: Response): Promise<string> {
  expect(res.status).toBe(200);
  return Saved.parse(await res.json()).id;
}

describe("saving an episode", () => {
  it("stores an episode of this plot's timed audio", async () => {
    const app = mount();

    const id = await savedId(
      await save(app, {
        content_type: "audio",
        audio_media_id: "m-audio",
        episode_number: "3",
        season_number: "1",
      }),
    );

    expect((await getPageById(t.db, id, TENANT))!.episode).toEqual({
      audioMediaId: "m-audio",
      number: 3,
      season: 1,
    });
  });

  it("stores blank or zero numbers as unnumbered", async () => {
    const id = await savedId(
      await save(mount(), {
        content_type: "audio",
        audio_media_id: "m-audio",
        episode_number: "",
        season_number: "0",
      }),
    );

    expect((await getPageById(t.db, id, TENANT))!.episode).toMatchObject({ number: null, season: null });
  });

  it.each([
    ["no audio chosen", ""],
    ["audio that does not exist", "m-missing"],
    ["an image", "m-image"],
    ["audio without a known duration", "m-untimed"],
    ["another plot's audio", "m-theirs"],
  ])("refuses an episode of %s", async (_label, audioMediaId) => {
    const res = await save(mount(), { content_type: "audio", audio_media_id: audioMediaId });

    expect(res.status).toBe(400);
    expect(Failed.parse(await res.json()).error).toMatch(/audio/i);
  });

  it("keeps an existing episode when the form has no audio control", async () => {
    const app = mount();
    const id = await savedId(await save(app, { content_type: "audio", audio_media_id: "m-audio" }));

    await savedId(await save(app, { id, title: "Renamed" }));

    const page = (await getPageById(t.db, id, TENANT))!;
    expect(page.title).toBe("Renamed");
    expect(page.episode?.audioMediaId).toBe("m-audio");
  });

  it("turns an episode back into a plain post", async () => {
    const app = mount();
    const id = await savedId(await save(app, { content_type: "audio", audio_media_id: "m-audio" }));

    await savedId(await save(app, { id, content_type: "post", audio_media_id: "m-audio" }));

    expect((await getPageById(t.db, id, TENANT))!.episode).toBeNull();
  });

  it("never makes a non-post page an episode", async () => {
    const id = await savedId(
      await save(mount(), {
        kind: "page",
        slug: "about",
        content_type: "audio",
        audio_media_id: "m-audio",
      }),
    );

    expect((await getPageById(t.db, id, TENANT))!.episode).toBeNull();
  });
});
