import { embedToken } from "../shared/embed-token.js";
import type { ContentView, Page } from "./types.js";

/**
 * Slug of the collection the starter home page embeds. Shared by the content
 * and the view so the two cannot drift — a home page referencing a collection
 * nobody seeds renders as nothing at all (public rendering does not draw the
 * missing-view placeholder).
 */
export const DEFAULT_COLLECTION_SLUG = "latest-posts";

export interface DefaultHomePageOptions {
  /** Page title — typically the site or owner name. */
  title: string;
  /** ISO date stamp (YYYY-MM-DD) for the page. */
  date: string;
  /**
   * Link to the admin dashboard used in the getting-started copy. The
   * single-tenant default is "/admin"; a multi-tenant host passes a
   * tenant-scoped path such as "/alice/admin".
   */
  adminHref?: string;
}

/**
 * Markdown for the starter home page shown on a brand-new site. It welcomes the
 * creator and points them at the admin so they can replace it with their own
 * words. As soon as they save any edit the page gets an `updated` stamp, which
 * is how the admin "Get started" checklist knows to stop nudging them to
 * personalize it.
 */
export function buildDefaultHomeContent(adminHref = "/admin"): string {
  return [
    "# Welcome to your new site",
    "",
    "This is your home page, and right now it's still wearing the default text. Let's make it yours.",
    "",
    "## Getting started",
    "",
    `1. **Open the [admin dashboard](${adminHref}).** Everything you write and change lives there.`,
    "2. **Edit this home page.** Replace all of this with whatever you want visitors to land on.",
    "3. **Write your first post** and publish it — new posts appear automatically below.",
    "",
    "Nobody reads it anyway. So write for yourself.",
    "",
    embedToken(DEFAULT_COLLECTION_SLUG),
  ].join("\n");
}

/**
 * The collection {@link buildDefaultHomeContent} embeds.
 *
 * Seed this whenever you seed {@link defaultHomePage} — the starter home page
 * references it by slug, so a site that gets the page without the view shows a
 * silently empty section where its posts should be.
 */
export function defaultLatestPostsView(): ContentView {
  return {
    id: DEFAULT_COLLECTION_SLUG,
    slug: DEFAULT_COLLECTION_SLUG,
    title: "Latest posts",
    kind: "post_list",
    config: { order: "newest", limit: 10 },
    published: true,
  };
}

/** A complete starter home page record for seeding a fresh site. */
export function defaultHomePage(options: DefaultHomePageOptions): Page {
  return {
    id: "home",
    slug: "home",
    title: options.title,
    content: buildDefaultHomeContent(options.adminHref),
    excerpt: "Your site. Your words.",
    tags: [],
    date: options.date,
    published: true,
    kind: "home",
    nav: { label: "home", order: 0 },
    seo: { metaDescription: "A personal blog.", ogType: "website" },
    commentsEnabled: false,
    inFeed: false,
    accessTier: "public",
    priceAmount: null,
  };
}
