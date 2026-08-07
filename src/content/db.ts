import { eq, and, desc, asc, inArray, isNotNull } from "drizzle-orm";
import { page, contentView } from "./schema.js";
import { media } from "../media/schema.js";
import { getRawClient } from "../shared/db.js";
import { validateCustomQuery } from "./custom-view-sql.js";
import type { Database } from "../db/index.js";
import type {
  Page,
  PageSummary,
  NavItem,
  LinkTarget,
  PageKind,
  ContentView,
  ContentViewKind,
  ContentViewConfig,
  PostListViewConfig,
  CustomViewConfig,
  Media,
} from "./types.js";

// --- Row mappers ---

type PageRow = typeof page.$inferSelect;

function toPage(row: PageRow): Page {
  return {
    id: row.pageId,
    slug: row.slug,
    title: row.title,
    content: row.content,
    excerpt: row.excerpt,
    tags: row.tags,
    date: row.date,
    updated: row.updated ?? undefined,
    published: row.published,
    scripts: row.scripts ?? undefined,
    seo: row.seo ?? undefined,
    kind: row.kind as PageKind,
    nav:
      row.navLabel != null
        ? { label: row.navLabel, order: row.navOrder ?? 0 }
        : undefined,
    commentsEnabled: row.commentsEnabled ?? true,
    inFeed: row.inFeed ?? true,
    // Coerced rather than trusted: an unknown value must not become a tier the
    // gate does not recognise. Fails closed to "public" for storage; the gate
    // itself separately fails closed to a teaser.
    accessTier: normalizeAccessTier(row.accessTier),
    priceAmount: row.priceAmount ?? null,
  };
}

/**
 * Kept here rather than imported from `payments/` — `content/` must not depend
 * on `payments/`, and that one-way direction is what stops a page query from
 * gating itself. The two lists are tiny and both fail closed to "public".
 */
const KNOWN_ACCESS_TIERS = new Set(["public", "members", "paid"]);

function normalizeAccessTier(value: string | null | undefined): string {
  return value && KNOWN_ACCESS_TIERS.has(value) ? value : "public";
}

function toPageSummary(
  row: Pick<PageRow, "pageId" | "slug" | "title" | "excerpt" | "tags" | "date" | "accessTier" | "seo">
): PageSummary {
  return {
    id: row.pageId,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    tags: row.tags,
    date: row.date,
    accessTier: normalizeAccessTier(row.accessTier),
    // The social image doubles as the listing cover. A separate field would be
    // a second picture of the same post to keep in step, and authors already
    // set this one.
    coverImage: row.seo?.ogImage ?? undefined,
  };
}

function toNavItem(row: Pick<PageRow, "pageId" | "slug" | "kind" | "navLabel" | "navOrder">): NavItem {
  return {
    id: row.pageId,
    slug: row.slug,
    kind: row.kind as PageKind,
    label: row.navLabel as string,
    order: row.navOrder as number,
  };
}

function toLinkTarget(row: Pick<PageRow, "pageId" | "slug" | "kind" | "title">): LinkTarget {
  return {
    id: row.pageId,
    slug: row.slug,
    kind: row.kind as PageKind,
    title: row.title,
  };
}

function normalizePostListConfig(raw: unknown): PostListViewConfig {
  if (!raw || typeof raw !== "object") {
    return { order: "newest" };
  }

  const maybeConfig = raw as { order?: unknown; limit?: unknown };
  const order = maybeConfig.order === "newest" ? "newest" : "newest";
  const config: PostListViewConfig = { order };

  if (typeof maybeConfig.limit === "number" && Number.isFinite(maybeConfig.limit)) {
    const clamped = Math.max(1, Math.min(200, Math.floor(maybeConfig.limit)));
    config.limit = clamped;
  }

  return config;
}

function normalizeCustomConfig(raw: unknown): CustomViewConfig {
  if (!raw || typeof raw !== "object") {
    return { query: "", template: "" };
  }
  const maybeConfig = raw as { query?: unknown; template?: unknown };
  return {
    query: typeof maybeConfig.query === "string" ? maybeConfig.query : "",
    template: typeof maybeConfig.template === "string" ? maybeConfig.template : "",
  };
}

function normalizeViewConfig(kind: ContentViewKind, raw: unknown): ContentViewConfig {
  if (kind === "custom") return normalizeCustomConfig(raw);
  return normalizePostListConfig(raw);
}

type ContentViewRow = typeof contentView.$inferSelect;

function toContentView(row: ContentViewRow): ContentView {
  const kind = row.kind as ContentViewKind;
  return {
    id: row.contentViewId,
    slug: row.slug,
    title: row.title,
    kind,
    config: normalizeViewConfig(kind, row.config),
    published: row.published,
    updated: row.updated ?? undefined,
  };
}

