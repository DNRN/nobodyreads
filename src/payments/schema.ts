import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// --- Paid tiers ---
//
// One row per subscription tier a plot offers. At launch a plot has at most one
// active tier; the table is keyed so more can be added without a migration.
// Amounts are in minor units (cents) — never floats, which cannot represent
// money exactly.

export const paidTier = sqliteTable(
  "paid_tier",
  {
    tierId: text("tier_id").notNull(),
    tenantId: text("tenant_id").notNull().default("_default"),
    name: text("name").notNull(),
    description: text("description"),
    currency: text("currency").notNull().default("eur"),
    /** Monthly price in minor units. NULL = monthly billing not offered. */
    amountMonthly: integer("amount_monthly"),
    /** Yearly price in minor units. NULL = annual billing not offered. */
    amountYearly: integer("amount_yearly"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.tierId, table.tenantId] })]
);

// --- Entitlements ---
//
// What a member is allowed to read. The composite natural primary key mirrors
// `post_like` exactly: it makes a grant an idempotent upsert, and lets a
// resubscribe reuse the same row rather than accumulating history.
//
// `expires_at` and `last_event_at` are INTEGER epoch seconds, NOT text
// timestamps. House style elsewhere is `datetime('now')` →
// `'2026-07-29 10:00:00'`, but the natural JS write is `toISOString()` →
// `'2026-07-29T10:00:00.000Z'`. Those two are not lexicographically comparable,
// so a column holding a mix of both silently mis-orders in SQL — locking out
// paying readers or granting expired ones. Epoch seconds cannot drift that way.
// `federation_auth_code.expires_at INTEGER` is the existing precedent.

export const entitlement = sqliteTable(
  "entitlement",
  {
    tenantId: text("tenant_id").notNull().default("_default"),
    memberIssuer: text("member_issuer").notNull(),
    memberSubject: text("member_subject").notNull(),
    /** 'tier' — a subscription; 'page' — a single-post purchase. */
    scopeKind: text("scope_kind").notNull(),
    /** Tier id for scope_kind='tier', page id for scope_kind='page'. */
    scopeRef: text("scope_ref").notNull(),
    /** 'active' | 'revoked'. */
    status: text("status").notNull().default("active"),
    /** Provider that granted it, e.g. 'stripe', or 'manual'. */
    source: text("source").notNull().default("manual"),
    /** Provider-side id (subscription / payment intent) for reconciliation. */
    externalRef: text("external_ref"),
    /** Epoch seconds. NULL = never expires (one-off purchases). */
    expiresAt: integer("expires_at"),
    /** Epoch seconds the entitlement was revoked, for audit. */
    revokedAt: integer("revoked_at"),
    /**
     * Epoch seconds of the most recent provider event applied to this row.
     * The ordering guard: an event older than this is ignored, which is what
     * stops a straggling `subscription.updated` from re-granting a
     * subscription that `subscription.deleted` already cancelled.
     */
    lastEventAt: integer("last_event_at").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({
      columns: [
        table.tenantId,
        table.memberIssuer,
        table.memberSubject,
        table.scopeKind,
        table.scopeRef,
      ],
    }),
  ]
);

// --- Payment events ---
//
// Every provider event that has been processed, for idempotency under webhook
// replay. Written *after* the entitlement is applied — see the doc comment on
// `applyEntitlementEvents`.

export const paymentEvent = sqliteTable("payment_event", {
  eventId: text("event_id").primaryKey(),
  provider: text("provider").notNull(),
  tenantId: text("tenant_id").notNull().default("_default"),
  kind: text("kind").notNull(),
  /** Epoch seconds the event occurred at the provider. */
  occurredAt: integer("occurred_at").notNull(),
  receivedAt: text("received_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// --- Payment customers ---
//
// Maps a member identity to the provider's customer id, so the "manage
// subscription" portal link can be built without a provider-side lookup.

export const paymentCustomer = sqliteTable(
  "payment_customer",
  {
    tenantId: text("tenant_id").notNull().default("_default"),
    memberIssuer: text("member_issuer").notNull(),
    memberSubject: text("member_subject").notNull(),
    provider: text("provider").notNull(),
    customerRef: text("customer_ref").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.memberIssuer, table.memberSubject, table.provider],
    }),
  ]
);
