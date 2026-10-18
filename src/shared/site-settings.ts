import { eq, and } from "drizzle-orm";

import { siteSettings } from "./schema.js";
import type { Database } from "../db/index.js";

// --- Site identity settings ---

export const SETTING_SITE_NAME = "site_name";
export const SETTING_SITE_TAGLINE = "site_tagline";
export const SETTING_SITE_LOGO = "site_logo";
export const SETTING_SITE_FAVICON = "site_favicon";
export const SETTING_SITE_OG_IMAGE = "site_og_image";

export type SiteIdentityFieldType = "text" | "html" | "url" | "image";

export interface SiteIdentityField {
  /** Storage key in the `site_settings` table. */
  key: string;
  /** HTML form field name used by the editor + save route. */
  formName: string;
  label: string;
  type: SiteIdentityFieldType;
  hint?: string;
  /** Env var consulted as a fallback when the setting is unset. */
  envFallback?: string;
  /** Static default used when neither the setting nor the env var is set. */
  defaultValue?: string;
}

/**
 * Declarative registry of editable site-identity fields. Drives the admin
 * editor UI, the save route, and value resolution. Add a field here to expose
 * a new editable detail end-to-end.
 */
export const SITE_IDENTITY_FIELDS: SiteIdentityField[] = [
  {
    key: SETTING_SITE_NAME,
    formName: "site:name",
    label: "Site name",
    type: "text",
    envFallback: "SITE_NAME",
    hint: "Shown in the header and used as the Open Graph site name.",
  },
  {
    key: SETTING_SITE_TAGLINE,
    formName: "site:tagline",
    label: "Tagline",
    type: "text",
    envFallback: "SITE_TAGLINE",
    hint: "Rendered via {{siteTagline}} in your theme.",
  },
  {
    key: SETTING_SITE_LOGO,
    formName: "site:logo",
    label: "Logo",
    type: "image",
    hint: "Rendered via {{siteLogo}} / {{siteBranding}}. Falls back to the site name when unset.",
  },
  {
    key: SETTING_SITE_FAVICON,
    formName: "site:favicon",
    label: "Favicon",
    type: "image",
    hint: "Shown in the browser tab. PNG, SVG or ICO recommended.",
  },
  {
    key: SETTING_SITE_OG_IMAGE,
    formName: "site:og_image",
    label: "Default social image",
    type: "image",
    hint: "Used for social link previews when a page has no image of its own.",
  },
];

// --- Discoverability settings ---

export const SETTING_SEARCH_INDEXING = "search_indexing";
export const SETTING_AI_TRAINING = "ai_training";
export const SETTING_ROBOTS_TXT = "robots_txt";

export interface SiteDiscoveryField {
  key: string;
  formName: string;
  label: string;
  type: "toggle" | "textarea";
  hint?: string;
  /** Value stored when the toggle is on. Absent setting means the default. */
  defaultOn?: boolean;
}

/**
 * Editable settings that control how crawlers treat the site.
 *
 * Kept separate from {@link SITE_IDENTITY_FIELDS} on purpose: that registry
 * drives the "Site identity" form, which is about how the site presents itself.
 * How it is *indexed* is a different decision, made at a different time, and
 * mixing the two would put "block all search engines" one slip away from
 * editing a tagline.
 */
export const SITE_DISCOVERY_FIELDS: SiteDiscoveryField[] = [
  {
    key: SETTING_SEARCH_INDEXING,
    formName: "discovery:search_indexing",
    label: "Allow search engines to index this site",
    type: "toggle",
    defaultOn: true,
    hint: "Turning this off asks crawlers to leave the whole site out of search results.",
  },
  {
    key: SETTING_AI_TRAINING,
    formName: "discovery:ai_training",
    label: "Allow AI crawlers to use this site for training",
    type: "toggle",
    defaultOn: true,
    hint: "Blocks GPTBot, ClaudeBot, CCBot, Google-Extended and friends site-wide.",
  },
  {
    key: SETTING_ROBOTS_TXT,
    formName: "discovery:robots_txt",
    label: "Custom robots.txt",
    type: "textarea",
    hint: "Replaces the generated file entirely. Leave empty to keep the generated one.",
  },
];

