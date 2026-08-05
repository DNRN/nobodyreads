/**
 * Safety validation for author-written custom view SQL.
 *
 * A custom view lets a plot author write a raw `SELECT` that is executed
 * server-side and rendered into a **public** page via `{{view:slug}}`. That
 * makes this file a security boundary, not a convenience check: whatever a
 * query can read, an anonymous visitor can read.
 *
 * The rules are an **allowlist of tables**, not a blocklist of keywords. A
 * blocklist ("no INSERT/DROP/…") happily passes
 * `SELECT nickname, email, password FROM tenant`, which is a full cross-tenant
 * credential dump. A column allowlist cannot work either — aliases, `p.*`,
 * subqueries and CTEs all defeat it. Only naming the tables that may be read
 * holds up.
 *
 * Deliberately pure: no imports, so both `content/db.ts` (execution) and
 * `shared/db.ts` (the boot-time audit) can use it without an import cycle.
 */

/**
 * Tables and views a custom query may read.
 *
 * `page` is **not** here — it carries the full markdown `content`, which after
 * paywalling is exactly the thing a gate exists to withhold. Authors read
 * `page_public` instead, a view over `page` with `content` projected away.
 */
export const CUSTOM_VIEW_ALLOWED_TABLES = [
  "page_public",
  "post_like",
  "comment",
  "content_view",
  "media",
] as const;

const ALLOWED = new Set<string>(CUSTOM_VIEW_ALLOWED_TABLES);

/**
 * Words that may follow a table name but are never an alias. Without this,
 * `FROM page_public JOIN tenant` would swallow `JOIN` as the alias and then
 * stop scanning — `tenant` is caught anyway by the outer JOIN scan, but the
 * comma-list walker below relies on stopping at the right place.
 */
const NOT_AN_ALIAS = new Set([
  "AS", "ON", "USING", "WHERE", "GROUP", "ORDER", "LIMIT", "OFFSET", "HAVING",
  "WINDOW", "UNION", "INTERSECT", "EXCEPT", "JOIN", "LEFT", "RIGHT", "INNER",
  "OUTER", "CROSS", "NATURAL", "FULL", "VALUES", "RETURNING",
]);

const FROM_OR_JOIN = /\b(?:FROM|JOIN)\b/gi;
const IDENTIFIER = /^\s*([A-Za-z_][A-Za-z0-9_$]*(?:\s*\.\s*[A-Za-z_][A-Za-z0-9_$]*)*)/;
const ALIAS = /^\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_$]*)/i;

/**
 * Read the comma-separated table list that follows a `FROM` / `JOIN` keyword.
 *
 * Returns `[]` for a derived table (`FROM (SELECT …)`) — the subquery's own
 * `FROM` is picked up separately by the global scan, so nothing is skipped.
 */
function readTableList(rest: string): string[] {
  const tables: string[] = [];

  for (;;) {
    const table = IDENTIFIER.exec(rest);
    if (!table) break;

    tables.push(table[1]);
    rest = rest.slice(table[0].length);

    const alias = ALIAS.exec(rest);
    if (alias && !NOT_AN_ALIAS.has(alias[1].toUpperCase())) {
      rest = rest.slice(alias[0].length);
    }

    const comma = /^\s*,/.exec(rest);
    if (!comma) break;
    rest = rest.slice(comma[0].length);
  }

  return tables;
}

/** Every table/view a query reads, normalised to lowercase, in source order. */
export function extractQueryTables(sql: string): string[] {
  const tables: string[] = [];

  FROM_OR_JOIN.lastIndex = 0;
  for (let match = FROM_OR_JOIN.exec(sql); match; match = FROM_OR_JOIN.exec(sql)) {
    for (const table of readTableList(sql.slice(match.index + match[0].length))) {
      tables.push(table.replace(/\s+/g, "").toLowerCase());
    }
  }

  return tables;
}

/** Tables a query reads that it is not allowed to read. */
export function deniedQueryTables(sql: string): string[] {
  return [...new Set(extractQueryTables(sql))].filter((table) => !ALLOWED.has(table));
}

/**
 * Validate that a SQL string is a safe, tenant-scoped, read-only SELECT.
 * Returns an error message if invalid, or null if valid.
 */
export function validateCustomQuery(sql: string): string | null {
  const trimmed = sql.trim();
  if (!trimmed) return "Query cannot be empty";

  if (!/^SELECT\b/i.test(trimmed)) {
    return "Query must be a SELECT statement";
  }

  // Comments are an obfuscation vector — `FROM/*x*/tenant` defeats any scanner
  // that does not strip them first, and stripping them correctly requires
  // string-literal awareness. Rejecting outright is cheaper and safer.
  if (/--|\/\*/.test(trimmed)) {
    return "SQL comments are not allowed in custom view queries";
  }

  // One statement only. A trailing semicolon is fine; anything after it is not.
  if (/;\s*\S/.test(trimmed)) {
    return "Query must be a single statement";
  }

  const forbidden =
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM)\b/i;
  if (forbidden.test(trimmed)) {
    return "Query contains forbidden keywords (only SELECT is allowed)";
  }

  const denied = deniedQueryTables(trimmed);
  if (denied.length > 0) {
    return (
      `Query reads tables that are not allowed: ${denied.join(", ")}. ` +
      `Allowed: ${CUSTOM_VIEW_ALLOWED_TABLES.join(", ")}. ` +
      `Use page_public instead of page.`
    );
  }

  // The runtime binds :tenant_id but cannot force a query to use it. Without
  // this, `SELECT * FROM page_public` reads every tenant's pages on a
  // multi-tenant deploy.
  if (!/:tenant_id\b/.test(trimmed)) {
    return "Query must scope results with :tenant_id (e.g. WHERE tenant_id = :tenant_id)";
  }

  return null;
}
