import { initDb, getDb } from "../src/shared/db.js";
import { DEFAULT_SITE_TEMPLATE } from "../src/shared/site-template.js";
import { DEFAULT_SITE_CSS } from "../src/shared/site-style.js";
import {
  addSiteBundleRevision,
  listSiteBundleRevisions,
} from "../src/shared/site-bundle.js";
import { DEFAULT_TENANT_ID } from "../src/shared/types.js";

const TENANT_ID = process.env.TENANT_ID ?? DEFAULT_TENANT_ID;

await initDb();
const db = getDb();

if (!db) {
  console.error("Database not initialized.");
  process.exit(1);
}

const existing = await listSiteBundleRevisions(db, TENANT_ID);
if (existing.length > 0) {
  console.log(`Site bundle already initialized for tenant ${TENANT_ID}.`);
  db.close();
  process.exit(0);
}

await addSiteBundleRevision(
  db,
  {
    html: DEFAULT_SITE_TEMPLATE,
    css: DEFAULT_SITE_CSS,
    js: "",
  },
  TENANT_ID
);

db.close();
console.log(`Initialized site bundle for tenant ${TENANT_ID}.`);
