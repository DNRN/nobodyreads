import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { createTestDb, type TestDb } from "../../../test/db.js";
import type { AdminModuleContext } from "./types.js";

vi.mock("../../../shared/db.js", () => ({ getRawClient: () => testClient }));

import { createViewRoutes } from "./views.js";
import { listContentViews, upsertContentView, upsertPage } from "../../../content/db.js";

const TENANT = "_default";

let t: TestDb;
let testClient: import("@libsql/client").Client;

beforeEach(async () => {
  t = await createTestDb();
  testClient = t.client;
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
  app.route("/", createViewRoutes(ctx));
  return app;
}

function postForm(app: Hono, path: string, fields: Record<string, string> = {}) {
  const body = new URLSearchParams({
    id: "",
    title: "Latest",
    slug: "latest",
    kind: "post_list",
    ...fields,
  });
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("collection routes", () => {
  it("saves and redirects to the collections URL", async () => {
    const res = await postForm(mount(), "/collections/save");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^\/admin\/collections\/.+/);
    expect(await listContentViews(t.db, TENANT)).toHaveLength(1);
  });

  it("deletes and returns to the collections list", async () => {
    const res = await mount().request("/collections/delete/x", { method: "POST" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin/collections");
  });

  it("rejects an invalid form", async () => {
    const res = await postForm(mount(), "/collections/save", { slug: "Not A Slug" });
    expect(res.status).toBe(400);
  });

  it("rejects a custom query that reads a table outside the allowlist", async () => {
    const res = await postForm(mount(), "/collections/save", {
      kind: "custom",
      query: "SELECT * FROM page WHERE tenant_id = :tenant_id",
    });
    expect(res.status).toBe(400);
  });
});

function postJson(app: Hono, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const GOOD_QUERY =
  "SELECT slug, title FROM page_public WHERE tenant_id = :tenant_id LIMIT 5";

/**
 * The create screen's preview runs the author's own query and template before
 * anything is saved, so it has to enforce exactly what a save enforces — a
 * preview that renders something the saved collection could not is a hole.
 */
describe("collection preview", () => {
  beforeEach(async () => {
    await upsertPage(
      t.db,
      {
        id: "p1",
        slug: "hello",
        title: "Hello world",
        content: "Body.",
        excerpt: "",
        tags: [],
        date: "2026-08-02",
        published: true,
        kind: "post",
      } as never,
      TENANT,
    );
  });

  it("renders rows through the template", async () => {
    const res = await postJson(mount(), "/collections/preview", {
      kind: "custom",
      query: GOOD_QUERY,
      template: "{{#each rows}}<p>{{title}}</p>{{/each}}",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rowCount).toBe(1);
    expect(data.html).toContain("<p>Hello world</p>");
  });

  it("refuses a query that reads outside the allowlist", async () => {
    const res = await postJson(mount(), "/collections/preview", {
      kind: "custom",
      query: "SELECT * FROM tenant WHERE tenant_id = :tenant_id",
      template: "{{#each rows}}x{{/each}}",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not allowed/);
  });

  it("refuses a query that is not tenant-scoped", async () => {
    const res = await postJson(mount(), "/collections/preview", {
      kind: "custom",
      query: "SELECT slug FROM page_public LIMIT 1",
      template: "{{#each rows}}x{{/each}}",
    });
    expect(res.status).toBe(400);
  });

  it("refuses a template that does not parse", async () => {
    const res = await postJson(mount(), "/collections/preview", {
      kind: "custom",
      query: GOOD_QUERY,
      template: "{{#each rows}}<p>{{title}}</p>",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/never closed/);
  });

  it("previews a built-in post list without a query", async () => {
    const res = await postJson(mount(), "/collections/preview", { kind: "post_list", limit: 3 });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("html");
  });
});

describe("saving refuses a broken template", () => {
  it("rejects it rather than storing something that cannot render", async () => {
    const res = await postForm(mount(), "/collections/save", {
      kind: "custom",
      query: GOOD_QUERY,
      template: "{{#each rows}}",
    });
    expect(res.status).toBe(400);
    expect(await listContentViews(t.db, TENANT)).toEqual([]);
  });
});

describe("duplicate", () => {
  beforeEach(async () => {
    await upsertContentView(
      t.db,
      {
        id: "src",
        slug: "original",
        title: "Original",
        kind: "custom",
        config: { query: GOOD_QUERY, template: "{{#each rows}}<p>{{title}}</p>{{/each}}" },
        published: true,
      },
      TENANT,
    );
  });

  it("copies to a new draft with its own slug", async () => {
    const res = await mount().request("/collections/duplicate/src", { method: "POST" });
    expect(res.status).toBe(302);

    const all = await listContentViews(t.db, TENANT);
    expect(all).toHaveLength(2);
    const copy = all.find((v) => v.id !== "src")!;
    // A copy must not claim the original's slug, and must not go live on its
    // own — nobody's pages are embedding it yet.
    expect(copy.slug).toBe("original-copy");
    expect(copy.published).toBe(false);
    expect(copy.title).toBe("Original (copy)");
  });

  it("redirects to the collections list for an unknown id", async () => {
    const res = await mount().request("/collections/duplicate/nope", { method: "POST" });
    expect(res.headers.get("location")).toBe("/admin/collections");
  });
});
