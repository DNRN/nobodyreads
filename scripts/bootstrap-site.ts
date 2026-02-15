import { initDb, getDb } from "../src/shared/db.js";
import { DEFAULT_SITE_TEMPLATE } from "../src/shared/site-template.js";
import { DEFAULT_SITE_CSS } from "../src/shared/site-style.js";
import {
  addSiteBundleRevision,
  listSiteBundleRevisions,
} from "../src/shared/site-bundle.js";
import { DEFAULT_TENANT_ID } from "../src/shared/types.js";
import { getContentViewBySlug, upsertContentView } from "../src/content/db.js";
import type { ContentView } from "../src/content/types.js";

const TENANT_ID = process.env.TENANT_ID ?? DEFAULT_TENANT_ID;

await initDb();
const db = getDb();

if (!db) {
  console.error("Database not initialized.");
  process.exit(1);
}

const existing = await listSiteBundleRevisions(db, TENANT_ID);
if (existing.length === 0) {
  await addSiteBundleRevision(
    db,
    {
      html: DEFAULT_SITE_TEMPLATE,
      css: DEFAULT_SITE_CSS,
      js: "",
    },
    TENANT_ID
  );
  console.log(`Initialized site bundle for tenant ${TENANT_ID}.`);
} else {
  console.log(`Site bundle already initialized for tenant ${TENANT_ID}.`);
}

const latestPostsView = await getContentViewBySlug(db, "latest-posts", TENANT_ID);
if (!latestPostsView) {
  const defaultView: ContentView = {
    id: "latest-posts",
    slug: "latest-posts",
    title: "Latest posts",
    kind: "post_list",
    config: { order: "newest", limit: 10 },
    published: true,
  };
  await upsertContentView(db, defaultView, TENANT_ID);
  console.log(`Seeded default content view '{{view:latest-posts}}' for tenant ${TENANT_ID}.`);
} else {
  console.log(`Default content view already exists for tenant ${TENANT_ID}.`);
}

db.close();