export interface ResolvedSiteDiscovery {
  searchIndexing: boolean;
  aiTraining: boolean;
  /** Verbatim robots.txt supplied by the owner, or null to generate one. */
  robotsTxt: string | null;
}

/**
 * Resolve discoverability settings. Both toggles default to *allowed*: a site
 * nobody can find is a surprising default, and the owner has to opt into being
 * invisible.
 */
export function resolveSiteDiscovery(
  settings: Record<string, string>,
): ResolvedSiteDiscovery {
  const flag = (key: string) => settings[key] !== "off";
  const robots = settings[SETTING_ROBOTS_TXT]?.trim();
  return {
    searchIndexing: flag(SETTING_SEARCH_INDEXING),
    aiTraining: flag(SETTING_AI_TRAINING),
    robotsTxt: robots ? robots : null,
  };
}

// --- Podcast settings ---

export const SETTING_PODCAST_ARTWORK = "podcast_artwork";
export const SETTING_PODCAST_AUTHOR = "podcast_author";
export const SETTING_PODCAST_OWNER_EMAIL = "podcast_owner_email";
export const SETTING_PODCAST_CATEGORY = "podcast_category";
export const SETTING_PODCAST_EXPLICIT = "podcast_explicit";

/**
 * Apple Podcasts' top-level categories — the values directories accept in
 * `<itunes:category text="…">`, spelled exactly. Subcategories are optional
 * and left out; a show is listed fine under its top-level category.
 */
export const PODCAST_CATEGORIES = [
  "Arts", "Business", "Comedy", "Education", "Fiction", "Government", "Health & Fitness",
  "History", "Kids & Family", "Leisure", "Music", "News", "Religion & Spirituality",
  "Science", "Society & Culture", "Sports", "Technology", "True Crime", "TV & Film",
] as const;

export const DEFAULT_PODCAST_CATEGORY = "Society & Culture";

export interface SitePodcastField {
  key: string;
  formName: string;
  label: string;
  type: "text" | "email" | "url" | "category" | "toggle";
  hint?: string;
}

/**
 * What a podcast directory needs to know about the show as a whole. Kept apart
 * from the identity fields because these are published *into the feed* — the
 * owner email especially — and the hints say so where they are edited.
 */
export const SITE_PODCAST_FIELDS: SitePodcastField[] = [
  {
    key: SETTING_PODCAST_ARTWORK,
    formName: "podcast:artwork",
    label: "Cover art",
    type: "url",
    hint: "Square JPG or PNG, 1400–3000 px. Apple and Spotify will not list a show without it.",
  },
  {
    key: SETTING_PODCAST_AUTHOR,
    formName: "podcast:author",
    label: "Author",
    type: "text",
    hint: "Shown under the show's name in podcast apps. Defaults to the site name.",
  },
  {
    key: SETTING_PODCAST_OWNER_EMAIL,
    formName: "podcast:owner_email",
    label: "Owner email",
    type: "email",
    hint: "Directories email this address to confirm the show is yours. It is published in the feed.",
  },
  {
    key: SETTING_PODCAST_CATEGORY,
    formName: "podcast:category",
    label: "Category",
    type: "category",
  },
  {
    key: SETTING_PODCAST_EXPLICIT,
    formName: "podcast:explicit",
    label: "Contains explicit content",
    type: "toggle",
    hint: "Directories hide explicit shows from some listeners. Off unless you say so.",
  },
];

export interface ResolvedPodcastSettings {
  /** Stored value (media key or URL); resolve with {@link resolveMediaValue}. */
  artwork: string | null;
  author: string | null;
  ownerEmail: string | null;
  category: string;
  explicit: boolean;
}

/**
 * Resolve the show's settings. An unknown category falls back to the default
 * rather than reaching the feed: directories reject a category they do not
 * recognise, and a stored value outlives the list it was chosen from.
 */
