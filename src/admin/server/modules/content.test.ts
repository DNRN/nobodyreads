import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { z } from "zod";
import type { Client } from "@libsql/client";
import { createTestDb, type TestDb } from "../../../test/db.js";
import type { AdminModuleContext } from "./types.js";

vi.mock("../../../shared/db.js", () => ({ getRawClient: () => testClient }));

import { createContentRoutes } from "./content.js";
import { getPageById, insertMedia, upsertPage } from "../../../content/db.js";
import { addSubscriber, verifySubscriber } from "../../../subscription/db.js";
import type { EmailMessage, EmailProvider } from "../../../subscription/email.js";
import type { Page, PageKind } from "../../../content/types.js";

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

function mount(email?: AdminModuleContext["email"]): Hono {
  const ctx = {
    db: t.db,
    tenantId: TENANT,
    urlPrefix: "",
    adminBase: "/admin",
    editorBase: "/admin/editor",
    email,
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
    ["audio that does not exist", "m-missing"],
    ["an image", "m-image"],
    ["audio without a known duration", "m-untimed"],
    ["another plot's audio", "m-theirs"],
  ])("refuses an episode of %s", async (_label, audioMediaId) => {
    const res = await save(mount(), { content_type: "audio", audio_media_id: audioMediaId });

    expect(res.status).toBe(400);
    expect(Failed.parse(await res.json()).error).toMatch(/audio/i);
  });

  it("keeps an audio draft's format while its file is still to come", async () => {
    const id = await savedId(await save(mount(), { content_type: "audio", audio_media_id: "" }));

    const page = (await getPageById(t.db, id, TENANT))!;
    expect(page.format).toBe("audio");
    expect(page.episode).toBeNull();
  });

  it("refuses to publish an audio post until its audio is attached", async () => {
    const app = mount();
    const id = await savedId(await save(app, { content_type: "audio", audio_media_id: "" }));

    const refused = await save(app, { id, content_type: "audio", audio_media_id: "", published: "on" });
    expect(refused.status).toBe(400);
    expect(Failed.parse(await refused.json()).error).toMatch(/audio/i);
    expect((await getPageById(t.db, id, TENANT))!.published).toBe(false);

    await savedId(await save(app, { id, content_type: "audio", audio_media_id: "m-audio", published: "on" }));
    const page = (await getPageById(t.db, id, TENANT))!;
    expect(page.published).toBe(true);
    expect(page.episode?.audioMediaId).toBe("m-audio");
  });

  it("lets a live post switched to audio keep saving before its file exists", async () => {
    const app = mount();
    const id = await savedId(await save(app, { content_type: "post", published: "on" }));

    await savedId(await save(app, { id, content_type: "audio", audio_media_id: "", published: "on" }));

    const page = (await getPageById(t.db, id, TENANT))!;
    expect(page).toMatchObject({ published: true, format: "audio", episode: null });
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

describe("moving published content", () => {
  const redirects = async () =>
    (await t.client.execute("SELECT from_path, page_id FROM page_redirect ORDER BY from_path")).rows.map(
      (r) => [r.from_path, r.page_id],
    );

  it("leaves the old address of a post that became a page", async () => {
    const app = mount();
    const id = await savedId(await save(app, { slug: "hello", published: "on" }));

    await savedId(await save(app, { id, slug: "hello", kind: "page", published: "on" }));

    expect((await getPageById(t.db, id, TENANT))!.kind).toBe("page");
    expect(await redirects()).toEqual([["/posts/hello", id]]);
  });

  it("records nothing for a draft — nobody holds its address yet", async () => {
    const app = mount();
    const id = await savedId(await save(app, { slug: "hello" }));

    await savedId(await save(app, { id, slug: "renamed", kind: "page" }));

    expect(await redirects()).toEqual([]);
  });

  it("stops redirecting an address that live content answers at again", async () => {
    const app = mount();
    const id = await savedId(await save(app, { slug: "hello", published: "on" }));
    await savedId(await save(app, { id, slug: "hello", kind: "page", published: "on" }));

    // Back to a post: /posts/hello is live again, and /hello now redirects.
    await savedId(await save(app, { id, slug: "hello", kind: "post", published: "on" }));

    expect(await redirects()).toEqual([["/hello", id]]);
  });

  it("refuses an address another page holds, naming it, and changes nothing", async () => {
    const app = mount();
    await savedId(await save(app, { title: "About me", slug: "about", kind: "page", published: "on" }));
    const id = await savedId(await save(app, { title: "About", slug: "about", published: "on" }));

    const res = await save(app, { id, title: "About", slug: "about", kind: "page", published: "on" });

    expect(res.status).toBe(409);
    expect(Failed.parse(await res.json()).error).toContain("About me");
    expect((await getPageById(t.db, id, TENANT))!.kind).toBe("post");
    expect(await redirects()).toEqual([]);
  });

  it("keeps an episode a post until it is switched to text", async () => {
    const app = mount();
    const id = await savedId(await save(app, { content_type: "audio", audio_media_id: "m-audio", published: "on" }));

    const refused = await save(app, { id, kind: "page", published: "on" });
    expect(refused.status).toBe(400);

    await savedId(await save(app, { id, content_type: "post", published: "on" }));
    await savedId(await save(app, { id, kind: "page", published: "on" }));
    expect((await getPageById(t.db, id, TENANT))!.kind).toBe("page");
  });

  it("never turns the home page into a post", async () => {
    const app = mount();
    const id = await savedId(await save(app, { slug: "home", kind: "home", published: "on" }));

    const res = await save(app, { id, slug: "home", kind: "post", published: "on" });

    expect(res.status).toBe(400);
    expect((await getPageById(t.db, id, TENANT))!.kind).toBe("home");
  });

  it("takes a page's redirects with it when it is deleted", async () => {
    const app = mount();
    const id = await savedId(await save(app, { slug: "hello", published: "on" }));
    await savedId(await save(app, { id, slug: "hello", kind: "page", published: "on" }));

    await app.request(`/editor/delete/${id}`, { method: "POST" });

    expect(await redirects()).toEqual([]);
  });
});

describe("emailing subscribers about a post", () => {
  /** A provider that records instead of sending, and one verified reader. */
  async function withSubscriber(): Promise<{ app: Hono; sent: EmailMessage[] }> {
    const sent: EmailMessage[] = [];
    const provider: EmailProvider = { sendEmail: async (m) => void sent.push(m) };
    const { token } = await addSubscriber(t.db, TENANT, "reader@example.com");
    await verifySubscriber(t.db, TENANT, token!);
    return { app: mount(provider), sent };
  }

  // Sending happens only after `claimNotification` writes `notified_at`, so a
  // row whose `notifiedAt` did not change proves nothing was sent — no need to
  // wait on the fire-and-forget send to show it stayed quiet.
  const notifiedAt = async (id: string) => (await getPageById(t.db, id, TENANT))!.notifiedAt;

  it("emails once when the author ticks it on publish, and records when", async () => {
    const { app, sent } = await withSubscriber();

    const res = await save(app, { published: "on", notify: "on" });
    const id = await savedId(res.clone());
    await vi.waitFor(() => expect(sent).toHaveLength(1));

    const reported = z.object({ notifiedAt: z.string() }).parse(await res.json()).notifiedAt;
    expect(await notifiedAt(id)).toBe(reported);
  });

  it("publishes quietly when the box is left unticked", async () => {
    const { app } = await withSubscriber();

    const id = await savedId(await save(app, { published: "on" }));

    expect(await notifiedAt(id)).toBeNull();
  });

  it("never emails a post twice, even when it is unpublished and published again", async () => {
    const { app, sent } = await withSubscriber();
    const id = await savedId(await save(app, { published: "on", notify: "on" }));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const first = await notifiedAt(id);

    await savedId(await save(app, { id }));
    await savedId(await save(app, { id, published: "on", notify: "on" }));

    expect(await notifiedAt(id)).toBe(first);
    expect(sent).toHaveLength(1);
  });

  it("does not spend the one email when nobody has subscribed yet", async () => {
    const app = mount({ sendEmail: async () => {} });

    const id = await savedId(await save(app, { published: "on", notify: "on" }));

    expect(await notifiedAt(id)).toBeNull();
  });

  it("emails a quietly published post later, once", async () => {
    const { app, sent } = await withSubscriber();
    const id = await savedId(await save(app, { published: "on" }));

    const first = await app.request(`/editor/notify/${id}`, { method: "POST" });
    expect(first.status).toBe(200);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const claimed = await notifiedAt(id);

    const again = await app.request(`/editor/notify/${id}`, { method: "POST" });
    expect(again.status).toBe(409);
    expect(await notifiedAt(id)).toBe(claimed);
  });

  it.each([
    ["a draft", { kind: "post", slug: "draft" }],
    ["a page", { kind: "page", slug: "about", published: "on" }],
  ])("will not email %s", async (_label, fields: Record<string, string>) => {
    const { app } = await withSubscriber();
    const id = await savedId(await save(app, fields));

    const res = await app.request(`/editor/notify/${id}`, { method: "POST" });

    expect(res.status).toBe(400);
    expect(await notifiedAt(id)).toBeNull();
  });
});

describe("the internal-link picker's target list", () => {
  /** A valid page with the given fields over sensible defaults. */
  function seed(partial: Partial<Page> & { id: string; slug: string; kind: PageKind }): Page {
    return {
      title: partial.slug,
      content: "",
      excerpt: "",
      tags: [],
      date: "2026-01-01",
      published: false,
      nav: undefined,
      commentsEnabled: true,
      inFeed: true,
      accessTier: "public",
      priceAmount: null,
      episode: null,
      ...partial,
    };
  }

  it("offers this plot's posts and pages, drafts flagged — home and other plots excluded", async () => {
    await upsertPage(t.db, seed({ id: "post-live", slug: "chanterelles", kind: "post", title: "Chanterelles", published: true, date: "2026-03-03" }), TENANT);
    await upsertPage(t.db, seed({ id: "post-draft", slug: "amanita", kind: "post", title: "Amanita", date: "2026-04-04" }), TENANT);
    await upsertPage(t.db, seed({ id: "page-about", slug: "about", kind: "page", title: "About", published: true, date: "2026-02-02" }), TENANT);
    await upsertPage(t.db, seed({ id: "home", slug: "home", kind: "home", title: "Home", published: true }), TENANT);
    await upsertPage(t.db, seed({ id: "theirs", slug: "theirs", kind: "post", title: "Theirs", published: true }), OTHER_TENANT);

    const res = await mount().request("/editor/link-targets");

    expect(res.status).toBe(200);
    // Pages before posts (kind asc), newest first within a kind.
    expect(await res.json()).toEqual([
      { id: "page-about", title: "About", slug: "about", kind: "page", published: true, date: "2026-02-02" },
      { id: "post-draft", title: "Amanita", slug: "amanita", kind: "post", published: false, date: "2026-04-04" },
      { id: "post-live", title: "Chanterelles", slug: "chanterelles", kind: "post", published: true, date: "2026-03-03" },
    ]);
  });
});
