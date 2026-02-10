import { createClient, type Client } from "@libsql/client";
import { readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// --- Database connection ---

let db: Client | undefined;
let dbPromise: Promise<Client> | null = null;

export async function initDb(): Promise<Client> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const url = process.env.DATABASE_URL || "file:data/blog.db";

    // Ensure the directory exists for local file databases
    if (url.startsWith("file:")) {
      const dbPath = url.slice(5); // strip "file:"
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    db = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    });

    // Run schema migration
    const schema = readFileSync(join(import.meta.dirname, "..", "..", "schema.sql"), "utf-8");
    await db.executeMultiple(schema);

    // Run column migrations (safe to re-run — ALTER TABLE is a no-op if column exists)
    await migrateColumns(db);

    console.log(`database connected (${url})`);
    return db;
  })();

  return dbPromise;
}

/** Add columns that may be missing from older databases. */
async function migrateColumns(client: Client): Promise<void> {
  const migrations = [
    "ALTER TABLE tenant ADD COLUMN display_name TEXT",
    "ALTER TABLE tenant ADD COLUMN avatar_url TEXT",
    "ALTER TABLE tenant ADD COLUMN avatar_color TEXT",
    "ALTER TABLE tenant ADD COLUMN bio TEXT",
    "ALTER TABLE site_bundle ADD COLUMN current_revision_id INTEGER",
  ];
  for (const sql of migrations) {
    try {
      await client.execute(sql);
    } catch {
      // Column already exists — ignore
    }
  }
}

/** Get the raw database client (for scripts that need direct access). */
export function getDb(): Client | undefined {
  return db;
}