// --- Page queries ---

// Note what is *not* here: `content`. Every listing projection stays free of
// the markdown body, which is why RSS and the newsletter cannot leak a paid
// post even by accident.
const pageSummaryCols = {
  pageId: page.pageId,
  slug: page.slug,
  title: page.title,
  excerpt: page.excerpt,
  tags: page.tags,
  date: page.date,
  accessTier: page.accessTier,
  seo: page.seo,
} as const;

/** List published posts, newest first (for the home page listing). */
export async function listPosts(db: Database, tenantId: string): Promise<PageSummary[]> {
  const rows = await db
    .select(pageSummaryCols)
    .from(page)
    .where(and(eq(page.published, true), eq(page.kind, "post"), eq(page.tenantId, tenantId)))
    .orderBy(desc(page.date));
  return rows.map(toPageSummary);
}

/** List published, in-feed posts for RSS generation (newest first, limit 50). */
export async function listFeedPosts(db: Database, tenantId: string): Promise<PageSummary[]> {
  const rows = await db
    .select(pageSummaryCols)
    .from(page)
    .where(and(
      eq(page.published, true),
      eq(page.kind, "post"),
      eq(page.tenantId, tenantId),
      eq(page.inFeed, true),
    ))
    .orderBy(desc(page.date))
    .limit(50);
  return rows.map(toPageSummary);
}

/** List posts for a post-list content view (newest first, optional limit). */
export async function listPostsForView(
  db: Database,
  tenantId: string,
  options: { limit?: number } = {}
): Promise<PageSummary[]> {
  const safeLimit =
    typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(1, Math.min(200, Math.floor(options.limit)))
      : undefined;

  const q = db
    .select(pageSummaryCols)
    .from(page)
    .where(and(eq(page.published, true), eq(page.kind, "post"), eq(page.tenantId, tenantId)))
    .orderBy(desc(page.date));

  const rows = safeLimit != null ? await q.limit(safeLimit) : await q;
  return rows.map(toPageSummary);
}

/**
 * How much a site has published, for the hero's meta line and the density
 * rules that go with it. Counted rather than derived from a listing: a listing
 * is capped by its view's `limit` and would under-report an archive.
 */
export async function getPostStats(
  db: Database,
  tenantId: string
): Promise<{ total: number; firstYear: number | null }> {
  const rows = await db
    .select({ date: page.date })
    .from(page)
    .where(and(eq(page.published, true), eq(page.kind, "post"), eq(page.tenantId, tenantId)))
    .orderBy(asc(page.date));

  const first = rows[0]?.date ? new Date(rows[0].date).getFullYear() : null;
  return {
    total: rows.length,
    firstYear: first != null && Number.isFinite(first) ? first : null,
  };
}

/** Fetch a single published page by slug and kind. */
export async function getPageBySlug(
  db: Database,
  slug: string,
  kind: PageKind,
  tenantId: string
): Promise<Page | null> {
  const rows = await db
    .select()
    .from(page)
    .where(
      and(eq(page.slug, slug), eq(page.kind, kind), eq(page.published, true), eq(page.tenantId, tenantId))
    )
    .limit(1);
  return rows.length > 0 ? toPage(rows[0]) : null;
}

// --- Content view queries ---

/** List all content views for a tenant (including drafts). */
export async function listContentViews(db: Database, tenantId: string): Promise<ContentView[]> {
  const rows = await db
    .select()
    .from(contentView)
    .where(eq(contentView.tenantId, tenantId))
    .orderBy(asc(contentView.title));
  return rows.map(toContentView);
}

/** A stored custom view whose query the table allowlist now rejects. */
export interface CustomViewIssue {
  id: string;
  slug: string;
  title: string;
  error: string;
}

/**
 * Find custom views that will no longer run, for the admin banner.
 *
 * Queries are never rewritten automatically — the author changes
 * `FROM page` to `FROM page_public` themselves. See `custom-view-sql.ts`.
 */
export async function auditCustomViews(
  db: Database,
  tenantId: string
): Promise<CustomViewIssue[]> {
  const views = await listContentViews(db, tenantId);
  const issues: CustomViewIssue[] = [];

  for (const view of views) {
    if (view.kind !== "custom") continue;
    const query = (view.config as CustomViewConfig).query;
    if (!query) continue;

    const error = validateCustomQuery(query);
    if (error) issues.push({ id: view.id, slug: view.slug, title: view.title, error });
  }

  return issues;
}

