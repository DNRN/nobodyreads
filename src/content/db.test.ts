import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import type { Page, ContentView } from "./types.js";

vi.mock("../shared/db.js", () => ({
  getRawClient: () => testClient,
}));

import {
  upsertPage,
  getPageBySlug,
  getPageById,
  listPosts,
  listPostsForView,
  deletePage,
  getPageByKind,
  getNavItems,
  resolvePageLinks,
  listAllPages,
  upsertContentView,
  getContentViewBySlug,
  getContentViewById,
  deleteContentView,
  listContentViews,
  validateCustomQuery,
  executeCustomViewQuery,
  insertMedia,
  listMedia,
  getMediaById,
  deleteMediaRecord,
} from "./db.js";

const TENANT = "_default";

let t: TestDb;
let testClient: import("@libsql/client").Client;

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
  testClient = t.client;
});

// ---------- Pages ----------

describe("upsertPage", () => {
  it("inserts a new page", async () => {
    const p = makePage();
    await upsertPage(t.db, p, TENANT);

    const fetched = await getPageById(t.db, "p1", TENANT);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe("Hello World");
    expect(fetched!.tags).toEqual(["intro"]);
  });

  it("updates an existing page on conflict", async () => {
    await upsertPage(t.db, makePage(), TENANT);
    await upsertPage(t.db, makePage({ title: "Updated Title" }), TENANT);

    const fetched = await getPageById(t.db, "p1", TENANT);
    expect(fetched!.title).toBe("Updated Title");
  });
});

describe("getPageBySlug", () => {
  it("returns a published page by slug and kind", async () => {
    await upsertPage(t.db, makePage(), TENANT);
    const page = await getPageBySlug(t.db, "hello-world", "post", TENANT);
    expect(page).not.toBeNull();
    expect(page!.slug).toBe("hello-world");
  });

  it("returns null for unpublished pages", async () => {
    await upsertPage(t.db, makePage({ published: false }), TENANT);
    const page = await getPageBySlug(t.db, "hello-world", "post", TENANT);
    expect(page).toBeNull();
  });

  it("returns null for wrong kind", async () => {
    await upsertPage(t.db, makePage({ kind: "post" }), TENANT);
    const page = await getPageBySlug(t.db, "hello-world", "page", TENANT);
    expect(page).toBeNull();
  });
});

describe("getPageById", () => {
  it("returns a page regardless of published status", async () => {
    await upsertPage(t.db, makePage({ published: false }), TENANT);
    const page = await getPageById(t.db, "p1", TENANT);
    expect(page).not.toBeNull();
    expect(page!.published).toBe(false);
  });

  it("returns null for nonexistent id", async () => {
    const page = await getPageById(t.db, "nope", TENANT);
    expect(page).toBeNull();
  });
});

describe("listPosts", () => {
  it("returns only published posts, newest first", async () => {
    await upsertPage(t.db, makePage({ id: "p1", slug: "old", date: "2025-01-01" }), TENANT);
    await upsertPage(t.db, makePage({ id: "p2", slug: "new", date: "2025-06-01" }), TENANT);
    await upsertPage(t.db, makePage({ id: "p3", slug: "draft", published: false, date: "2025-12-01" }), TENANT);
    await upsertPage(t.db, makePage({ id: "p4", slug: "about", kind: "page", date: "2025-03-01" }), TENANT);

    const posts = await listPosts(t.db, TENANT);
    expect(posts).toHaveLength(2);
    expect(posts[0].slug).toBe("new");
    expect(posts[1].slug).toBe("old");
  });

  it("returns empty array when no published posts", async () => {
    const posts = await listPosts(t.db, TENANT);
    expect(posts).toEqual([]);
  });
});

describe("listPostsForView", () => {
  it("respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      await upsertPage(
        t.db,
        makePage({ id: `p${i}`, slug: `post-${i}`, date: `2025-0${i + 1}-01` }),
        TENANT,
      );
    }
    const posts = await listPostsForView(t.db, TENANT, { limit: 2 });
    expect(posts).toHaveLength(2);
  });

  it("returns all when no limit", async () => {
    for (let i = 0; i < 3; i++) {
      await upsertPage(
        t.db,
        makePage({ id: `p${i}`, slug: `post-${i}`, date: `2025-0${i + 1}-01` }),
        TENANT,
      );
    }
    const posts = await listPostsForView(t.db, TENANT);
    expect(posts).toHaveLength(3);
  });
});

