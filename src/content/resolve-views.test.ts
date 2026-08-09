import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import type { ContentView, Page } from "./types.js";

vi.mock("../shared/db.js", () => ({
  getRawClient: () => testClient,
  getSiteTemplate: async () => null,
}));

import { resolveViews } from "./render.js";
import { upsertContentView, upsertPage } from "./db.js";

const TENANT = "_default";

let t: TestDb;
let testClient: import("@libsql/client").Client;

beforeEach(async () => {
  t = await createTestDb();
  testClient = t.client;

  const post: Page = {
    id: "p1",
    slug: "reeling-in-the-right-gear",
    title: "Reeling In the Right Gear",
    content: "Body.",
    excerpt: "About gear.",
    tags: ["fishing"],
    date: "2026-08-02",
    published: true,
    kind: "post",
  };
  await upsertPage(t.db, post, TENANT);

  const view: ContentView = {
    id: "v1",
    slug: "latest-posts",
    title: "Latest posts",
    kind: "post_list",
    config: { order: "newest" },
    published: true,
  };
  await upsertContentView(t.db, view, TENANT);
});

describe("resolveViews", () => {
  it("resolves a collection token", async () => {
    const out = await resolveViews(t.db, "{{collection:latest-posts}}", TENANT);
    expect(out).toContain("Reeling In the Right Gear");
    expect(out).not.toContain("{{collection:");
  });

  it("resolves every token in a document", async () => {
    const out = await resolveViews(
      t.db,
      "{{collection:latest-posts}}\n\n{{collection:latest-posts}}",
      TENANT,
    );
    const hits = out.split("Reeling In the Right Gear").length - 1;
    expect(hits).toBe(2);
    expect(out).not.toContain("{{");
  });

  it("leaves an unknown slug's token out of the output", async () => {
    const out = await resolveViews(t.db, "a {{collection:nope}} b", TENANT);
    expect(out).not.toContain("{{collection:");
  });

  it("shows a placeholder for an unknown slug when asked", async () => {
    const out = await resolveViews(t.db, "{{collection:nope}}", TENANT, "", {
      showMissingPlaceholders: true,
    });
    expect(out).toContain("nope");
  });

  it("leaves markdown with no token untouched", async () => {
    const markdown = "Just prose, and a {{siteName}} token that is not ours.";
    expect(await resolveViews(t.db, markdown, TENANT)).toBe(markdown);
  });
});
