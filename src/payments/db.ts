import { and, eq, or, gt, isNull, asc } from "drizzle-orm";
import type { Database } from "../db/index.js";
import type { MemberIdentity } from "../community/types.js";
import { paidTier, entitlement, paymentCustomer } from "./schema.js";
import type { Entitlement, EntitlementScope, PaidTier } from "./types.js";

/** Current time as epoch seconds — the unit every timestamp column here uses. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// --- Paid tiers ---

type PaidTierRow = typeof paidTier.$inferSelect;

function toPaidTier(row: PaidTierRow): PaidTier {
  return {
    id: row.tierId,
    name: row.name,
    description: row.description ?? undefined,
    currency: row.currency,
    amountMonthly: row.amountMonthly,
    amountYearly: row.amountYearly,
    active: row.active,
    createdAt: row.createdAt,
  };
}

export async function listPaidTiers(db: Database, tenantId: string): Promise<PaidTier[]> {
  const rows = await db
    .select()
    .from(paidTier)
    .where(eq(paidTier.tenantId, tenantId))
    .orderBy(asc(paidTier.createdAt));
  return rows.map(toPaidTier);
}

/**
 * The tier a paywall should offer.
 *
 * One active tier per plot at launch; if an operator has somehow created more,
 * the oldest active one wins so the choice is stable rather than arbitrary.
 */
export async function getActivePaidTier(
  db: Database,
  tenantId: string
): Promise<PaidTier | null> {
  const rows = await db
    .select()
    .from(paidTier)
    .where(and(eq(paidTier.tenantId, tenantId), eq(paidTier.active, true)))
    .orderBy(asc(paidTier.createdAt))
    .limit(1);
  return rows.length > 0 ? toPaidTier(rows[0]) : null;
}

export async function getPaidTierById(
  db: Database,
  tierId: string,
  tenantId: string
): Promise<PaidTier | null> {
  const rows = await db
    .select()
    .from(paidTier)
    .where(and(eq(paidTier.tierId, tierId), eq(paidTier.tenantId, tenantId)))
    .limit(1);
  return rows.length > 0 ? toPaidTier(rows[0]) : null;
}

export async function upsertPaidTier(
  db: Database,
  tier: PaidTier,
  tenantId: string
): Promise<void> {
  const values = {
    name: tier.name,
    description: tier.description ?? null,
    currency: tier.currency,
    amountMonthly: tier.amountMonthly,
    amountYearly: tier.amountYearly,
    active: tier.active,
  };

  await db
    .insert(paidTier)
    .values({ tierId: tier.id, tenantId, ...values })
    .onConflictDoUpdate({ target: [paidTier.tierId, paidTier.tenantId], set: values });
}

export async function deletePaidTier(
  db: Database,
  tierId: string,
  tenantId: string
): Promise<void> {
  await db
    .delete(paidTier)
    .where(and(eq(paidTier.tierId, tierId), eq(paidTier.tenantId, tenantId)));
}

// --- Entitlements ---

type EntitlementRow = typeof entitlement.$inferSelect;

function toEntitlement(row: EntitlementRow): Entitlement {
  return {
    member: {
      issuer: row.memberIssuer,
      subject: row.memberSubject,
      displayName: "",
    },
    scopeKind: row.scopeKind as "tier" | "page",
    scopeRef: row.scopeRef,
    status: row.status as "active" | "revoked",
    source: row.source,
    externalRef: row.externalRef,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    lastEventAt: row.lastEventAt,
  };
}

function scopeColumns(scope: EntitlementScope): { scopeKind: "tier" | "page"; scopeRef: string } {
  return scope.kind === "tier"
    ? { scopeKind: "tier", scopeRef: scope.tierId }
    : { scopeKind: "page", scopeRef: scope.pageId };
}

/** Active and unexpired. Shared by every read so the definition cannot drift. */
function liveEntitlement(now: number) {
  return and(
    eq(entitlement.status, "active"),
    or(isNull(entitlement.expiresAt), gt(entitlement.expiresAt, now))
  );
}

/**
 * Does this member currently have access to this page's paid content?
 *
 * One indexed `SELECT 1 … LIMIT 1`: either a live tier entitlement (any tier —
 * a plot has one at launch) or a live entitlement for this exact page.
 *
 * Only called for `access_tier = 'paid'` pages; `resolvePageAccess`
 * short-circuits public pages before reaching here, so the common case costs
 * no query at all.
 */
export async function hasPageAccess(
  db: Database,
  tenantId: string,
  member: MemberIdentity,
  pageId: string,
  now: number = nowSeconds()
): Promise<boolean> {
  const rows = await db
    .select({ scopeRef: entitlement.scopeRef })
    .from(entitlement)
    .where(
      and(
        eq(entitlement.tenantId, tenantId),
        eq(entitlement.memberIssuer, member.issuer),
        eq(entitlement.memberSubject, member.subject),
        liveEntitlement(now),
        or(
          eq(entitlement.scopeKind, "tier"),
          and(eq(entitlement.scopeKind, "page"), eq(entitlement.scopeRef, pageId))
        )
      )
    )
    .limit(1);

  return rows.length > 0;
}