describe("deletePage", () => {
  it("removes a page", async () => {
    await upsertPage(t.db, makePage(), TENANT);
    await deletePage(t.db, "p1", TENANT);
    const page = await getPageById(t.db, "p1", TENANT);
    expect(page).toBeNull();
  });
});

describe("getPageByKind", () => {
  it("returns the first published page of a kind", async () => {
    await upsertPage(
      t.db,
      makePage({ id: "home1", slug: "home", kind: "home", title: "Home Page" }),
      TENANT,
    );
    const page = await getPageByKind(t.db, "home", TENANT);
    expect(page).not.toBeNull();
    expect(page!.title).toBe("Home Page");
  });

  it("returns null if no published page of that kind", async () => {
    const page = await getPageByKind(t.db, "home", TENANT);
    expect(page).toBeNull();
  });
});

describe("getNavItems", () => {
  it("returns published pages with navLabel, ordered by navOrder", async () => {
    await upsertPage(
      t.db,
      makePage({ id: "n1", slug: "about", kind: "page", nav: { label: "About", order: 2 } }),
      TENANT,
    );
    await upsertPage(
      t.db,
      makePage({ id: "n2", slug: "contact", kind: "page", nav: { label: "Contact", order: 1 } }),
      TENANT,
    );
    await upsertPage(
      t.db,
      makePage({ id: "n3", slug: "no-nav", kind: "page" }),
      TENANT,
    );

    const items = await getNavItems(t.db, TENANT);
    expect(items).toHaveLength(2);
    expect(items[0].label).toBe("Contact");
    expect(items[1].label).toBe("About");
  });
});

describe("resolvePageLinks", () => {
  it("resolves published page ids to link targets", async () => {
    await upsertPage(t.db, makePage({ id: "p1", slug: "hello" }), TENANT);
    await upsertPage(t.db, makePage({ id: "p2", slug: "world" }), TENANT);
    await upsertPage(t.db, makePage({ id: "p3", slug: "draft", published: false }), TENANT);

    const targets = await resolvePageLinks(t.db, ["p1", "p2", "p3"], TENANT);
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.id).sort()).toEqual(["p1", "p2"]);
  });

  it("returns empty for empty ids array", async () => {
    const targets = await resolvePageLinks(t.db, [], TENANT);
    expect(targets).toEqual([]);
  });
});

describe("listAllPages", () => {
  it("includes drafts and all kinds", async () => {
    await upsertPage(t.db, makePage({ id: "p1", slug: "post1" }), TENANT);
    await upsertPage(t.db, makePage({ id: "p2", slug: "draft1", published: false }), TENANT);
    await upsertPage(t.db, makePage({ id: "p3", slug: "home", kind: "home" }), TENANT);

    const pages = await listAllPages(t.db, TENANT);
    expect(pages).toHaveLength(3);
  });
});

// ---------- Content Views ----------

function makeView(overrides: Partial<ContentView> = {}): ContentView {
  return {
    id: "v1",
    slug: "latest-posts",
    title: "Latest Posts",
    kind: "post_list",
    config: { order: "newest" as const },
    published: true,
    ...overrides,
  };
}

describe("upsertContentView", () => {
  it("inserts a new view", async () => {
    await upsertContentView(t.db, makeView(), TENANT);
    const view = await getContentViewById(t.db, "v1", TENANT);
    expect(view).not.toBeNull();
    expect(view!.title).toBe("Latest Posts");
  });

  it("updates an existing view", async () => {
    await upsertContentView(t.db, makeView(), TENANT);
    await upsertContentView(t.db, makeView({ title: "Updated" }), TENANT);
    const view = await getContentViewById(t.db, "v1", TENANT);
    expect(view!.title).toBe("Updated");
  });
});

describe("getContentViewBySlug", () => {
  it("returns a view by slug", async () => {
    await upsertContentView(t.db, makeView(), TENANT);
    const view = await getContentViewBySlug(t.db, "latest-posts", TENANT);
    expect(view).not.toBeNull();
  });

  it("respects publishedOnly flag", async () => {
    await upsertContentView(t.db, makeView({ published: false }), TENANT);
    const view = await getContentViewBySlug(t.db, "latest-posts", TENANT, { publishedOnly: true });
    expect(view).toBeNull();
  });
});

describe("listContentViews", () => {
  it("lists all views for tenant", async () => {
    await upsertContentView(t.db, makeView({ id: "v1", slug: "b-view", title: "B View" }), TENANT);
    await upsertContentView(t.db, makeView({ id: "v2", slug: "a-view", title: "A View" }), TENANT);
    const views = await listContentViews(t.db, TENANT);
    expect(views).toHaveLength(2);
    expect(views[0].title).toBe("A View");
  });
});

