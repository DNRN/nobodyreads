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
    /** Whole seconds, read from the file's own headers. NULL for non-time media. */
    durationSeconds: integer("duration_seconds"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.mediaId, table.tenantId] })]
);

// --- Chunked upload sessions ---
//
// A file too large for one request arrives as fixed-size parts, each stored as
// its own object until `complete` assembles them. The session row holds what
// the client declared; which parts have arrived lives in its own table so two
// parts landing at once cannot overwrite each other's bookkeeping.

export const uploadSession = sqliteTable(
  "upload_session",
  {
    sessionId: text("session_id").notNull(),
    tenantId: text("tenant_id").notNull().default("_default"),
    originalName: text("original_name").notNull(),
    /** The client's declared type, normalized. Checked against the bytes on complete. */
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    chunkBytes: integer("chunk_bytes").notNull(),
    /** 'open' accepts parts; 'completing' is claimed by exactly one complete call. */
    status: text("status").notNull().default("open"),
    /** Epoch seconds — compared numerically for the stale-session sweep. */
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.tenantId] })]
);

export const uploadSessionPart = sqliteTable(
  "upload_session_part",
  {
    sessionId: text("session_id").notNull(),
    tenantId: text("tenant_id").notNull().default("_default"),
    partNumber: integer("part_number").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.tenantId, table.partNumber] }),
  ]
);
