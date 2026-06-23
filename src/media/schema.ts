import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// --- Media uploads ---

export const media = sqliteTable(
  "media",
  {
    mediaId: text("media_id").notNull(),
    tenantId: text("tenant_id").notNull().default("_default"),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.mediaId, table.tenantId] })]
);
