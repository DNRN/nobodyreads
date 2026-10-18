import { Hono } from "hono";
import type { Database } from "../db/index.js";
import type { PodcastEpisode } from "./types.js";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import { listPodcastEpisodes } from "./db.js";
import { toRfc822 } from "./feed.js";
import { escapeHtml } from "../shared/http.js";
import { resolveSiteUrl, resolveSiteName } from "../shared/site-url.js";
import {
  getSiteSettings,
  resolveMediaValue,
  resolvePodcastSettings,
} from "../shared/site-settings.js";
import { createMediaStorage } from "../media/storage.js";

export interface PodcastFeedOptions {
  db: Database;
  tenantId?: string;
  urlPrefix?: string;
  /**
   * Absolute origin for every link in the feed, e.g. `https://example.com`.
   * Defaults to `SITE_URL`. Multi-site hosts must pass it per site; a podcast
   * feed is nothing but absolute URLs.
   */
  siteUrl?: string;
  siteName?: string;
  siteTagline?: string;
}

/** A media URL as a podcatcher needs it: absolute, whatever storage returned. */
function absolute(url: string, siteUrl: string): string {
  return /^https?:\/\//i.test(url) ? url : `${siteUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

function itemXml(
  ep: PodcastEpisode,
  link: string,
  enclosureUrl: string,
): string {
  const description = ep.excerpt
    ? `\n      <description>${escapeHtml(ep.excerpt)}</description>`
    : "";
  const numbers = [
    ep.season !== null ? `\n      <itunes:season>${ep.season}</itunes:season>` : "",
    ep.number !== null ? `\n      <itunes:episode>${ep.number}</itunes:episode>` : "",
  ].join("");
  return `    <item>
      <title>${escapeHtml(ep.title)}</title>
      <link>${escapeHtml(link)}</link>
      <guid isPermaLink="false">${escapeHtml(ep.id)}</guid>
      <pubDate>${toRfc822(ep.date)}</pubDate>${description}
      <enclosure url="${escapeHtml(enclosureUrl)}" length="${ep.audio.size}" type="${escapeHtml(ep.audio.mimeType)}"/>
      <itunes:duration>${ep.audio.durationSeconds}</itunes:duration>
      <itunes:episodeType>full</itunes:episodeType>${numbers}
    </item>`;
}

/**
 * A directory-ready podcast feed (Apple Podcasts / Spotify / any podcatcher) of
 * the site's public episodes. Mount at /podcast.xml beside /feed.xml, which
 * stays the text feed: directories reject a feed whose items lack audio, so the
 * two cannot be one.
 *
 * - **404 until the first public episode exists.** Directories reject an empty
 *   channel, and a 404 stops a show being submitted before it has anything.
 * - **GUIDs are page ids**, not URLs: a renamed slug must not make every
 *   podcatcher list the episode twice.
 * - **Item order is publish date.** Apps order episodes by `pubDate` or by the
 *   `itunes:episode` / `itunes:season` numbers emitted here, not by position.
 * - Which episodes appear is decided entirely by `listPodcastEpisodes`.
 */
export function createPodcastFeedRoutes(options: PodcastFeedOptions): Hono {
  const { db } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const urlPrefix = options.urlPrefix ?? "";
  const siteUrl = resolveSiteUrl(options.siteUrl);
  const siteName = resolveSiteName(options.siteName);
  const siteTagline = options.siteTagline ?? "";

  const app = new Hono();

  app.get("/podcast.xml", async (c) => {
    const episodes = await listPodcastEpisodes(db, tenantId);
    if (episodes.length === 0) return c.text("This site has no public episodes yet.", 404);

    const show = resolvePodcastSettings(await getSiteSettings(db, tenantId));
    const storage = createMediaStorage();
    const mediaUrl = (key: string) => absolute(storage.url(key), siteUrl);

    const channelUrl = `${siteUrl}${urlPrefix}`;
    const feedUrl = `${channelUrl}/podcast.xml`;
    const author = show.author ?? siteName;
    const artwork = resolveMediaValue(show.artwork, mediaUrl);

    const items = episodes
      .map((ep) =>
        itemXml(ep, `${channelUrl}/posts/${ep.slug}`, mediaUrl(ep.audio.storageKey)),
      )
      .join("\n");

    const owner = show.ownerEmail
      ? `
    <itunes:owner>
      <itunes:name>${escapeHtml(author)}</itunes:name>
      <itunes:email>${escapeHtml(show.ownerEmail)}</itunes:email>
    </itunes:owner>`
      : "";
    const image = artwork
      ? `
    <itunes:image href="${escapeHtml(absolute(artwork, siteUrl))}"/>`
      : "";

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(siteName)}</title>
    <link>${escapeHtml(channelUrl)}</link>
    <description>${escapeHtml(siteTagline || siteName)}</description>
    <atom:link href="${escapeHtml(feedUrl)}" rel="self" type="application/rss+xml"/>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <itunes:author>${escapeHtml(author)}</itunes:author>${owner}${image}
    <itunes:category text="${escapeHtml(show.category)}"/>
    <itunes:explicit>${show.explicit ? "true" : "false"}</itunes:explicit>
    <itunes:type>episodic</itunes:type>
${items}
  </channel>
</rss>`;

    c.header("Content-Type", "application/rss+xml; charset=utf-8");
    c.header("Cache-Control", "public, max-age=1800");
    return c.body(xml);
  });

  return app;
}
