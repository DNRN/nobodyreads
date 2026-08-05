import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import { createBlogApiRoutes } from "./routes.js";
import { upsertPage } from "./db.js";
import type { Page } from "./types.js";

const TENANT = "t1";
const SECRET = "THE PAID BODY";

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: "p1",
    slug: "a-post",
    title: "A post",
    content: `Free intro.\n\n<!--paywall-->\n\n${SECRET}`,
    excerpt: "The teaser.",
    tags: [],
    date: "2026-01-01",
    published: true,
    kind: "post",
    commentsEnabled: true,
    inFeed: true,
    accessTier: "public",
    priceAmount: null,
    ...overrides,
  };
}

function api() {
  return createBlogApiRoutes({ db: t.db, tenantId: TENANT });
}

async function getPost(slug: string): Promise<Record<string, unknown>> {
  const res = await api().request(`/posts/${slug}`);
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /posts/:slug", () => {
  it("returns the full body for a public post", async () => {
    await upsertPage(t.db, makePage(), TENANT);
    const body = await getPost("a-post");
    expect(body.content).toContain(SECRET);
    expect(body.gated).toBeUndefined();
  });

  it("returns the teaser for a paid post", async () => {
    await upsertPage(t.db, makePage({ accessTier: "paid" }), TENANT);
    const body = await getPost("a-post");

    expect(body.content).not.toContain(SECRET);
    expect(body.content).toBe("Free intro.");
    expect(body.gated).toBe(true);
  });

  it("returns the teaser for a members-only post", async () => {
    await upsertPage(t.db, makePage({ accessTier: "members" }), TENANT);
    const body = await getPost("a-post");
    expect(body.content).not.toContain(SECRET);
  });

  it("returns the teaser even though this router has no member identity at all", async () => {
    // The point of the design: `createPublicApiRoutes` is documented as
    // "no member identity required", so this endpoint cannot accidentally be
    // made to trust one. It fails closed by construction, not by a check
    // someone has to remember.
    await upsertPage(t.db, makePage({ accessTier: "paid" }), TENANT);

    const res = await api().request("/posts/a-post", {
      headers: { cookie: "nb_member=whatever; nb_session=whatever" },
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.content).not.toContain(SECRET);
  });

  it("404s an unknown slug", async () => {
    const res = await api().request("/posts/nope");
    expect(res.status).toBe(404);
  });
});

describe("GET /posts", () => {
  it("carries accessTier for lock badges", async () => {
    await upsertPage(t.db, makePage({ accessTier: "paid" }), TENANT);
    const res = await api().request("/posts");
    const list = (await res.json()) as Record<string, unknown>[];

    expect(list).toHaveLength(1);
    expect(list[0].accessTier).toBe("paid");
  });

  it("never carries a body, gated or not", async () => {
    await upsertPage(t.db, makePage({ accessTier: "paid" }), TENANT);
    await upsertPage(t.db, makePage({ id: "p2", slug: "b-post" }), TENANT);

    const res = await api().request("/posts");
    const list = (await res.json()) as Record<string, unknown>[];

    for (const item of list) {
      expect(item).not.toHaveProperty("content");
    }
    expect(JSON.stringify(list)).not.toContain(SECRET);
  });
});
