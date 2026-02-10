import type { Client, Row } from "@libsql/client";

export interface SiteBundle {
  html: string;
  css: string;
  js: string;
  updatedAt: string;
}

export interface SiteBundleRevision extends SiteBundle {
  revisionId: number;
  createdAt: string;
}

function rowToBundle(row: Row): SiteBundle {
  return {
    html: (row.html as string) ?? "",
    css: (row.css as string) ?? "",
    js: (row.js as string) ?? "",
    updatedAt: row.updated_at as string,
  };
}

function rowToRevision(row: Row): SiteBundleRevision {
  return {
    revisionId: row.revision_id as number,
    html: (row.html as string) ?? "",
    css: (row.css as string) ?? "",
    js: (row.js as string) ?? "",
    updatedAt: row.created_at as string,
    createdAt: row.created_at as string,
  };
}

export async function getSiteBundle(
  db: Client,
  tenantId: string
): Promise<SiteBundle | null> {
  const current = await db.execute({
    sql: `SELECT current_revision_id, html, css, js, updated_at
          FROM site_bundle
          WHERE tenant_id = ?
          LIMIT 1`,
    args: [tenantId],
  });

  if (current.rows.length > 0) {
    const row = current.rows[0];
    const currentRevisionId = row.current_revision_id as number | null;
    if (currentRevisionId != null) {
      const revision = await db.execute({
        sql: `SELECT html, css, js, created_at
              FROM site_bundle_revision
              WHERE revision_id = ? AND tenant_id = ?
              LIMIT 1`,
        args: [currentRevisionId, tenantId],
      });
      if (revision.rows.length > 0) {
        const r = revision.rows[0];
        return {
          html: (r.html as string) ?? "",
          css: (r.css as string) ?? "",
          js: (r.js as string) ?? "",
          updatedAt: r.created_at as string,
        };
      }
    }

    // Legacy fallback (pre-revisions) stored directly on site_bundle
    if ((row.html as string) || (row.css as string) || (row.js as string)) {
      return rowToBundle(row);
    }
  }

  // If no current pointer, use the latest revision if any
  const result = await db.execute({
    sql: `SELECT html, css, js, created_at
          FROM site_bundle_revision
          WHERE tenant_id = ?
          ORDER BY revision_id DESC
          LIMIT 1`,
    args: [tenantId],
  });
  return result.rows.length > 0
    ? {
        html: (result.rows[0].html as string) ?? "",
        css: (result.rows[0].css as string) ?? "",
        js: (result.rows[0].js as string) ?? "",
        updatedAt: result.rows[0].created_at as string,
      }
    : null;
}

export async function listSiteBundleRevisions(
  db: Client,
  tenantId: string
): Promise<SiteBundleRevision[]> {
  const result = await db.execute({
    sql: `SELECT revision_id, html, css, js, created_at
          FROM site_bundle_revision
          WHERE tenant_id = ?
          ORDER BY revision_id DESC`,
    args: [tenantId],
  });
  return result.rows.map(rowToRevision);
}

export async function getCurrentSiteBundleRevisionId(
  db: Client,
  tenantId: string
): Promise<number | null> {
  const result = await db.execute({
    sql: `SELECT current_revision_id
          FROM site_bundle
          WHERE tenant_id = ?
          LIMIT 1`,
    args: [tenantId],
  });
  if (result.rows.length === 0) return null;
  const value = result.rows[0].current_revision_id as number | null;
  return value ?? null;
}

export async function addSiteBundleRevision(
  db: Client,
  bundle: Omit<SiteBundle, "updatedAt">,
  tenantId: string
): Promise<number> {
  const updatedAt = new Date().toISOString();
  const insert = await db.execute({
    sql: `INSERT INTO site_bundle_revision (tenant_id, html, css, js, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [tenantId, bundle.html, bundle.css, bundle.js, updatedAt],
  });
  const revisionId = Number(insert.lastInsertRowid);

  await db.execute({
    sql: `INSERT INTO site_bundle (tenant_id, current_revision_id, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT (tenant_id) DO UPDATE SET
            current_revision_id = excluded.current_revision_id,
            updated_at = excluded.updated_at`,
    args: [tenantId, revisionId, updatedAt],
  });

  // Keep last 50 revisions per tenant (best-effort cleanup)
  await db.execute({
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
  db: Client,
  revisionId: number,
  tenantId: string
): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO site_bundle (tenant_id, current_revision_id, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT (tenant_id) DO UPDATE SET
            current_revision_id = excluded.current_revision_id,
            updated_at = excluded.updated_at`,
    args: [tenantId, revisionId, updatedAt],
  });
}

export async function deleteSiteBundleRevision(
  db: Client,
  revisionId: number,
  tenantId: string
): Promise<void> {
  await db.execute({
    sql: `DELETE FROM site_bundle_revision
          WHERE revision_id = ? AND tenant_id = ?`,
    args: [revisionId, tenantId],
  });

  const currentId = await getCurrentSiteBundleRevisionId(db, tenantId);
  if (currentId === revisionId) {
    const latest = await db.execute({
      sql: `SELECT revision_id
            FROM site_bundle_revision
            WHERE tenant_id = ?
            ORDER BY revision_id DESC
            LIMIT 1`,
      args: [tenantId],
    });
    const nextId =
      latest.rows.length > 0 ? (latest.rows[0].revision_id as number) : null;
    const updatedAt = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO site_bundle (tenant_id, current_revision_id, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT (tenant_id) DO UPDATE SET
              current_revision_id = excluded.current_revision_id,
              updated_at = excluded.updated_at`,
      args: [tenantId, nextId, updatedAt],
    });
  }
}