/** Every live entitlement a member holds on a plot. UI hints only — never a gate. */
export async function listMemberEntitlements(
  db: Database,
  tenantId: string,
  member: MemberIdentity,
  now: number = nowSeconds()
): Promise<Entitlement[]> {
  const rows = await db
    .select()
    .from(entitlement)
    .where(
      and(
        eq(entitlement.tenantId, tenantId),
        eq(entitlement.memberIssuer, member.issuer),
        eq(entitlement.memberSubject, member.subject),
        liveEntitlement(now)
      )
    );
  return rows.map(toEntitlement);
}

export async function getEntitlement(
  db: Database,
  tenantId: string,
  member: MemberIdentity,
  scope: EntitlementScope
): Promise<Entitlement | null> {
  const { scopeKind, scopeRef } = scopeColumns(scope);
  const rows = await db
    .select()
    .from(entitlement)
    .where(
      and(
        eq(entitlement.tenantId, tenantId),
        eq(entitlement.memberIssuer, member.issuer),
        eq(entitlement.memberSubject, member.subject),
        eq(entitlement.scopeKind, scopeKind),
        eq(entitlement.scopeRef, scopeRef)
      )
    )
    .limit(1);
  return rows.length > 0 ? toEntitlement(rows[0]) : null;
}

export interface GrantEntitlementInput {
  member: MemberIdentity;
  scope: EntitlementScope;
  source: string;
  externalRef?: string | null;
  /** Epoch seconds; null/undefined = never expires (one-off purchases). */
  expiresAt?: number | null;
  /** Epoch seconds of the provider event driving this. Guards ordering. */
  eventAt: number;
}

/**
 * Grant (or extend) an entitlement, idempotently.
 *
 * Returns false when the write was skipped because the row already reflects a
 * *newer* provider event. That guard is the thing that makes out-of-order
 * webhook delivery safe: a `subscription.deleted` at t=100 followed by a
 * straggling `subscription.updated` from t=90 must leave the subscription
 * cancelled, and event-id dedupe alone cannot express that.
 */
export async function grantEntitlement(
  db: Database,
  tenantId: string,
  input: GrantEntitlementInput
): Promise<boolean> {
  const { scopeKind, scopeRef } = scopeColumns(input.scope);

  const existing = await getEntitlement(db, tenantId, input.member, input.scope);
  if (existing && existing.lastEventAt > input.eventAt) return false;

  const values = {
    status: "active" as const,
    source: input.source,
    externalRef: input.externalRef ?? null,
    expiresAt: input.expiresAt ?? null,
    revokedAt: null,
    lastEventAt: input.eventAt,
  };

  await db
    .insert(entitlement)
    .values({
      tenantId,
      memberIssuer: input.member.issuer,
      memberSubject: input.member.subject,
      scopeKind,
      scopeRef,
      ...values,
    })
    .onConflictDoUpdate({
      target: [
        entitlement.tenantId,
        entitlement.memberIssuer,
        entitlement.memberSubject,
        entitlement.scopeKind,
        entitlement.scopeRef,
      ],
      set: values,
    });

  return true;
}

export interface RevokeEntitlementInput {
  member: MemberIdentity;
  scope: EntitlementScope;
  /** Epoch seconds of the provider event driving this. Guards ordering. */
  eventAt: number;
}

/**
 * Revoke an entitlement. Same ordering guard as `grantEntitlement`.
 *
 * The row is kept rather than deleted so a later resubscribe reuses it and the
 * revocation stays visible for support.
 */
export async function revokeEntitlement(
  db: Database,
  tenantId: string,
  input: RevokeEntitlementInput
): Promise<boolean> {
  const { scopeKind, scopeRef } = scopeColumns(input.scope);

  const existing = await getEntitlement(db, tenantId, input.member, input.scope);
  if (!existing) return false;
  if (existing.lastEventAt > input.eventAt) return false;

  await db
    .update(entitlement)
    .set({ status: "revoked", revokedAt: input.eventAt, lastEventAt: input.eventAt })
    .where(
      and(
        eq(entitlement.tenantId, tenantId),
        eq(entitlement.memberIssuer, input.member.issuer),
        eq(entitlement.memberSubject, input.member.subject),
        eq(entitlement.scopeKind, scopeKind),
        eq(entitlement.scopeRef, scopeRef)
      )
    );

  return true;
}

// --- Payment customers ---

export async function upsertPaymentCustomer(
  db: Database,
  tenantId: string,
  member: MemberIdentity,
  provider: string,
  customerRef: string
): Promise<void> {
  await db
    .insert(paymentCustomer)
    .values({
      tenantId,
      memberIssuer: member.issuer,
      memberSubject: member.subject,
      provider,
      customerRef,
    })
    .onConflictDoUpdate({
      target: [
        paymentCustomer.tenantId,
        paymentCustomer.memberIssuer,
        paymentCustomer.memberSubject,
        paymentCustomer.provider,
      ],
      set: { customerRef, updatedAt: new Date().toISOString() },
    });
}

export async function getPaymentCustomerRef(
  db: Database,
  tenantId: string,
  member: MemberIdentity,
  provider: string
): Promise<string | null> {
  const rows = await db
    .select({ customerRef: paymentCustomer.customerRef })
    .from(paymentCustomer)
    .where(
      and(
        eq(paymentCustomer.tenantId, tenantId),
        eq(paymentCustomer.memberIssuer, member.issuer),
        eq(paymentCustomer.memberSubject, member.subject),
        eq(paymentCustomer.provider, provider)
      )
    )
    .limit(1);
  return rows.length > 0 ? rows[0].customerRef : null;
}
