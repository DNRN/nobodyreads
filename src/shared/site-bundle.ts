import type { Client, Row } from "@libsql/client";

export interface SiteBundle {
  html: string;
  css: string;
  js: string;
  updatedAt: string;
}

function rowToBundle(row: Row): SiteBundle {
  return {
    html: (row.html as string) ?? "",
    css: (row.css as string) ?? "",
    js: (row.js as string) ?? "",
    updatedAt: row.updated_at as string,
  };
}

export async function getSiteBundle(
  db: Client,
  tenantId: string
): Promise<SiteBundle | null> {
  const result = await db.execute({
    sql: `SELECT html, css, js, updated_at
          FROM site_bundle
          WHERE tenant_id = ?
          LIMIT 1`,
    args: [tenantId],
  });
  return result.rows.length > 0 ? rowToBundle(result.rows[0]) : null;
}

export async function upsertSiteBundle(
  db: Client,
  bundle: Omit<SiteBundle, "updatedAt">,
  tenantId: string
): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO site_bundle (tenant_id, html, css, js, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (tenant_id) DO UPDATE SET
            html = excluded.html,
            css = excluded.css,
            js = excluded.js,
            updated_at = excluded.updated_at`,
    args: [tenantId, bundle.html, bundle.css, bundle.js, updatedAt],
  });
}
