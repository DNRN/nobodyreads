import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";

/**
 * The test trap this file exists to spring.
 *
 * `createTestDb()` builds its database from `schema.sql` alone — it never runs
 * `migrateColumns()`. A column added *only* to the ALTER list in
 * `shared/db.ts` therefore exists in production and is invisible to every
 * single test, so the whole suite passes green against a schema that does not
 * match the one that ships. These assertions fail loudly instead.
 */

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

async function columnsOf(table: string): Promise<Set<string>> {
  const result = await t.client.execute(`SELECT * FROM ${table} LIMIT 0`);
  return new Set(result.columns);
}

describe("payments schema is present in a fresh test database", () => {
  it("page carries the gating columns", async () => {
    const columns = await columnsOf("page");
    expect(columns.has("access_tier")).toBe(true);
    expect(columns.has("price_amount")).toBe(true);
  });

  it("page_public exposes the gating columns but never the body", async () => {
    const columns = await columnsOf("page_public");
    expect(columns.has("access_tier")).toBe(true);
    expect(columns.has("price_amount")).toBe(true);
    expect(columns.has("content")).toBe(false);
  });

  for (const table of ["paid_tier", "entitlement", "payment_event", "payment_customer"]) {
    it(`${table} exists`, async () => {
      await expect(t.client.execute(`SELECT * FROM ${table} LIMIT 0`)).resolves.toBeDefined();
    });
  }

  it("entitlement timestamps are INTEGER epoch seconds, not text", async () => {
    const info = await t.client.execute("PRAGMA table_info(entitlement)");
    const types = new Map(info.rows.map((r) => [String(r.name), String(r.type).toUpperCase()]));

    // A TEXT column here silently mis-orders `datetime('now')` against
    // `toISOString()`, which locks out paying readers or grants expired ones.
    expect(types.get("expires_at")).toBe("INTEGER");
    expect(types.get("revoked_at")).toBe("INTEGER");
    expect(types.get("last_event_at")).toBe("INTEGER");
  });

  it("access_tier defaults to public, so an unmigrated row is never paid", async () => {
    await t.client.execute({
      sql: "INSERT INTO page (page_id, tenant_id, slug, title, date, kind) VALUES (?, ?, ?, ?, ?, ?)",
      args: ["p1", "t1", "s", "T", "2026-01-01", "post"],
    });
    const rows = await t.client.execute("SELECT access_tier FROM page WHERE page_id = 'p1'");
    expect(rows.rows[0].access_tier).toBe("public");
  });
});