/** Fetch a single content view by slug. */
export async function getContentViewBySlug(
  db: Database,
  slug: string,
  tenantId: string,
  options: { publishedOnly?: boolean } = {}
): Promise<ContentView | null> {
  const conditions = [eq(contentView.slug, slug), eq(contentView.tenantId, tenantId)];
  if (options.publishedOnly) conditions.push(eq(contentView.published, true));

  const rows = await db
    .select()
    .from(contentView)
    .where(and(...conditions))
    .limit(1);
  return rows.length > 0 ? toContentView(rows[0]) : null;
}

/** Fetch a single content view by stable id. */
export async function getContentViewById(
  db: Database,
  id: string,
  tenantId: string
): Promise<ContentView | null> {
  const rows = await db
    .select()
    .from(contentView)
    .where(and(eq(contentView.contentViewId, id), eq(contentView.tenantId, tenantId)))
    .limit(1);
  return rows.length > 0 ? toContentView(rows[0]) : null;
}

/** Delete a content view by stable id. */
export async function deleteContentView(db: Database, id: string, tenantId: string): Promise<void> {
  await db
    .delete(contentView)
    .where(and(eq(contentView.contentViewId, id), eq(contentView.tenantId, tenantId)));
}

/** Create or update a content view, keyed by stable id + tenant. */
export async function upsertContentView(
  db: Database,
  view: ContentView,
  tenantId: string
): Promise<void> {
  const config = normalizeViewConfig(view.kind, view.config);
  await db
    .insert(contentView)
    .values({
      contentViewId: view.id,
      tenantId,
      slug: view.slug,
      title: view.title,
      kind: view.kind,
      config: config as unknown as Record<string, unknown>,
      published: view.published,
      updated: view.updated ?? null,
    })
    .onConflictDoUpdate({
      target: [contentView.contentViewId, contentView.tenantId],
      set: {
        slug: view.slug,
        title: view.title,
        kind: view.kind,
        config: config as unknown as Record<string, unknown>,
        published: view.published,
        updated: view.updated ?? null,
      },
    });
}

// --- Custom view query execution ---

// Validation lives in its own dependency-free module so the boot-time audit in
// shared/db.ts can reuse it without an import cycle. Re-exported here because
// this is where callers expect to find it.
export {
  validateCustomQuery,
  deniedQueryTables,
  CUSTOM_VIEW_ALLOWED_TABLES,
} from "./custom-view-sql.js";

/**
 * Execute a custom SQL query for a view.
 * Uses the raw libSQL client since user-defined queries use named parameters
 * (:tenant_id) which aren't supported by Drizzle's query builder.
 */
export async function executeCustomViewQuery(
  _db: Database,
  query: string,
  tenantId: string
): Promise<Record<string, unknown>[]> {
  const error = validateCustomQuery(query);
  if (error) throw new Error(`Invalid custom view query: ${error}`);

  const client = getRawClient();
  const result = await client.execute({
    sql: query,
    args: { tenant_id: tenantId },
  });

  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (const col of result.columns) {
      obj[col] = row[col];
    }
    return obj;
  });
}

/** Fetch the first published page of a given kind (used for home). */
export async function getPageByKind(
  db: Database,
  kind: PageKind,
  tenantId: string
): Promise<Page | null> {
  const rows = await db
    .select()
    .from(page)
    .where(and(eq(page.kind, kind), eq(page.published, true), eq(page.tenantId, tenantId)))
    .limit(1);
  return rows.length > 0 ? toPage(rows[0]) : null;
}

/** Fetch the first page of a given kind regardless of publish state (used to enforce a single home page). */
export async function findPageByKind(
  db: Database,
  kind: PageKind,
  tenantId: string
): Promise<Page | null> {
  const rows = await db
    .select()
    .from(page)
    .where(and(eq(page.kind, kind), eq(page.tenantId, tenantId)))
    .limit(1);
  return rows.length > 0 ? toPage(rows[0]) : null;
}

/** Fetch all published navigation items, ordered by nav.order. */
export async function getNavItems(db: Database, tenantId: string): Promise<NavItem[]> {
  const rows = await db
    .select({
      pageId: page.pageId,
      slug: page.slug,
      kind: page.kind,
      navLabel: page.navLabel,
      navOrder: page.navOrder,
    })
    .from(page)
    .where(
      and(
        eq(page.published, true),
        isNotNull(page.navLabel),
        eq(page.tenantId, tenantId)
      )
    )
    .orderBy(asc(page.navOrder));
  return rows.map(toNavItem);
}

