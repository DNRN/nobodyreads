import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import type { Page, ContentView } from "../content/types.js";
import type { SiteTemplateDefinition } from "../template/types.js";

vi.mock("../shared/db.js", () => ({
  getRawClient: () => testClient,
}));

import { resolvePageView } from "./page.js";
import type { SiteContext, Viewer } from "./context.js";
import { upsertPage, upsertContentView } from "../content/db.js";
import { DEFAULT_TEMPLATE } from "../template/defaults.js";

const TENANT = "_default";

let t: TestDb;
let testClient: import("@libsql/client").Client;

/** A context for the live surface. The draft surface differs by `urlPrefix`. */
function context(overrides: Partial<SiteContext> = {}): SiteContext {
  return {
    tenantId: TENANT,
    siteName: "Alice's plot",
    siteTagline: "Notes from a shed",
    siteUrl: "https://alice.example.com",
    urlPrefix: "",
    publicUrlPrefix: "",
    brandHref: "/",
    loginHref: "https://example.com/login",
    spaceNoun: "plot",
    heroEyebrow: "alice.example.com",
    composeHref: "/admin/editor/new",
    feedHref: "/feed.xml",
    apiBase: "/api",
    buildMenu: () => ({ menuHeader: "@alice", menuItems: [{ label: "Settings", href: "/s" }] }),
    ...overrides,
  };
}

const reader: Viewer = { isOwner: false, member: null, previewAs: null };
const owner: Viewer = { isOwner: true, member: null, previewAs: null };

const withVariant = (variant: string) =>
  ({ ...DEFAULT_TEMPLATE, components: { postPreview: { variant } } }) as unknown as SiteTemplateDefinition;

beforeEach(async () => {
  t = await createTestDb();
  testClient = t.client;

  await upsertPage(
    t.db,
    {
      id: "home",
      slug: "home",
      title: "Home",
      content: "Welcome.\n\n{{collection:latest-posts}}",
      excerpt: "",
      tags: [],
      date: "2026-08-01",
      published: true,
      kind: "home",
    } as Page,
    TENANT,
  );

  await upsertPage(
    t.db,
    {
      id: "p1",
      slug: "a-post",
      title: "A Post",
      content: "Body text.",
      excerpt: "About a thing.",
      tags: ["shed"],
      date: "2026-08-02",
      published: true,
      kind: "post",
    } as Page,
    TENANT,
  );

  await upsertContentView(
    t.db,
    {
      id: "v1",
      slug: "latest-posts",
      title: "Latest posts",
      kind: "post_list",
      config: { order: "newest" },
      published: true,
    } as ContentView,
    TENANT,
  );
});

describe("resolvePageView", () => {
  it("gives the live page and the draft preview the same layout", async () => {
    const template = withVariant("grid");

    const live = await resolvePageView(t.db, context(), reader, { kind: "home" }, template);
    const draft = await resolvePageView(
      t.db,
      context({ urlPrefix: "/preview" }),
      owner,
      { kind: "home" },
      template,
    );

    // The preview differs by the prefix its links are built under and nothing
    // else. Every field that used to be hand-written per call site — and so
    // drifted — is compared here.
    const { pathname: livePath, urlPrefix: livePrefix, ...liveRest } = live.layout;
    const { pathname: draftPath, urlPrefix: draftPrefix, ...draftRest } = draft.layout;

    expect(liveRest).toEqual(draftRest);
    expect(livePath).toBe("/");
    expect(draftPath).toBe("/preview");
    expect(livePrefix).toBe("");
    expect(draftPrefix).toBe("/preview");
  });

  it("carries the site's own identity, not the engine's", async () => {
    const view = await resolvePageView(t.db, context(), reader, { kind: "home" }, null);

    // A missing tagline is what made every preview introduce itself as a blog
    // engine, so the context supplies one and the layout must carry it through.
    expect(view.layout.siteName).toBe("Alice's plot");
    expect(view.layout.siteTagline).toBe("Notes from a shed");
    expect(view.layout.heroEyebrow).toBe("alice.example.com");
    expect(view.layout.siteUrl).toBe("https://alice.example.com");
    expect(view.layout.menuHeader).toBe("@alice");
    expect(view.layout.menuItems).toHaveLength(1);
  });

  it("renders a listing with the theme it is handed", async () => {
    const view = await resolvePageView(
      t.db,
      context(),
      reader,
      { kind: "home" },
      withVariant("card"),
    );

    expect(view.bodyHtml).toContain("post-list--card");
  });

  it("titles the home page after the site and a post after itself", async () => {
    const home = await resolvePageView(t.db, context(), reader, { kind: "home" }, null);
    const post = await resolvePageView(
      t.db,
      context(),
      reader,
      { kind: "post", slug: "a-post" },
      null,
    );

    expect(home.layout.title).toBe("Alice's plot");
    expect(home.layout.ogType).toBe("website");
    expect(post.layout.title).toBe("A Post — Alice's plot");
    expect(post.layout.ogType).toBe("article");
    expect(post.layout.pathname).toBe("/posts/a-post");
  });

  it("reports a missing page as a 404 view rather than throwing", async () => {
    const view = await resolvePageView(
      t.db,
      context(),
      reader,
      { kind: "post", slug: "no-such-post" },
      null,
    );

    expect(view.page).toBeNull();
    expect(view.layout.seo?.noIndex).toBe(true);
    // Still the site's own chrome: a 404 on a plot is not a 404 on the engine.
    expect(view.layout.siteName).toBe("Alice's plot");
    expect(view.layout.menuHeader).toBe("@alice");
  });
});
