import { initDb, getDb } from "../src/shared/db.js";
import { DEFAULT_TEMPLATE } from "../src/template/defaults.js";
import { getSiteTemplate, addSiteTemplateRevision } from "../src/shared/site-bundle.js";
import { DEFAULT_TENANT_ID } from "../src/shared/types.js";

await initDb();
const db = getDb();

if (!db) {
  console.error("Database not initialized.");
  process.exit(1);
}

const tenantsResult = await db.execute({
  sql: `SELECT DISTINCT tenant_id FROM site_template
        UNION
        SELECT DISTINCT tenant_id FROM site_template_revision`,
});

const tenantIds =
  tenantsResult.rows.length > 0
    ? tenantsResult.rows.map((row) => row.tenant_id as string)
    : [DEFAULT_TENANT_ID];

for (const tenantId of tenantIds) {
  await addSiteTemplateRevision(db, DEFAULT_TEMPLATE, tenantId);
  console.log(`Applied default template to tenant ${tenantId}`);
}

db.close();