/** Batch-resolve page IDs to their current slug, kind, and title (for [[id]] links). */
export async function resolvePageLinks(
  db: Database,
  ids: string[],
  tenantId: string
): Promise<LinkTarget[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      pageId: page.pageId,
      slug: page.slug,
      kind: page.kind,
      title: page.title,
    })
    .from(page)
    .where(and(inArray(page.pageId, ids), eq(page.published, true), eq(page.tenantId, tenantId)));
  return rows.map(toLinkTarget);
}

/** List ALL pages for a tenant (including drafts), ordered by kind then date. */
export async function listAllPages(db: Database, tenantId: string): Promise<Page[]> {
  const rows = await db
    .select()
    .from(page)
    .where(eq(page.tenantId, tenantId))
    .orderBy(asc(page.kind), desc(page.date));
  return rows.map(toPage);
}

/** Fetch a single page by its stable page_id (regardless of published status). */
export async function getPageById(
  db: Database,
  pageId: string,
  tenantId: string
): Promise<Page | null> {
  const rows = await db
    .select()
    .from(page)
    .where(and(eq(page.pageId, pageId), eq(page.tenantId, tenantId)))
    .limit(1);
  return rows.length > 0 ? toPage(rows[0]) : null;
}

/** Delete a page by its stable page_id. */
export async function deletePage(
  db: Database,
  pageId: string,
  tenantId: string
): Promise<void> {
  await db.delete(page).where(and(eq(page.pageId, pageId), eq(page.tenantId, tenantId)));
}

/** Create or update a page, keyed by its stable id + tenant. */
export async function upsertPage(
  db: Database,
  p: Page,
  tenantId: string
): Promise<void> {
  await db
    .insert(page)
    .values({
      pageId: p.id,
      tenantId,
      slug: p.slug,
      title: p.title,
      content: p.content,
      excerpt: p.excerpt,
      tags: p.tags,
      date: p.date,
      updated: p.updated ?? null,
      published: p.published,
      scripts: p.scripts ?? null,
      seo: p.seo ?? null,
      kind: p.kind,
      navLabel: p.nav?.label ?? null,
      navOrder: p.nav?.order ?? null,
      commentsEnabled: p.commentsEnabled,
      inFeed: p.inFeed,
      accessTier: normalizeAccessTier(p.accessTier),
      priceAmount: p.priceAmount ?? null,
    })
    .onConflictDoUpdate({
      target: [page.pageId, page.tenantId],
      set: {
        slug: p.slug,
        title: p.title,
        content: p.content,
        excerpt: p.excerpt,
        tags: p.tags,
        date: p.date,
        updated: p.updated ?? null,
        published: p.published,
        scripts: p.scripts ?? null,
        seo: p.seo ?? null,
        kind: p.kind,
        navLabel: p.nav?.label ?? null,
        navOrder: p.nav?.order ?? null,
        commentsEnabled: p.commentsEnabled,
        inFeed: p.inFeed,
        accessTier: normalizeAccessTier(p.accessTier),
        priceAmount: p.priceAmount ?? null,
      },
    });
}

// --- Media queries ---

type MediaRow = typeof media.$inferSelect;

function toMedia(row: MediaRow, urlFn: (key: string) => string): Media {
  return {
    id: row.mediaId,
    storageKey: row.storageKey,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    createdAt: row.createdAt,
    url: urlFn(row.storageKey),
  };
}

/** Insert a new media record. */
export async function insertMedia(
  db: Database,
  m: { id: string; storageKey: string; originalName: string; mimeType: string; size: number },
  tenantId: string
): Promise<void> {
  await db.insert(media).values({
    mediaId: m.id,
    tenantId,
    storageKey: m.storageKey,
    originalName: m.originalName,
    mimeType: m.mimeType,
    size: m.size,
  });
}

/** List all media for a tenant, newest first. */
export async function listMedia(
  db: Database,
  tenantId: string,
  urlFn: (key: string) => string
): Promise<Media[]> {
  const rows = await db
    .select()
    .from(media)
    .where(eq(media.tenantId, tenantId))
    .orderBy(desc(media.createdAt));
  return rows.map((row) => toMedia(row, urlFn));
}

/** Fetch a single media item by id. */
export async function getMediaById(
  db: Database,
  mediaId: string,
  tenantId: string,
  urlFn: (key: string) => string
): Promise<Media | null> {
  const rows = await db
    .select()
    .from(media)
    .where(and(eq(media.mediaId, mediaId), eq(media.tenantId, tenantId)))
    .limit(1);
  return rows.length > 0 ? toMedia(rows[0], urlFn) : null;
}

/** Delete a media record by id. */
export async function deleteMediaRecord(
  db: Database,
  mediaId: string,
  tenantId: string
): Promise<void> {
  await db.delete(media).where(and(eq(media.mediaId, mediaId), eq(media.tenantId, tenantId)));
}
