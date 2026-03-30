import { eq, and, desc } from "drizzle-orm";
import { siteBundle, siteBundleRevision } from "../db/schema.js";
import { getRawClient } from "./db.js";
import type { Database } from "../db/index.js";

export interface SiteBundle {
  html: string;
  css: string;
  js: string;
  ts: string;
  updatedAt: string;
}

export interface SiteBundleRevision extends SiteBundle {
  revisionId: number;
  createdAt: string;
}

// --- Row mappers ---

type RevisionRow = typeof siteBundleRevision.$inferSelect;

function toRevision(row: RevisionRow): SiteBundleRevision {
  return {
    revisionId: row.revisionId,
    html: row.html,
    css: row.css,
    js: row.js,
    ts: row.ts,
    updatedAt: row.createdAt,
    createdAt: row.createdAt,
  };
}

function toRevisionBundle(row: Pick<RevisionRow, "html" | "css" | "js" | "ts" | "createdAt">): SiteBundle {
  return {
    html: row.html,
    css: row.css,
    js: row.js,
    ts: row.ts,
    updatedAt: row.createdAt,
  };
}

export async function getLatestSiteBundleRevision(
  db: Database,
  tenantId: string
): Promise<SiteBundle | null> {
  const rows = await db
    .select({
      html: siteBundleRevision.html,
      css: siteBundleRevision.css,
      js: siteBundleRevision.js,
      ts: siteBundleRevision.ts,
      createdAt: siteBundleRevision.createdAt,
    })
    .from(siteBundleRevision)
    .where(eq(siteBundleRevision.tenantId, tenantId))
    .orderBy(desc(siteBundleRevision.revisionId))
    .limit(1);

  return rows.length > 0 ? toRevisionBundle(rows[0]) : null;
}

export async function getLatestSiteBundleRevisionId(
  db: Database,
  tenantId: string
): Promise<number | null> {
  const rows = await db
    .select({ revisionId: siteBundleRevision.revisionId })
    .from(siteBundleRevision)
    .where(eq(siteBundleRevision.tenantId, tenantId))
    .orderBy(desc(siteBundleRevision.revisionId))
    .limit(1);

  return rows.length > 0 ? rows[0].revisionId : null;
}

export async function getSiteBundle(
  db: Database,
  tenantId: string
): Promise<SiteBundle | null> {
  const current = await db
    .select({
      currentRevisionId: siteBundle.currentRevisionId,
      html: siteBundle.html,
      css: siteBundle.css,
      js: siteBundle.js,
      ts: siteBundle.ts,
      updatedAt: siteBundle.updatedAt,
    })
    .from(siteBundle)
    .where(eq(siteBundle.tenantId, tenantId))
    .limit(1);

  if (current.length > 0) {
    const row = current[0];

    if (row.currentRevisionId != null) {
      const revisions = await db
        .select({
          html: siteBundleRevision.html,
          css: siteBundleRevision.css,
          js: siteBundleRevision.js,
          ts: siteBundleRevision.ts,
          createdAt: siteBundleRevision.createdAt,
        })
        .from(siteBundleRevision)
        .where(
          and(
            eq(siteBundleRevision.revisionId, row.currentRevisionId),
            eq(siteBundleRevision.tenantId, tenantId)
          )
        )
        .limit(1);

      if (revisions.length > 0) {
        return toRevisionBundle(revisions[0]);
      }
    }

    // Legacy fallback (pre-revisions) stored directly on site_bundle
    if (row.html || row.css || row.js) {
      return {
        html: row.html,
        css: row.css,
        js: row.js,
        ts: row.ts,
        updatedAt: row.updatedAt,
      };
    }
  }

  return getLatestSiteBundleRevision(db, tenantId);
}

export async function listSiteBundleRevisions(
  db: Database,
  tenantId: string
): Promise<SiteBundleRevision[]> {
  const rows = await db
    .select()
    .from(siteBundleRevision)
    .where(eq(siteBundleRevision.tenantId, tenantId))
    .orderBy(desc(siteBundleRevision.revisionId));
  return rows.map(toRevision);
}

export async function getCurrentSiteBundleRevisionId(
  db: Database,
  tenantId: string
): Promise<number | null> {
  const rows = await db
    .select({ currentRevisionId: siteBundle.currentRevisionId })
    .from(siteBundle)
    .where(eq(siteBundle.tenantId, tenantId))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].currentRevisionId ?? null;
}

export async function addSiteBundleRevision(
  db: Database,
  bundle: Omit<SiteBundle, "updatedAt">,
  tenantId: string
): Promise<number> {
  const updatedAt = new Date().toISOString();

  const [inserted] = await db
    .insert(siteBundleRevision)
    .values({
      tenantId,
      html: bundle.html,
      css: bundle.css,
      js: bundle.js,
      ts: bundle.ts,
      createdAt: updatedAt,
    })
    .returning({ revisionId: siteBundleRevision.revisionId });
  const revisionId = inserted.revisionId;

  await db
    .insert(siteBundle)
    .values({ tenantId, currentRevisionId: revisionId, updatedAt })
    .onConflictDoUpdate({
      target: siteBundle.tenantId,
      set: { currentRevisionId: revisionId, updatedAt },
    });

  // Best-effort cleanup: keep last 50 revisions per tenant (LIMIT -1 OFFSET 50 is SQLite-specific)
  const client = getRawClient();
  await client.execute({
    sql: `DELETE FROM site_bundle_revision
          WHERE revision_id IN (
            SELECT revision_id
            FROM site_bundle_revision
            WHERE tenant_id = ?
            ORDER BY revision_id DESC
            LIMIT -1 OFFSET 50
          )`,
    args: [tenantId],
  });

  return revisionId;
}

export async function setCurrentSiteBundleRevision(
  db: Database,
  revisionId: number,
  tenantId: string
): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db
    .insert(siteBundle)
    .values({ tenantId, currentRevisionId: revisionId, updatedAt })
    .onConflictDoUpdate({
      target: siteBundle.tenantId,
      set: { currentRevisionId: revisionId, updatedAt },
    });
}

export async function deleteSiteBundleRevision(
  db: Database,
  revisionId: number,
  tenantId: string
): Promise<void> {
  await db
    .delete(siteBundleRevision)
    .where(
      and(eq(siteBundleRevision.revisionId, revisionId), eq(siteBundleRevision.tenantId, tenantId))
    );

  const currentId = await getCurrentSiteBundleRevisionId(db, tenantId);
  if (currentId === revisionId) {
    const latest = await db
      .select({ revisionId: siteBundleRevision.revisionId })
      .from(siteBundleRevision)
      .where(eq(siteBundleRevision.tenantId, tenantId))
      .orderBy(desc(siteBundleRevision.revisionId))
      .limit(1);

    const nextId = latest.length > 0 ? latest[0].revisionId : null;
    const updatedAt = new Date().toISOString();
    await db
      .insert(siteBundle)
      .values({ tenantId, currentRevisionId: nextId, updatedAt })
      .onConflictDoUpdate({
        target: siteBundle.tenantId,
        set: { currentRevisionId: nextId, updatedAt },
      });
  }
}
