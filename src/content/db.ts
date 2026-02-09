import type { Client, Row } from "@libsql/client";
import type { Page, PageSummary, NavItem, LinkTarget, PageKind } from "./types.js";

// --- Row mappers ---

function rowToPage(row: Row): Page {
  return {
    id: row.page_id as string,
    slug: row.slug as string,
    title: row.title as string,
    content: row.content as string,
    excerpt: row.excerpt as string,
    tags: JSON.parse((row.tags as string) || "[]"),
    date: row.date as string,
    updated: row.updated ? (row.updated as string) : undefined,
    published: (row.published as number) === 1,
    scripts: row.scripts ? JSON.parse(row.scripts as string) : undefined,
    seo: row.seo ? JSON.parse(row.seo as string) : undefined,
    kind: row.kind as PageKind,
    nav:
      row.nav_label != null
        ? { label: row.nav_label as string, order: row.nav_order as number }
        : undefined,
  };
}

function rowToPageSummary(row: Row): PageSummary {
  return {
    id: row.page_id as string,
    slug: row.slug as string,
    title: row.title as string,
    excerpt: row.excerpt as string,
    tags: JSON.parse((row.tags as string) || "[]"),
    date: row.date as string,
  };
}

function rowToNavItem(row: Row): NavItem {
  return {
    id: row.page_id as string,
    slug: row.slug as string,
    kind: row.kind as PageKind,
    label: row.nav_label as string,
    order: row.nav_order as number,
  };
}

function rowToLinkTarget(row: Row): LinkTarget {
  return {
    id: row.page_id as string,
    slug: row.slug as string,
    kind: row.kind as PageKind,
    title: row.title as string,
  };
}

// --- Page queries ---

/** List published posts, newest first (for the home page listing). */
export async function listPosts(db: Client, tenantId: string): Promise<PageSummary[]> {
  const result = await db.execute({
    sql: `SELECT page_id, slug, title, excerpt, tags, date
          FROM page
          WHERE published = 1 AND kind = 'post' AND tenant_id = ?
          ORDER BY date DESC`,
    args: [tenantId],
  });
  return result.rows.map(rowToPageSummary);
}

/** Fetch a single published page by slug and kind. */
export async function getPageBySlug(
  db: Client,
  slug: string,
  kind: PageKind,
  tenantId: string
): Promise<Page | null> {
  const result = await db.execute({
    sql: `SELECT page_id, slug, title, content, excerpt, tags, date, updated,
                 published, scripts, seo, kind, nav_label, nav_order
          FROM page
          WHERE slug = ? AND kind = ? AND published = 1 AND tenant_id = ?
          LIMIT 1`,
    args: [slug, kind, tenantId],
  });
  return result.rows.length > 0 ? rowToPage(result.rows[0]) : null;
}

/** Fetch the first published page of a given kind (used for home). */
export async function getPageByKind(
  db: Client,
  kind: PageKind,
  tenantId: string
): Promise<Page | null> {
  const result = await db.execute({
    sql: `SELECT page_id, slug, title, content, excerpt, tags, date, updated,
                 published, scripts, seo, kind, nav_label, nav_order
          FROM page
          WHERE kind = ? AND published = 1 AND tenant_id = ?
          LIMIT 1`,
    args: [kind, tenantId],
  });
  return result.rows.length > 0 ? rowToPage(result.rows[0]) : null;
}

/** Fetch all published navigation items, ordered by nav.order. */
export async function getNavItems(db: Client, tenantId: string): Promise<NavItem[]> {
  const result = await db.execute({
    sql: `SELECT page_id, slug, kind, nav_label, nav_order
          FROM page
          WHERE published = 1 AND nav_label IS NOT NULL AND tenant_id = ?
          ORDER BY nav_order ASC`,
    args: [tenantId],
  });
  return result.rows.map(rowToNavItem);
}

/** Batch-resolve page IDs to their current slug, kind, and title (for [[id]] links). */
export async function resolvePageLinks(
  db: Client,
  ids: string[],
  tenantId: string
): Promise<LinkTarget[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const result = await db.execute({
    sql: `SELECT page_id, slug, kind, title
          FROM page
          WHERE page_id IN (${placeholders}) AND published = 1 AND tenant_id = ?`,
    args: [...ids, tenantId],
  });
  return result.rows.map(rowToLinkTarget);
}

/** List ALL pages for a tenant (including drafts), ordered by kind then date. */
export async function listAllPages(db: Client, tenantId: string): Promise<Page[]> {
  const result = await db.execute({
    sql: `SELECT page_id, slug, title, content, excerpt, tags, date, updated,
                 published, scripts, seo, kind, nav_label, nav_order
          FROM page
          WHERE tenant_id = ?
          ORDER BY kind ASC, date DESC`,
    args: [tenantId],
  });
  return result.rows.map(rowToPage);
}

/** Fetch a single page by its stable page_id (regardless of published status). */
export async function getPageById(
  db: Client,
  pageId: string,
  tenantId: string
): Promise<Page | null> {
  const result = await db.execute({
    sql: `SELECT page_id, slug, title, content, excerpt, tags, date, updated,
                 published, scripts, seo, kind, nav_label, nav_order
          FROM page
          WHERE page_id = ? AND tenant_id = ?
          LIMIT 1`,
    args: [pageId, tenantId],
  });
  return result.rows.length > 0 ? rowToPage(result.rows[0]) : null;
}

/** Delete a page by its stable page_id. */
export async function deletePage(
  db: Client,
  pageId: string,
  tenantId: string
): Promise<void> {
  await db.execute({
    sql: `DELETE FROM page WHERE page_id = ? AND tenant_id = ?`,
    args: [pageId, tenantId],
  });
}

/** Create or update a page, keyed by its stable id + tenant. */
export async function upsertPage(
  db: Client,
  page: Page,
  tenantId: string
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO page (page_id, tenant_id, slug, title, content, excerpt, tags, date, updated, published, scripts, seo, kind, nav_label, nav_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (page_id, tenant_id) DO UPDATE SET
            slug = excluded.slug,
            title = excluded.title,
            content = excluded.content,
            excerpt = excluded.excerpt,
            tags = excluded.tags,
            date = excluded.date,
            updated = excluded.updated,
            published = excluded.published,
            scripts = excluded.scripts,
            seo = excluded.seo,
            kind = excluded.kind,
            nav_label = excluded.nav_label,
            nav_order = excluded.nav_order`,
    args: [
      page.id,
      tenantId,
      page.slug,
      page.title,
      page.content,
      page.excerpt,
      JSON.stringify(page.tags),
      page.date,
      page.updated ?? null,
      page.published ? 1 : 0,
      page.scripts ? JSON.stringify(page.scripts) : null,
      page.seo ? JSON.stringify(page.seo) : null,
      page.kind,
      page.nav?.label ?? null,
      page.nav?.order ?? null,
    ],
  });
}
