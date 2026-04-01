import { eq, and, desc } from "drizzle-orm";
import { siteTemplate, siteTemplateRevision } from "../db/schema.js";
import { getRawClient } from "./db.js";
import type { Database } from "../db/index.js";
import type { SiteTemplateDefinition } from "../template/types.js";

export interface SiteTemplateRecord {
  template: SiteTemplateDefinition;
  updatedAt: string;
}

export interface SiteTemplateRevisionRecord extends SiteTemplateRecord {
  revisionId: number;
  createdAt: string;
}

export async function getSiteTemplate(
  db: Database,
  tenantId: string,
): Promise<SiteTemplateDefinition | null> {
  const current = await db
    .select({
      currentRevisionId: siteTemplate.currentRevisionId,
      template: siteTemplate.template,
    })
    .from(siteTemplate)
    .where(eq(siteTemplate.tenantId, tenantId))
    .limit(1);

  if (current.length > 0) {
    const row = current[0];

    if (row.currentRevisionId != null) {
      const revisions = await db
        .select({ template: siteTemplateRevision.template })
        .from(siteTemplateRevision)
        .where(
          and(
            eq(siteTemplateRevision.revisionId, row.currentRevisionId),
            eq(siteTemplateRevision.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (revisions.length > 0) {
        return revisions[0].template as SiteTemplateDefinition;
      }
    }

    const tmpl = row.template as Record<string, unknown>;
    if (tmpl && Object.keys(tmpl).length > 0 && "tokens" in tmpl) {
      return tmpl as unknown as SiteTemplateDefinition;
    }
  }

  return getLatestSiteTemplateRevision(db, tenantId);
}

export async function getLatestSiteTemplateRevision(
  db: Database,
  tenantId: string,
): Promise<SiteTemplateDefinition | null> {
  const rows = await db
    .select({ template: siteTemplateRevision.template })
    .from(siteTemplateRevision)
    .where(eq(siteTemplateRevision.tenantId, tenantId))
    .orderBy(desc(siteTemplateRevision.revisionId))
    .limit(1);

  return rows.length > 0
    ? (rows[0].template as SiteTemplateDefinition)
    : null;
}

export async function getLatestSiteTemplateRevisionId(
  db: Database,
  tenantId: string,
): Promise<number | null> {
  const rows = await db
    .select({ revisionId: siteTemplateRevision.revisionId })
    .from(siteTemplateRevision)
    .where(eq(siteTemplateRevision.tenantId, tenantId))
    .orderBy(desc(siteTemplateRevision.revisionId))
    .limit(1);

  return rows.length > 0 ? rows[0].revisionId : null;
}

export async function listSiteTemplateRevisions(
  db: Database,
  tenantId: string,
): Promise<SiteTemplateRevisionRecord[]> {
  const rows = await db
    .select()
    .from(siteTemplateRevision)
    .where(eq(siteTemplateRevision.tenantId, tenantId))
    .orderBy(desc(siteTemplateRevision.revisionId));

  return rows.map((row) => ({
    revisionId: row.revisionId,
    template: row.template as SiteTemplateDefinition,
    updatedAt: row.createdAt,
    createdAt: row.createdAt,
  }));
}

export async function getCurrentSiteTemplateRevisionId(
  db: Database,
  tenantId: string,
): Promise<number | null> {
  const rows = await db
    .select({ currentRevisionId: siteTemplate.currentRevisionId })
    .from(siteTemplate)
    .where(eq(siteTemplate.tenantId, tenantId))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].currentRevisionId ?? null;
}

export async function addSiteTemplateRevision(
  db: Database,
  template: SiteTemplateDefinition,
  tenantId: string,
): Promise<number> {
  const updatedAt = new Date().toISOString();

  const [inserted] = await db
    .insert(siteTemplateRevision)
    .values({
      tenantId,
      template,
      createdAt: updatedAt,
    })
    .returning({ revisionId: siteTemplateRevision.revisionId });
  const revisionId = inserted.revisionId;

  // Ensure the site_template row exists (for tenants with no template yet)
  // but do NOT auto-set currentRevisionId — the revision stays as a draft
  // until explicitly published via setCurrentSiteTemplateRevision.
  const existing = await db
    .select({ tenantId: siteTemplate.tenantId })
    .from(siteTemplate)
    .where(eq(siteTemplate.tenantId, tenantId))
    .limit(1);

  if (existing.length === 0) {
    await db
      .insert(siteTemplate)
      .values({ tenantId, currentRevisionId: null, updatedAt });
  }

  const client = getRawClient();
  await client.execute({
    sql: `DELETE FROM site_template_revision
          WHERE revision_id IN (
            SELECT revision_id
            FROM site_template_revision
            WHERE tenant_id = ?
            ORDER BY revision_id DESC
            LIMIT -1 OFFSET 50
          )`,
    args: [tenantId],
  });

  return revisionId;
}

export async function setCurrentSiteTemplateRevision(
  db: Database,
  revisionId: number,
  tenantId: string,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db
    .insert(siteTemplate)
    .values({ tenantId, currentRevisionId: revisionId, updatedAt })
    .onConflictDoUpdate({
      target: siteTemplate.tenantId,
      set: { currentRevisionId: revisionId, updatedAt },
    });
}

export async function deleteSiteTemplateRevision(
  db: Database,
  revisionId: number,
  tenantId: string,
): Promise<void> {
  await db
    .delete(siteTemplateRevision)
    .where(
      and(
        eq(siteTemplateRevision.revisionId, revisionId),
        eq(siteTemplateRevision.tenantId, tenantId),
      ),
    );

  const currentId = await getCurrentSiteTemplateRevisionId(db, tenantId);
  if (currentId === revisionId) {
    const latest = await db
      .select({ revisionId: siteTemplateRevision.revisionId })
      .from(siteTemplateRevision)
      .where(eq(siteTemplateRevision.tenantId, tenantId))
      .orderBy(desc(siteTemplateRevision.revisionId))
      .limit(1);

    const nextId = latest.length > 0 ? latest[0].revisionId : null;
    const updatedAt = new Date().toISOString();
    await db
      .insert(siteTemplate)
      .values({ tenantId, currentRevisionId: nextId, updatedAt })
      .onConflictDoUpdate({
        target: siteTemplate.tenantId,
        set: { currentRevisionId: nextId, updatedAt },
      });
  }
}
