import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb, type TestDb } from "../test/db.js";
import { upsertPage, insertMedia } from "./db.js";
import { setSiteSetting } from "../shared/site-settings.js";
import { createPodcastFeedRoutes } from "./podcast.js";
import type { Page } from "./types.js";

/**
 * `/podcast.xml` is submitted to Apple Podcasts and Spotify, so two things are
 * pinned here: exactly which episodes a directory can ever see, and the tags
 * directories reject a feed for getting wrong.
 */

const TENANT = "_default";
const ORIGIN = "https://show.test";

let t: TestDb;
let configDir: string;
let previousConfig: string | undefined;

beforeAll(async () => {
  // Pin storage to local so enclosure URLs do not depend on whatever
  // config/storage.config.json the machine running the tests has.
  configDir = await mkdtemp(join(tmpdir(), "nr-podcast-"));
  const configPath = join(configDir, "storage.json");
  await writeFile(configPath, JSON.stringify({ backend: "local", dir: configDir }));
  previousConfig = process.env.STORAGE_CONFIG;
  process.env.STORAGE_CONFIG = configPath;
});

afterAll(async () => {
  if (previousConfig === undefined) delete process.env.STORAGE_CONFIG;
  else process.env.STORAGE_CONFIG = previousConfig;
  await rm(configDir, { recursive: true, force: true });
});

beforeEach(async () => {
  t = await createTestDb();
  await insertMedia(
    t.db,
    { id: "m1", storageKey: "tenants/x/m1.mp3", originalName: "ep.mp3", mimeType: "audio/mpeg", size: 18401139, durationSeconds: 1150 },
    TENANT,
  );
});

function makeEpisode(overrides: Partial<Page> = {}): Page {
  return {
    id: "page-1",
    slug: "first-episode",
    title: "First episode",
    content: "Show notes.",
    excerpt: "What this one is about.",
    tags: [],
    date: "2026-10-01",
    published: true,
    kind: "post",
    commentsEnabled: true,
    inFeed: true,
    accessTier: "public",
    priceAmount: null,
    episode: { audioMediaId: "m1", number: null, season: null },
    ...overrides,
  };
}

async function feed() {
  const app = new Hono();
  app.route("/", createPodcastFeedRoutes({ db: t.db, siteUrl: ORIGIN, siteName: "Shed Talk", siteTagline: "From the shed" }));
  const res = await app.request("/podcast.xml");
  return { status: res.status, type: res.headers.get("content-type"), xml: await res.text() };
}

