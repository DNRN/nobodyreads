import { initDb, getDb } from "../src/shared/db.js";
import { DEFAULT_SITE_CSS } from "../src/shared/site-style.js";
import { getSiteBundle, addSiteBundleRevision } from "../src/shared/site-bundle.js";
import { DEFAULT_TENANT_ID } from "../src/shared/types.js";

await initDb();
const db = getDb();

if (!db) {
  console.error("Database not initialized.");
  process.exit(1);
}

const tenantsResult = await db.execute({
  sql: `SELECT DISTINCT tenant_id FROM site_bundle
        UNION
        SELECT DISTINCT tenant_id FROM site_bundle_revision`,
});

const tenantIds =
  tenantsResult.rows.length > 0
    ? tenantsResult.rows.map((row) => row.tenant_id as string)
    : [DEFAULT_TENANT_ID];

for (const tenantId of tenantIds) {
  const bundle = await getSiteBundle(db, tenantId);
  await addSiteBundleRevision(
    db,
    {
      html: bundle?.html ?? "",
      css: DEFAULT_SITE_CSS,
      js: bundle?.js ?? "",
    },
    tenantId
  );
  console.log(`Applied minimal CSS to tenant ${tenantId}`);
}

db.close();
