// Schema barrel — re-exports every table from its feature-owned slice.
//
// Drizzle needs the full set of tables in one namespace (see shared/db.ts:
// `import * as schema from "../db/schema/index.js"`). Each feature owns its own
// slice; this file just aggregates them.
//
// Adding or altering a table is a THREE-file change:
//   1. the feature's Drizzle slice (e.g. content/schema.ts) — for typed queries
//   2. schema.sql — the canonical DDL run at startup (the runtime source of truth)
//   3. migrateColumns() in shared/db.ts — an ALTER so existing databases catch up
// Drizzle Kit is configured but not used to generate/run migrations.

export { tenant, siteTemplate, siteTemplateRevision, siteSettings } from "../../shared/schema.js";
export { page, contentView } from "../../content/schema.js";
export { media } from "../../media/schema.js";
export { member, plotMembership, postLike } from "../../community/schema.js";
export { comment } from "../../comments/schema.js";
export { subscriber } from "../../subscription/schema.js";
