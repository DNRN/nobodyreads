import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as schema from "../db/schema.js";
import type { Database } from "../db/index.js";

const schemaSql = readFileSync(
  join(import.meta.dirname, "..", "..", "schema.sql"),
  "utf-8",
);

export interface TestDb {
  db: Database;
  client: Client;
}

/** Create a fresh in-memory SQLite database with all tables initialized. */
export async function createTestDb(): Promise<TestDb> {
  const client = createClient({ url: ":memory:" });
  await client.executeMultiple(schemaSql);
  const db = drizzle(client, { schema });
  return { db, client };
}
