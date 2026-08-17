import { describe, it, expect } from "vitest";
import {
  DEFAULT_COLLECTION_SLUG,
  buildDefaultHomeContent,
  defaultHomePage,
  defaultLatestPostsView,
} from "./defaults.js";
import { embedTokenPattern } from "../shared/embed-token.js";

describe("starter content", () => {
  /**
   * The regression this guards: the home page shipped an embed token for a
   * collection nothing created, and an unknown slug renders as an empty string
   * on a public page — so the section just silently went missing.
   */
  it("seeds the collection the home page embeds", () => {
    const embedded = [...buildDefaultHomeContent().matchAll(embedTokenPattern())].map((m) => m[1]);

    expect(embedded).toContain(DEFAULT_COLLECTION_SLUG);
    expect(defaultLatestPostsView().slug).toBe(DEFAULT_COLLECTION_SLUG);
  });

  it("seeds that collection published, so a reader sees it", () => {
    expect(defaultLatestPostsView().published).toBe(true);
  });

  it("points the getting-started copy at the given admin URL", () => {
    expect(buildDefaultHomeContent("/alice/admin")).toContain("(/alice/admin)");
  });

  it("builds a home page carrying that content", () => {
    const page = defaultHomePage({ title: "Alice", date: "2026-01-01" });

    expect(page.kind).toBe("home");
    expect(page.published).toBe(true);
    expect(page.content).toContain(DEFAULT_COLLECTION_SLUG);
  });
});
