import { describe, it, expect } from "vitest";
import { renderPostListView } from "./templates.js";
import type { PageSummary } from "./types.js";

function posts(count: number, overrides: Partial<PageSummary> = {}): PageSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    slug: `post-${i}`,
    title: `Post ${i}`,
    excerpt: "An excerpt.",
    tags: [],
    date: "2026-08-01",
    accessTier: "public",
    ...overrides,
  }));
}

describe("post list layout", () => {
  it("auto keeps a handful of posts as rows and switches an archive to cards", () => {
    expect(renderPostListView(posts(3))).toContain("post-list--default");
    expect(renderPostListView(posts(20))).toContain("post-list--card");
  });

  it("an explicit variant overrides the count", () => {
    expect(renderPostListView(posts(20), { variant: "default" })).toContain("post-list--default");
    expect(renderPostListView(posts(2), { variant: "card" })).toContain("post-list--card");
  });
});

describe("progressive disclosure", () => {
  it("shows no filter on a sparse list", () => {
    const html = renderPostListView(posts(3, { tags: ["a", "b"] }));
    expect(html).not.toContain("data-post-filter");
  });

  it("shows a filter once there are enough posts and more than one tag", () => {
    const many = posts(10).map((p, i) => ({ ...p, tags: [i % 2 ? "code" : "fishing"] }));
    const html = renderPostListView(many);
    expect(html).toContain("data-post-filter");
    expect(html).toContain('data-filter-tag="fishing"');
  });

  it("shows no filter when every post carries the same single tag", () => {
    const html = renderPostListView(posts(10, { tags: ["notes"] }));
    expect(html).not.toContain("data-post-filter");
  });

  it("hides posts past the first page and offers to load more", () => {
    const html = renderPostListView(posts(20));
    expect(html).toContain("data-post-more-button");
    expect(html.match(/<article hidden /g)).toHaveLength(8);
  });

  it("offers no load-more when everything already fits", () => {
    const html = renderPostListView(posts(12));
    expect(html).not.toContain("data-post-more");
    expect(html).not.toContain("<article hidden");
  });
});

describe("cards", () => {
  it("drops the cover region entirely when a post has no image", () => {
    const html = renderPostListView(posts(20));
    expect(html).not.toContain("post-card__cover");
  });

  it("resolves a stored media key through the host's URL builder", () => {
    const html = renderPostListView(posts(20, { coverImage: "abc123" }), {
      mediaUrl: (key) => `/media/${key}`,
    });
    expect(html).toContain('src="/media/abc123"');
  });

  it("passes an absolute cover URL through untouched", () => {
    const html = renderPostListView(posts(20, { coverImage: "https://cdn.test/x.png" }), {
      mediaUrl: () => "/wrong",
    });
    expect(html).toContain('src="https://cdn.test/x.png"');
  });
});

describe("empty state", () => {
  it("gives an owner somewhere to go and a note only they can see", () => {
    const html = renderPostListView([], { isOwner: true, composeHref: "/admin/editor/new" });
    expect(html).toContain("site-empty--owner");
    expect(html).toContain("/admin/editor/new");
    expect(html).toContain("Only you");
  });

  it("never shows a visitor the owner-only note or the compose link", () => {
    const html = renderPostListView([], { composeHref: "/admin/editor/new", siteName: "Alice" });
    expect(html).toContain("site-empty--visitor");
    expect(html).not.toContain("Only you");
    expect(html).not.toContain("/admin/editor/new");
    expect(html).toContain("Alice");
  });

  it("calls the space whatever the host calls it", () => {
    expect(renderPostListView([], {})).toContain("A quiet blog");
    expect(renderPostListView([], { spaceNoun: "plot" })).toContain("A quiet plot");
  });
});
