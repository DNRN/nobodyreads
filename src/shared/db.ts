import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import * as schema from "../db/schema.js";
import type { Database } from "../db/index.js";

// --- Database connection ---

let database: Database | undefined;
let rawClient: Client | undefined;
let dbPromise: Promise<Database> | null = null;

function resolveSchemaPath(): string {
  const candidates = [
    join(process.cwd(), "schema.sql"),
    join(import.meta.dirname, "..", "..", "schema.sql"),
    join(import.meta.dirname, "..", "..", "..", "..", "schema.sql"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export async function initDb(): Promise<Database> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const url = process.env.DATABASE_URL || "file:data/blog.db";

    if (url.startsWith("file:")) {
      const dbPath = url.slice(5);
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    const client = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    });

    const schemaSql = readFileSync(resolveSchemaPath(), "utf-8");
    await client.executeMultiple(schemaSql);

    await migrateColumns(client);

    rawClient = client;
    database = drizzle(client, { schema });

    console.log(`database connected (${url})`);
    return database;
  })();

  return dbPromise;
}

/** Get the Drizzle database instance (undefined if not yet initialized). */
export function getDb(): Database | undefined {
  return database;
}

/** Get the raw libSQL client for queries that need raw SQL (e.g. user-defined queries). */
export function getRawClient(): Client {
  if (!rawClient) throw new Error("Database not initialized");
  return rawClient;
}

/** Add columns that may be missing from older databases. */
async function migrateColumns(client: Client): Promise<void> {
  const migrations = [
    "ALTER TABLE tenant ADD COLUMN display_name TEXT",
    "ALTER TABLE tenant ADD COLUMN avatar_url TEXT",
    "ALTER TABLE tenant ADD COLUMN avatar_color TEXT",
    "ALTER TABLE tenant ADD COLUMN bio TEXT",
    "ALTER TABLE site_bundle ADD COLUMN current_revision_id INTEGER",
    "ALTER TABLE site_bundle ADD COLUMN ts TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE site_bundle_revision ADD COLUMN ts TEXT NOT NULL DEFAULT ''",
  ];
  for (const sql of migrations) {
    try {
      await client.execute(sql);
    } catch {
      // Column already exists — ignore
    }
  }

  await migrateContentViewKind(client);
}

/**
 * Recreate the content_view table if the CHECK constraint doesn't include 'custom'.
 * SQLite does not support ALTER CONSTRAINT, so we recreate the table.
 */
async function migrateContentViewKind(client: Client): Promise<void> {
  const info = await client.execute(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='content_view'"
  );
  if (info.rows.length === 0) return;

  const createSql = info.rows[0].sql as string;
  if (createSql.includes("'custom'")) return;

  await client.executeMultiple(`
    CREATE TABLE content_view_new (
      content_view_id TEXT NOT NULL,
      tenant_id       TEXT NOT NULL DEFAULT '_default',
      slug            TEXT NOT NULL,
      title           TEXT NOT NULL,
      kind            TEXT NOT NULL CHECK(kind IN ('post_list', 'custom')),
      config          TEXT NOT NULL DEFAULT '{}',
      published       INTEGER NOT NULL DEFAULT 0,
      updated         TEXT,
      PRIMARY KEY (content_view_id, tenant_id),
      UNIQUE (slug, tenant_id)
    );
    INSERT INTO content_view_new SELECT * FROM content_view;
    DROP TABLE content_view;
    ALTER TABLE content_view_new RENAME TO content_view;
  `);
}
