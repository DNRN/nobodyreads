import { Hono } from "hono";
import type { Database } from "../db/index.js";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import { listFeedPosts } from "./db.js";
import { escapeHtml } from "../shared/http.js";
import { resolveSiteUrl, resolveSiteName } from "../shared/site-url.js";

export interface FeedOptions {
  db: Database;
  tenantId?: string;
  urlPrefix?: string;
  /**
   * Absolute origin for the channel and item links, e.g. `https://example.com`.
   * Defaults to `SITE_URL`. Hosts serving several sites must pass it per site —
   * a feed is nothing but absolute URLs, so getting this wrong points every
   * subscriber at the wrong place.
   */
  siteUrl?: string;
  siteName?: string;
  siteTagline?: string;
}

/** Convert an ISO date string (YYYY-MM-DD) to RFC 822 format for RSS pubDate. */
function toRfc822(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

/**
 * RSS 2.0 feed for a blog's published posts. Mount at /feed.xml (or under urlPrefix).
 *
 * The feed is safe from paid-content leaks **structurally**, not by a check:
 * `listFeedPosts` projects `PageSummary`, which has no `content` field at all,
 * so there is no body here to leak. Do not "fix" this by loading full pages.
 *
 * The one thing gating adds is honesty: a gated item says so, rather than
 * looking like a full post whose text simply didn't come through. Phase 10's
 * directory inherits that contract.
 */
export function createFeedRoutes(options: FeedOptions): Hono {
  const { db } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const urlPrefix = options.urlPrefix ?? "";
  const siteUrl = resolveSiteUrl(options.siteUrl);
  const siteName = resolveSiteName(options.siteName);
  const siteTagline = options.siteTagline ?? "";

  const app = new Hono();

  app.get("/feed.xml", async (c) => {
    const posts = await listFeedPosts(db, tenantId);

    const channelUrl = `${siteUrl}${urlPrefix}`;
    const feedUrl = `${channelUrl}/feed.xml`;

    const items = posts
      .map((p) => {
        const link = `${siteUrl}${urlPrefix}/posts/${p.slug}`;
        const teaserNote =
          p.accessTier !== "public" ? `\n\nRead the full post → ${link}` : "";
        const descriptionText = `${p.excerpt}${teaserNote}`.trim();
        const description = descriptionText
          ? `<description>${escapeHtml(descriptionText)}</description>`
          : "";
        const tags = p.tags.map((t) => `<category>${escapeHtml(t)}</category>`).join("");
        return `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${escapeHtml(link)}</link>
      <guid isPermaLink="true">${escapeHtml(link)}</guid>
      <pubDate>${toRfc822(p.date)}</pubDate>
      ${description}
      ${tags}
    </item>`;
      })
      .join("\n");

    const titleAtom = siteTagline
      ? `${siteName} — ${siteTagline}`
      : siteName;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(titleAtom)}</title>
    <link>${escapeHtml(channelUrl)}</link>
    <description>${escapeHtml(siteTagline || siteName)}</description>
    <atom:link href="${escapeHtml(feedUrl)}" rel="self" type="application/rss+xml"/>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

    c.header("Content-Type", "application/rss+xml; charset=utf-8");
    c.header("Cache-Control", "public, max-age=1800");
    return c.body(xml);
  });

  return app;
}
