import type { Database } from "../../src/db/index.js";
import { initDb } from "../../src/shared/db.js";

let dbPromise: Promise<Database> | null = null;

export async function getDbClient(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = initDb();
  }
  return dbPromise;
}