describe("deleteContentView", () => {
  it("removes a view", async () => {
    await upsertContentView(t.db, makeView(), TENANT);
    await deleteContentView(t.db, "v1", TENANT);
    const view = await getContentViewById(t.db, "v1", TENANT);
    expect(view).toBeNull();
  });
});

// ---------- validateCustomQuery ----------

describe("validateCustomQuery", () => {
  it("accepts a valid SELECT", () => {
    expect(validateCustomQuery("SELECT slug, title FROM page")).toBeNull();
  });

  it("rejects empty query", () => {
    expect(validateCustomQuery("")).toBe("Query cannot be empty");
  });

  it("rejects non-SELECT statements", () => {
    expect(validateCustomQuery("INSERT INTO page VALUES('x')")).not.toBeNull();
  });

  it("rejects SELECT with forbidden keywords", () => {
    expect(validateCustomQuery("SELECT * FROM page; DROP TABLE page")).not.toBeNull();
  });

  for (const keyword of ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE"]) {
    it(`rejects query containing ${keyword}`, () => {
      expect(validateCustomQuery(`SELECT 1; ${keyword} something`)).not.toBeNull();
    });
  }
});

// ---------- executeCustomViewQuery ----------

describe("executeCustomViewQuery", () => {
  it("executes a valid SELECT and returns rows", async () => {
    await upsertPage(t.db, makePage(), TENANT);

    const rows = await executeCustomViewQuery(
      t.db,
      "SELECT slug, title FROM page WHERE tenant_id = :tenant_id",
      TENANT,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe("hello-world");
  });

  it("throws on invalid query", async () => {
    await expect(
      executeCustomViewQuery(t.db, "DROP TABLE page", TENANT),
    ).rejects.toThrow("Invalid custom view query");
  });
});

// ---------- Media ----------

describe("media queries", () => {
  const urlFn = (key: string) => `/media/${key}`;

  it("inserts and retrieves media", async () => {
    await insertMedia(
      t.db,
      { id: "m1", storageKey: "abc.png", originalName: "photo.png", mimeType: "image/png", size: 1024 },
      TENANT,
    );
    const item = await getMediaById(t.db, "m1", TENANT, urlFn);
    expect(item).not.toBeNull();
    expect(item!.originalName).toBe("photo.png");
    expect(item!.url).toBe("/media/abc.png");
  });

  it("lists media newest first", async () => {
    await insertMedia(
      t.db,
      { id: "m1", storageKey: "a.png", originalName: "a.png", mimeType: "image/png", size: 100 },
      TENANT,
    );
    await insertMedia(
      t.db,
      { id: "m2", storageKey: "b.png", originalName: "b.png", mimeType: "image/png", size: 200 },
      TENANT,
    );
    const items = await listMedia(t.db, TENANT, urlFn);
    expect(items).toHaveLength(2);
  });

  it("deletes a media record", async () => {
    await insertMedia(
      t.db,
      { id: "m1", storageKey: "a.png", originalName: "a.png", mimeType: "image/png", size: 100 },
      TENANT,
    );
    await deleteMediaRecord(t.db, "m1", TENANT);
    const item = await getMediaById(t.db, "m1", TENANT, urlFn);
    expect(item).toBeNull();
  });
});

// ---------- Tenant Isolation ----------

describe("tenant isolation", () => {
  const TENANT_A = "tenant-a";
  const TENANT_B = "tenant-b";

  it("pages are isolated between tenants", async () => {
    await upsertPage(t.db, makePage({ id: "p1", slug: "shared-slug" }), TENANT_A);
    await upsertPage(t.db, makePage({ id: "p2", slug: "shared-slug" }), TENANT_B);

    const postsA = await listPosts(t.db, TENANT_A);
    const postsB = await listPosts(t.db, TENANT_B);
    expect(postsA).toHaveLength(1);
    expect(postsB).toHaveLength(1);
    expect(postsA[0].id).toBe("p1");
    expect(postsB[0].id).toBe("p2");
  });

  it("content views are isolated between tenants", async () => {
    await upsertContentView(t.db, makeView({ id: "v1", slug: "latest" }), TENANT_A);

    const viewsA = await listContentViews(t.db, TENANT_A);
    const viewsB = await listContentViews(t.db, TENANT_B);
    expect(viewsA).toHaveLength(1);
    expect(viewsB).toHaveLength(0);
  });
});
