import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import type { ContentView, Page } from "./types.js";

vi.mock("../shared/db.js", () => ({
  getRawClient: () => testClient,
  getSiteTemplate: async () => null,
}));

import { resolveViews, listUnresolvedViews } from "./render.js";
import { upsertContentView, upsertPage } from "./db.js";
import { DEFAULT_COLLECTION_TEMPLATE } from "./collection-template.js";
import { addSiteTemplateRevision, setCurrentSiteTemplateRevision } from "../shared/site-bundle.js";
import { DEFAULT_TEMPLATE } from "../template/defaults.js";
import type { SiteTemplateDefinition } from "../template/types.js";

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

  it("renders an unknown slug as nothing, on every surface", async () => {
    // It used to be able to render a "Missing view" box instead. That put a
    // message on the page addressed to a reader, who cannot act on it, and it
    // made the draft preview show markup the live page never would.
    const out = await resolveViews(t.db, "{{collection:nope}}", TENANT);

    expect(out.trim()).toBe("");
  });

  it("leaves markdown with no token untouched", async () => {
    const markdown = "Just prose, and a {{siteName}} token that is not ours.";
    expect(await resolveViews(t.db, markdown, TENANT)).toBe(markdown);
  });
});

/**
 * A custom collection is a query plus a template. Both halves used to be gated:
 * the template was executed as server-side JavaScript, so custom collections
 * shipped disabled unless an operator opted in. With the template language
 * there is nothing to execute, so this has to work with no flag set at all.
 */
describe("custom collections render without an opt-in flag", () => {
  beforeEach(async () => {
    await upsertContentView(
      t.db,
      {
        id: "v2",
        slug: "fishing",
        title: "Fishing posts",
        kind: "custom",
        config: {
          query:
            "SELECT slug, title, excerpt, date FROM page_public " +
            "WHERE published = 1 AND kind = 'post' AND tenant_id = :tenant_id " +
            "ORDER BY date DESC LIMIT 5",
          template: DEFAULT_COLLECTION_TEMPLATE,
        },
        published: true,
      } as ContentView,
      TENANT,
    );
  });

  it("renders the rows through the template", async () => {
    delete process.env.CUSTOM_VIEW_JS_TEMPLATES;
    const out = await resolveViews(t.db, "{{collection:fishing}}", TENANT, "/alice");

    expect(out).toContain("Reeling In the Right Gear");
    expect(out).toContain('href="/alice/posts/reeling-in-the-right-gear"');
    expect(out).toContain("2 Aug 2026");
    expect(out.toLowerCase()).not.toContain("disabled");
  });

  it("escapes row values rather than trusting them", async () => {
    await upsertPage(
      t.db,
      {
        id: "p2",
        slug: "xss",
        title: "<script>alert(1)</script>",
        content: "Body.",
        excerpt: "",
        tags: [],
        date: "2026-08-03",
        published: true,
        kind: "post",
      } as Page,
      TENANT,
    );

    const out = await resolveViews(t.db, "{{collection:fishing}}", TENANT, "");
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script>alert(1)</script>");
  });

  it("shows a message instead of a page when the template is broken", async () => {
    await upsertContentView(
      t.db,
      {
        id: "v3",
        slug: "broken",
        title: "Broken",
        kind: "custom",
        config: { query: "SELECT slug FROM page_public WHERE tenant_id = :tenant_id", template: "{{#each rows}}" },
        published: true,
      } as ContentView,
      TENANT,
    );

    const out = await resolveViews(t.db, "{{collection:broken}}", TENANT, "");
    expect(out).toContain("content-view-error");
    expect(out).toContain("never closed");
  });
});

describe("post list layout", () => {
  const withVariant = (variant: string) =>
    ({
      ...DEFAULT_TEMPLATE,
      components: { postPreview: { variant } },
    }) as unknown as SiteTemplateDefinition;

  /** Publish `card`, then leave `grid` sitting unpublished — the editor's state. */
  async function seedThemes(): Promise<SiteTemplateDefinition> {
    const published = await addSiteTemplateRevision(t.db, withVariant("card"), TENANT);
    await setCurrentSiteTemplateRevision(t.db, published, TENANT);
    const draft = withVariant("grid");
    await addSiteTemplateRevision(t.db, draft, TENANT);
    return draft;
  }

  it("uses the published theme when handed none", async () => {
    await seedThemes();

    const out = await resolveViews(t.db, "{{collection:latest-posts}}", TENANT);

    expect(out).toContain("post-list--card");
  });

  it("uses the theme it is handed, not the published one", async () => {
    const draft = await seedThemes();

    const out = await resolveViews(t.db, "{{collection:latest-posts}}", TENANT, "", {
      template: draft,
    });

    // The bug this guards: the preview renders a draft revision, so reading the
    // published theme here left an author's new arrangement invisible until
    // they published it.
    expect(out).toContain("post-list--grid");
    expect(out).not.toContain("post-list--card");
  });
});

describe("listUnresolvedViews", () => {
  it("names the collections a page embeds but no longer has", async () => {
    const markdown = "{{collection:latest-posts}} and {{collection:gone}}";

    expect(await listUnresolvedViews(t.db, markdown, TENANT)).toEqual(["gone"]);
  });

  it("says nothing when every embed resolves", async () => {
    expect(await listUnresolvedViews(t.db, "{{collection:latest-posts}}", TENANT)).toEqual([]);
  });

  it("reports each missing collection once, however often it appears", async () => {
    const markdown = "{{collection:gone}}\n\n{{collection:gone}}";

    expect(await listUnresolvedViews(t.db, markdown, TENANT)).toEqual(["gone"]);
  });

  /**
   * The lint reports what a *reader* will not see, so an unpublished collection
   * counts as missing. It is the likeliest case by far — far more pages embed a
   * collection that was never published than one that was deleted — and the old
   * "Missing view" placeholder never caught it either.
   */
  it("counts an unpublished collection as missing", async () => {
    await upsertContentView(
      t.db,
      {
        id: "v-draft",
        slug: "not-yet",
        title: "Not yet",
        kind: "post_list",
        config: { order: "newest" },
        published: false,
      } as ContentView,
      TENANT,
    );

    expect(await listUnresolvedViews(t.db, "{{collection:not-yet}}", TENANT)).toEqual(["not-yet"]);
  });
});
