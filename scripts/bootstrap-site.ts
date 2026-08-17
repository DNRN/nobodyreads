import { initDb, getDb, getRawClient } from "../src/shared/db.js";
import { DEFAULT_TEMPLATE } from "../src/template/defaults.js";
import {
  addSiteTemplateRevision,
  listSiteTemplateRevisions,
} from "../src/shared/site-bundle.js";
import { DEFAULT_TENANT_ID } from "../src/shared/types.js";
import {
  findPageByKind,
  getContentViewBySlug,
  upsertContentView,
  upsertPage,
} from "../src/content/db.js";
import {
  DEFAULT_COLLECTION_SLUG,
  defaultHomePage,
  defaultLatestPostsView,
} from "../src/content/defaults.js";
import { embedToken } from "../src/shared/embed-token.js";

const TENANT_ID = process.env.TENANT_ID ?? DEFAULT_TENANT_ID;

await initDb();
const db = getDb();

if (!db) {
  console.error("Database not initialized.");
  process.exit(1);
}

const existing = await listSiteTemplateRevisions(db, TENANT_ID);
if (existing.length === 0) {
  await addSiteTemplateRevision(db, DEFAULT_TEMPLATE, TENANT_ID);
  console.log(`Initialized site template for tenant ${TENANT_ID}.`);
} else {
  console.log(`Site template already initialized for tenant ${TENANT_ID}.`);
}

const latestPostsView = await getContentViewBySlug(db, DEFAULT_COLLECTION_SLUG, TENANT_ID);
if (!latestPostsView) {
  await upsertContentView(db, defaultLatestPostsView(), TENANT_ID);
  console.log(
    `Seeded default content view '${embedToken(DEFAULT_COLLECTION_SLUG)}' for tenant ${TENANT_ID}.`,
  );
} else {
  console.log(`Default content view already exists for tenant ${TENANT_ID}.`);
}

const existingHome = await findPageByKind(db, "home", TENANT_ID);
if (!existingHome) {
  const today = new Date().toISOString().slice(0, 10);
  const title = process.env.SITE_NAME ?? "My plot";
  await upsertPage(db, defaultHomePage({ title, date: today }), TENANT_ID);
  console.log(`Seeded starter home page for tenant ${TENANT_ID}.`);
} else {
  console.log(`Home page already exists for tenant ${TENANT_ID}.`);
}

getRawClient().close();
