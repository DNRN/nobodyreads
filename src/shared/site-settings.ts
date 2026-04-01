import { eq, and } from "drizzle-orm";
import { siteSettings } from "../db/schema.js";
import type { Database } from "../db/index.js";

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
