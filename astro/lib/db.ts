import type { Client } from "@libsql/client";
import { initDb } from "../../src/shared/db.js";

let dbPromise: Promise<Client> | null = null;

export async function getDbClient(): Promise<Client> {
  if (!dbPromise) {
    dbPromise = initDb();
  }
  return dbPromise;
}