describe("GET /podcast.xml", () => {
  it("404s until there is a public episode", async () => {
    expect((await feed()).status).toBe(404);
  });

  it.each([
    ["members-only", makeEpisode({ accessTier: "members" })],
    ["paid", makeEpisode({ accessTier: "paid" })],
    ["a draft", makeEpisode({ published: false })],
    ["left out of the feed", makeEpisode({ inFeed: false })],
    ["a plain post", makeEpisode({ episode: null })],
    ["missing its audio file", makeEpisode({ episode: { audioMediaId: "m-gone", number: null, season: null } })],
  ])("never lists an episode that is %s", async (_label, page) => {
    await upsertPage(t.db, page, TENANT);

    const { status, xml } = await feed();

    // With nothing else published, the only correct answer is "no feed".
    expect(status).toBe(404);
    expect(xml).not.toContain("First episode");
  });

  it("never lists audio without a known duration", async () => {
    await insertMedia(
      t.db,
      { id: "m-untimed", storageKey: "m-untimed.mp3", originalName: "old.mp3", mimeType: "audio/mpeg", size: 9 },
      TENANT,
    );
    await upsertPage(t.db, makeEpisode({ episode: { audioMediaId: "m-untimed", number: null, season: null } }), TENANT);

    expect((await feed()).status).toBe(404);
  });

  it("never lists another plot's audio", async () => {
    await insertMedia(
      t.db,
      { id: "m-theirs", storageKey: "theirs.mp3", originalName: "t.mp3", mimeType: "audio/mpeg", size: 9, durationSeconds: 60 },
      "other-tenant",
    );
    await upsertPage(t.db, makeEpisode({ episode: { audioMediaId: "m-theirs", number: null, season: null } }), TENANT);

    expect((await feed()).status).toBe(404);
  });

  it("lists a public episode with everything a podcatcher needs", async () => {
    await upsertPage(t.db, makeEpisode(), TENANT);

    const { status, type, xml } = await feed();

    expect(status).toBe(200);
    expect(type).toContain("application/rss+xml");
    expect(xml).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"');
    expect(xml).toContain("<title>Shed Talk</title>");
    expect(xml).toContain(`<atom:link href="${ORIGIN}/podcast.xml" rel="self"`);
    expect(xml).toContain(`<link>${ORIGIN}/posts/first-episode</link>`);
    // The page id, not the URL: a renamed slug must not duplicate the episode.
    expect(xml).toContain('<guid isPermaLink="false">page-1</guid>');
    expect(xml).toContain(
      `<enclosure url="${ORIGIN}/media/tenants/x/m1.mp3" length="18401139" type="audio/mpeg"/>`,
    );
    expect(xml).toContain("<itunes:duration>1150</itunes:duration>");
    expect(xml).toContain("<pubDate>Thu, 01 Oct 2026 00:00:00 GMT</pubDate>");
  });

  it("emits episode and season numbers only when they are set", async () => {
    await upsertPage(t.db, makeEpisode({ episode: { audioMediaId: "m1", number: 3, season: 1 } }), TENANT);
    await upsertPage(
      t.db,
      makeEpisode({ id: "page-2", slug: "bonus", date: "2026-10-02" }),
      TENANT,
    );

    const { xml } = await feed();

    expect(xml).toContain("<itunes:episode>3</itunes:episode>");
    expect(xml).toContain("<itunes:season>1</itunes:season>");
    expect(xml.match(/<itunes:episode>/g)).toHaveLength(1);
  });

  it("lists only the public episodes when gated ones exist too", async () => {
    await upsertPage(t.db, makeEpisode(), TENANT);
    await upsertPage(
      t.db,
      makeEpisode({ id: "page-2", slug: "members-only", title: "Secret episode", accessTier: "members" }),
      TENANT,
    );

    const { xml } = await feed();

    expect(xml).toContain("First episode");
    // Not even the title of a gated episode reaches a public directory.
    expect(xml).not.toContain("Secret episode");
  });

  it("escapes titles and notes", async () => {
    await upsertPage(t.db, makeEpisode({ title: "Tools & <tricks>", excerpt: 'A "quoted" note' }), TENANT);

    const { xml } = await feed();

    expect(xml).toContain("<title>Tools &amp; &lt;tricks&gt;</title>");
    expect(xml).not.toContain("<tricks>");
  });

  it("uses safe defaults when the show is not configured", async () => {
    await upsertPage(t.db, makeEpisode(), TENANT);

    const { xml } = await feed();

    expect(xml).toContain('<itunes:category text="Society &amp; Culture"/>');
    expect(xml).toContain("<itunes:explicit>false</itunes:explicit>");
    expect(xml).toContain("<itunes:author>Shed Talk</itunes:author>");
    expect(xml).not.toContain("<itunes:owner>");
    expect(xml).not.toContain("<itunes:image");
  });

  it("publishes the show settings the owner set", async () => {
    await upsertPage(t.db, makeEpisode(), TENANT);
    await setSiteSetting(t.db, TENANT, "podcast_artwork", "tenants/x/cover.png");
    await setSiteSetting(t.db, TENANT, "podcast_author", "Dennis");
    await setSiteSetting(t.db, TENANT, "podcast_owner_email", "dennis@example.com");
    await setSiteSetting(t.db, TENANT, "podcast_category", "Technology");
    await setSiteSetting(t.db, TENANT, "podcast_explicit", "on");

    const { xml } = await feed();

    expect(xml).toContain(`<itunes:image href="${ORIGIN}/media/tenants/x/cover.png"/>`);
    expect(xml).toContain("<itunes:author>Dennis</itunes:author>");
    expect(xml).toContain("<itunes:email>dennis@example.com</itunes:email>");
    expect(xml).toContain('<itunes:category text="Technology"/>');
    expect(xml).toContain("<itunes:explicit>true</itunes:explicit>");
  });

  it("falls back to the default for a stored category directories would reject", async () => {
    await upsertPage(t.db, makeEpisode(), TENANT);
    await setSiteSetting(t.db, TENANT, "podcast_category", "Underwater Basket Weaving");

    expect((await feed()).xml).toContain('<itunes:category text="Society &amp; Culture"/>');
  });
});
