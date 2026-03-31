import { initDb, getDb } from "../src/shared/db.js";
import { getSiteTemplate, addSiteTemplateRevision } from "../src/shared/site-bundle.js";
import { DEFAULT_TENANT_ID } from "../src/shared/types.js";

const TENANT_ID = process.env.TENANT_ID ?? DEFAULT_TENANT_ID;

await initDb();
const db = getDb();

if (!db) {
  console.error("Database not initialized.");
  process.exit(1);
}

const template = await getSiteTemplate(db, TENANT_ID);
if (!template) {
  console.log(`No template found for tenant ${TENANT_ID}.`);
  db.close();
  process.exit(0);
}

const cleaned = { ...template, customJs: "" };
await addSiteTemplateRevision(db, cleaned, TENANT_ID);

db.close();
console.log(`Cleared custom JS from template for tenant ${TENANT_ID}.`);
