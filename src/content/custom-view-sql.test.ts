import { describe, it, expect } from "vitest";
import {
  validateCustomQuery,
  extractQueryTables,
  deniedQueryTables,
} from "./custom-view-sql.js";

const SCOPE = "WHERE tenant_id = :tenant_id";

describe("extractQueryTables", () => {
  it("reads a single FROM target", () => {
    expect(extractQueryTables("SELECT * FROM page_public")).toEqual(["page_public"]);
  });

  it("reads aliased tables", () => {
    expect(extractQueryTables("SELECT * FROM page_public AS p")).toEqual(["page_public"]);
    expect(extractQueryTables("SELECT * FROM page_public p")).toEqual(["page_public"]);
  });

  it("reads comma-joined table lists", () => {
    expect(extractQueryTables("SELECT * FROM page_public p, tenant t")).toEqual([
      "page_public",
      "tenant",
    ]);
  });

  it("reads JOIN targets", () => {
    expect(
      extractQueryTables("SELECT * FROM page_public p JOIN post_like l ON l.page_id = p.page_id"),
    ).toEqual(["page_public", "post_like"]);
  });

  it("reads through a derived table into its subquery", () => {
    expect(extractQueryTables("SELECT * FROM (SELECT * FROM tenant) x")).toEqual(["tenant"]);
  });

  it("reads subqueries in the select list", () => {
    expect(
      extractQueryTables("SELECT (SELECT password FROM tenant) AS p FROM page_public"),
    ).toEqual(["tenant", "page_public"]);
  });

  it("normalises case and schema qualification", () => {
    expect(extractQueryTables("select * from MAIN . Tenant")).toEqual(["main.tenant"]);
  });
});

describe("deniedQueryTables", () => {
  it("returns nothing for an allowed query", () => {
    expect(deniedQueryTables(`SELECT * FROM page_public ${SCOPE}`)).toEqual([]);
  });

  it("flags the page table", () => {
    expect(deniedQueryTables("SELECT content FROM page")).toEqual(["page"]);
  });

  it("dedupes repeats", () => {
    expect(deniedQueryTables("SELECT * FROM tenant UNION SELECT * FROM tenant")).toEqual([
      "tenant",
    ]);
  });
});

describe("validateCustomQuery", () => {
  it("accepts an allowlisted, tenant-scoped SELECT", () => {
    expect(validateCustomQuery(`SELECT slug, title FROM page_public ${SCOPE}`)).toBeNull();
  });

  it("accepts a join across two allowed tables", () => {
    expect(
      validateCustomQuery(
        `SELECT p.title, COUNT(l.page_id) FROM page_public p
         LEFT JOIN post_like l ON l.page_id = p.page_id
         WHERE p.tenant_id = :tenant_id GROUP BY p.page_id`,
      ),
    ).toBeNull();
  });

  it("rejects empty query", () => {
    expect(validateCustomQuery("")).toBe("Query cannot be empty");
  });

  it("rejects non-SELECT statements", () => {
    expect(validateCustomQuery("INSERT INTO page VALUES('x')")).not.toBeNull();
  });

  for (const keyword of ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE"]) {
    it(`rejects query containing ${keyword}`, () => {
      expect(validateCustomQuery(`SELECT 1; ${keyword} something`)).not.toBeNull();
    });
  }

  // --- The vulnerability this file exists to close ---

  it("rejects a credential dump from the tenant table", () => {
    const error = validateCustomQuery(
      "SELECT nickname, email, password FROM tenant WHERE tenant_id = :tenant_id",
    );
    expect(error).toContain("tenant");
  });

  it("rejects reading site_settings (encrypted provider keys)", () => {
    expect(
      validateCustomQuery("SELECT key, value FROM site_settings WHERE tenant_id = :tenant_id"),
    ).not.toBeNull();
  });

  it("rejects reading subscriber emails", () => {
    expect(
      validateCustomQuery("SELECT email FROM subscriber WHERE tenant_id = :tenant_id"),
    ).not.toBeNull();
  });

  it("rejects reading member password hashes", () => {
    expect(
      validateCustomQuery("SELECT password_hash FROM member WHERE :tenant_id = :tenant_id"),
    ).not.toBeNull();
  });

  it("rejects the page table so markdown content stays unreachable", () => {
    expect(
      validateCustomQuery("SELECT content FROM page WHERE tenant_id = :tenant_id"),
    ).not.toBeNull();
  });

  it("rejects sqlite_master schema reconnaissance", () => {
    expect(
      validateCustomQuery("SELECT sql FROM sqlite_master WHERE name = :tenant_id"),
    ).not.toBeNull();
  });

  it("rejects a denied table hidden behind a comma join", () => {
    expect(
      validateCustomQuery("SELECT * FROM page_public p, tenant t WHERE p.tenant_id = :tenant_id"),
    ).not.toBeNull();
  });

  it("rejects a denied table hidden in a subquery", () => {
    expect(
      validateCustomQuery(
        "SELECT (SELECT password FROM tenant LIMIT 1) FROM page_public WHERE tenant_id = :tenant_id",
      ),
    ).not.toBeNull();
  });

  it("rejects comments, which would otherwise hide the real FROM target", () => {
    expect(
      validateCustomQuery("SELECT * FROM/**/tenant WHERE tenant_id = :tenant_id"),
    ).toContain("comments");
    expect(
      validateCustomQuery("SELECT * FROM page_public WHERE tenant_id = :tenant_id -- x"),
    ).toContain("comments");
  });

  it("rejects schema-qualified names", () => {
    expect(
      validateCustomQuery("SELECT * FROM main.page WHERE tenant_id = :tenant_id"),
    ).not.toBeNull();
  });

  it("rejects a second statement", () => {
    expect(
      validateCustomQuery("SELECT * FROM page_public WHERE tenant_id = :tenant_id; SELECT 1"),
    ).not.toBeNull();
  });

  it("allows a trailing semicolon", () => {
    expect(
      validateCustomQuery("SELECT * FROM page_public WHERE tenant_id = :tenant_id;"),
    ).toBeNull();
  });

  it("requires tenant scoping, so one plot cannot read another's rows", () => {
    expect(validateCustomQuery("SELECT slug FROM page_public")).toContain(":tenant_id");
  });
});
