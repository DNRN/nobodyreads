import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import { createBlogApiRoutes } from "./index.js";
import { upsertPage } from "./db.js";
import type { Hono } from "hono";
import type { Page } from "./types.js";

const TENANT = "_default";

let t: TestDb;
let app: Hono;

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: "p1",
    slug: "hello-world",
    title: "Hello World",
    content: "# Hello",
    excerpt: "A greeting",
    tags: ["intro"],
    date: "2025-01-15",
    published: true,
    kind: "post",
    ...overrides,
  };
}

beforeEach(async () => {
  t = await createTestDb();
  app = createBlogApiRoutes({ db: t.db });
});

describe("GET /posts", () => {
  it("returns an empty array when no posts exist", async () => {
    const res = await app.request("/posts");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns published posts", async () => {
    await upsertPage(t.db, makePage({ id: "p1", slug: "first", date: "2025-01-01" }), TENANT);
    await upsertPage(t.db, makePage({ id: "p2", slug: "second", date: "2025-06-01" }), TENANT);

    const res = await app.request("/posts");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].slug).toBe("second");
    expect(body[1].slug).toBe("first");
  });

  it("excludes unpublished posts", async () => {
    await upsertPage(t.db, makePage({ published: false }), TENANT);

    const res = await app.request("/posts");
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it("excludes non-post pages", async () => {
    await upsertPage(t.db, makePage({ kind: "page", slug: "about" }), TENANT);

    const res = await app.request("/posts");
    const body = await res.json();
    expect(body).toHaveLength(0);
  });
});

describe("GET /posts/:slug", () => {
  it("returns a single post by slug", async () => {
    await upsertPage(t.db, makePage(), TENANT);

    const res = await app.request("/posts/hello-world");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe("hello-world");
    expect(body.title).toBe("Hello World");
  });

  it("returns 404 for nonexistent slug", async () => {
    const res = await app.request("/posts/nope");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Post not found");
  });

  it("returns 404 for unpublished post", async () => {
    await upsertPage(t.db, makePage({ published: false }), TENANT);

    const res = await app.request("/posts/hello-world");
    expect(res.status).toBe(404);
  });
});
