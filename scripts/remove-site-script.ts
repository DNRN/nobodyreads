import { initDb, getDb } from "../src/shared/db.js";
import { getSiteBundle, addSiteBundleRevision } from "../src/shared/site-bundle.js";
import { DEFAULT_TENANT_ID } from "../src/shared/types.js";

const TENANT_ID = process.env.TENANT_ID ?? DEFAULT_TENANT_ID;

await initDb();
const db = getDb();

if (!db) {
  console.error("Database not initialized.");
  process.exit(1);
}

const bundle = await getSiteBundle(db, TENANT_ID);
if (!bundle) {
  console.log(`No bundle found for tenant ${TENANT_ID}.`);
  db.close();
  process.exit(0);
}

const cleanedHtml = bundle.html.replace(
  /\n?<script\s+src=["']\/site\.js["']\s+defer><\/script>\n?/g,
  "\n"
);

await addSiteBundleRevision(
  db,
  {
    html: cleanedHtml,
    css: bundle.css,
    js: bundle.js,
  },
  TENANT_ID
);

db.close();
console.log(`Removed /site.js script from bundle for tenant ${TENANT_ID}.`);
