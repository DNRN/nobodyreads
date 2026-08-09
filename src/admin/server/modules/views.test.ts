import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { createTestDb, type TestDb } from "../../../test/db.js";
import type { AdminModuleContext } from "./types.js";

vi.mock("../../../shared/db.js", () => ({ getRawClient: () => testClient }));

import { createViewRoutes } from "./views.js";
import { listContentViews } from "../../../content/db.js";

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