export function resolvePodcastSettings(settings: Record<string, string>): ResolvedPodcastSettings {
  const text = (key: string) => settings[key]?.trim() || null;
  const category = text(SETTING_PODCAST_CATEGORY);
  return {
    artwork: text(SETTING_PODCAST_ARTWORK),
    author: text(SETTING_PODCAST_AUTHOR),
    ownerEmail: text(SETTING_PODCAST_OWNER_EMAIL),
    category:
      category && PODCAST_CATEGORIES.some((c) => c === category) ? category : DEFAULT_PODCAST_CATEGORY,
    explicit: settings[SETTING_PODCAST_EXPLICIT] === "on",
  };
}

/**
 * Resolve a stored media value to a usable URL. Values may be a media storage
 * key (resolved via `urlFn`), an absolute URL, or a root-relative path; empty
 * values resolve to `null`.
 */
export function resolveMediaValue(
  value: string | null | undefined,
  urlFn: (key: string) => string,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) return trimmed;
  return urlFn(trimmed);
}

export interface ResolvedSiteIdentity {
  siteName: string;
  siteTagline: string;
  /** Raw stored value for the logo (media key / URL), or null. */
  logo: string | null;
  /** Raw stored value for the favicon (media key / URL), or null. */
  favicon: string | null;
  /** Raw stored value for the default social image (media key / URL), or null. */
  ogImage: string | null;
}

/**
 * Resolve site-identity values for a tenant, applying env-var and static
 * fallbacks. Image fields are returned as raw stored values; resolve them to
 * URLs with {@link resolveMediaValue}.
 */
export function resolveSiteIdentity(
  settings: Record<string, string>,
  defaults: { siteName: string; siteTagline: string },
): ResolvedSiteIdentity {
  return {
    siteName:
      settings[SETTING_SITE_NAME] ||
      process.env.SITE_NAME ||
      defaults.siteName,
    siteTagline:
      settings[SETTING_SITE_TAGLINE] ||
      process.env.SITE_TAGLINE ||
      defaults.siteTagline,
    logo: settings[SETTING_SITE_LOGO] || null,
    favicon: settings[SETTING_SITE_FAVICON] || null,
    ogImage: settings[SETTING_SITE_OG_IMAGE] || null,
  };
}

/**
 * The site's name, as the site itself will render it.
 *
 * Brand wins over the environment. `SITE_NAME` seeds a fresh install and is a
 * perfectly good default, but once an owner has named their site in Design →
 * Brand that is the answer — an env var that outranked them would make the
 * field look editable while changing nothing.
 *
 * Public pages resolve through this rather than reading `process.env` and
 * passing the result to `SiteLayout` as `options.siteName`: that override beats
 * the layout's own resolution, which is how the two came to disagree.
 *
 * `fallback` is the last resort only, for a site with neither a setting nor the
 * env var. A multi-tenant host names each site itself and should pass its own.
 */
export async function resolveSiteName(
  db: Database,
  tenantId: string,
  fallback = "nobodyreads.me",
): Promise<string> {
  const settings = await getSiteSettings(db, tenantId);
  return resolveSiteIdentity(settings, { siteName: fallback, siteTagline: "" })
    .siteName;
}

export async function getSiteSettings(
  db: Database,
  tenantId: string,
): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.tenantId, tenantId));

  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export async function getSiteSetting(
  db: Database,
  tenantId: string,
  key: string,
): Promise<string | null> {
  const rows = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(
      and(eq(siteSettings.tenantId, tenantId), eq(siteSettings.key, key)),
    )
    .limit(1);

  return rows.length > 0 ? rows[0].value : null;
}

export async function setSiteSetting(
  db: Database,
  tenantId: string,
  key: string,
  value: string,
): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ tenantId, key, value })
    .onConflictDoUpdate({
      target: [siteSettings.tenantId, siteSettings.key],
      set: { value },
    });
}

export async function deleteSiteSetting(
  db: Database,
  tenantId: string,
  key: string,
): Promise<void> {
  await db
    .delete(siteSettings)
    .where(
      and(eq(siteSettings.tenantId, tenantId), eq(siteSettings.key, key)),
    );
}
