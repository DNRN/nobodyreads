import { Hono } from "hono";
import type { Database } from "../db/index.js";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import { escapeHtml } from "../shared/http.js";
import { resolveSiteUrl } from "../shared/site-url.js";
import {
  getSiteSettings,
  resolveSiteDiscovery,
} from "../shared/site-settings.js";
import { listSitemapEntries } from "./db.js";

export interface DiscoveryOptions {
  db: Database;
  tenantId?: string;
  /**
   * Absolute origin the sitemap and the `Sitemap:` line are built from.
   * Defaults to `SITE_URL`; hosts serving several sites must pass it per site.
   */
  siteUrl?: string;
  /** Path prefix when the site is mounted under one. Defaults to the root. */
  urlPrefix?: string;
}

/**
 * Crawlers that train generative models, blocked as a group when the owner
 * opts out of AI training.
 *
 * Deliberately excludes search crawlers that merely *display* results — the
 * two choices are separate, and folding them together would quietly cost the
 * owner their search traffic when they only meant to opt out of training.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "PerplexityBot",
  "Applebot-Extended",
  "Bytespider",
  "meta-externalagent",
  "Diffbot",
  "Omgilibot",
];

/**
 * Build the generated robots.txt for a site.
 *
 * Exported so a host can render the same text elsewhere (a preview, a settings
 * page) without standing up the route.
 */
export function buildRobotsTxt(options: {
  searchIndexing: boolean;
  aiTraining: boolean;
  sitemapUrl?: string;
}): string {
  const blocks: string[] = [];

  blocks.push(
    options.searchIndexing
      ? "User-agent: *\nAllow: /"
      : "User-agent: *\nDisallow: /",
  );

  if (!options.aiTraining) {
    blocks.push(
      AI_CRAWLERS.map((agent) => `User-agent: ${agent}`).join("\n") +
        "\nDisallow: /",
    );
  }

  // Advertise the sitemap only when the site is indexable — pointing a crawler
  // at a list of URLs it has just been told to ignore is noise at best.
  if (options.sitemapUrl && options.searchIndexing) {
    blocks.push(`Sitemap: ${options.sitemapUrl}`);
  }

  return `${blocks.join("\n\n")}\n`;
}

/**
 * `GET /robots.txt` for a single site, honouring the owner's discoverability
 * settings.
 *
 * A verbatim override always wins: an owner who has written their own file
 * knows what they want, and silently merging generated directives into it would
 * make the result impossible to reason about.
 *
 * Mount at the site root. Note that robots.txt must be *served* by the host it
 * governs — redirecting one to a shared location is ignored by most crawlers.
 */
export function createRobotsRoutes(options: DiscoveryOptions): Hono {
  const { db } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const urlPrefix = options.urlPrefix ?? "";

  const app = new Hono();

  app.get("/robots.txt", async (c) => {
    const siteUrl = resolveSiteUrl(options.siteUrl);
    const settings = await getSiteSettings(db, tenantId);
    const discovery = resolveSiteDiscovery(settings);

    const body =
      discovery.robotsTxt ??
      buildRobotsTxt({
        searchIndexing: discovery.searchIndexing,
        aiTraining: discovery.aiTraining,
        sitemapUrl: `${siteUrl}${urlPrefix}/sitemap.xml`,
      });

    c.header("Content-Type", "text/plain; charset=utf-8");
    c.header("Cache-Control", "public, max-age=3600");
    return c.body(body.endsWith("\n") ? body : `${body}\n`);
  });

  return app;
}

/**
 * `GET /sitemap.xml` for a single site: the home page plus every published
 * page and post.
 *
 * Ships alongside robots.txt rather than separately because the two are one
 * feature — a `Sitemap:` line pointing at a 404 is worse than no line at all.
 */
export function createSitemapRoutes(options: DiscoveryOptions): Hono {
  const { db } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const urlPrefix = options.urlPrefix ?? "";

  const app = new Hono();

  app.get("/sitemap.xml", async (c) => {
    const siteUrl = resolveSiteUrl(options.siteUrl);
    const base = `${siteUrl}${urlPrefix}`;

    const settings = await getSiteSettings(db, tenantId);
    const discovery = resolveSiteDiscovery(settings);
    // An owner who has switched indexing off should not have a machine-readable
    // index of their site sitting there for anything that ignores robots.txt.
    if (!discovery.searchIndexing) return c.notFound();

    const entries = await listSitemapEntries(db, tenantId);

    const urls = [
      `  <url><loc>${escapeHtml(base || "/")}/</loc></url>`,
      ...entries.map((entry) => {
        const path =
          entry.kind === "home"
            ? ""
            : entry.kind === "post"
              ? `/posts/${entry.slug}`
              : `/${entry.slug}`;
        // The home page is already emitted above; skip its duplicate entry.
        if (path === "") return null;
        const lastmod = entry.lastmod
          ? `<lastmod>${escapeHtml(entry.lastmod)}</lastmod>`
          : "";
        return `  <url><loc>${escapeHtml(`${base}${path}`)}</loc>${lastmod}</url>`;
      }),
    ].filter(Boolean);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;

    c.header("Content-Type", "application/xml; charset=utf-8");
    c.header("Cache-Control", "public, max-age=3600");
    return c.body(xml);
  });

  return app;
}
