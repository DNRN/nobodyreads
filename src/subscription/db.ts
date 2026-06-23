import { eq, and, desc, asc, sql } from "drizzle-orm";
import { subscriber } from "./schema.js";
import type { Database } from "../db/index.js";
import { randomUUID, randomBytes } from "node:crypto";
import type { Subscriber } from "./types.js";

// --- Row mapper ---

type SubscriberRow = typeof subscriber.$inferSelect;

function toSubscriber(row: SubscriberRow): Subscriber {
  return {
    id: row.subscriberId,
    email: row.email,
    verified: row.verified,
    verifyToken: row.verifyToken,
    createdAt: row.createdAt,
    verifiedAt: row.verifiedAt,
    unsubscribed: row.unsubscribed,
    unsubscribedAt: row.unsubscribedAt,
  };
}

// --- Subscribers ---

/** Outcome of an {@link addSubscriber} call. */
export interface AddSubscriberResult {
  /** Verify token to email out, or `null` when no email should be sent. */
  token: string | null;
  /** The email is already verified and active — nothing to do. */
  alreadySubscribed: boolean;
  /**
   * The email already exists but has not been confirmed yet. The token is
   * refreshed and re-sent so the caller can prompt the user to validate the
   * email they already signed up with.
   */
  pendingVerification: boolean;
}

/**
 * Add a new subscriber. Enforces one row per (email, tenant):
 *
 * - **New email** → insert, return a fresh token (`pendingVerification: false`).
 * - **Existing but unconfirmed** → refresh + return token with
 *   `pendingVerification: true` so the caller tells the user to validate.
 * - **Previously unsubscribed** → reactivate as a fresh opt-in (new token).
 * - **Verified & active** → `alreadySubscribed: true`, no token.
 */
export async function addSubscriber(
  db: Database,
  tenantId: string,
  email: string
): Promise<AddSubscriberResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const verifyToken = randomBytes(32).toString("hex");

  const existing = await db
    .select({
      subscriberId: subscriber.subscriberId,
      verified: subscriber.verified,
      unsubscribed: subscriber.unsubscribed,
    })
    .from(subscriber)
    .where(and(eq(subscriber.email, normalizedEmail), eq(subscriber.tenantId, tenantId)))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];

    if (row.verified && !row.unsubscribed) {
      return { token: null, alreadySubscribed: true, pendingVerification: false };
    }

    // A still-pending signup (never verified, not unsubscribed) is distinct
    // from a fresh opt-in after an explicit unsubscribe.
    const pendingVerification = !row.verified && !row.unsubscribed;

    await db
      .update(subscriber)
      .set({
        verifyToken,
        verified: false,
        verifiedAt: null,
        unsubscribed: false,
        unsubscribedAt: null,
      })
      .where(
        and(eq(subscriber.subscriberId, row.subscriberId), eq(subscriber.tenantId, tenantId))
      );

    return { token: verifyToken, alreadySubscribed: false, pendingVerification };
  }

  const subscriberId = randomUUID();
  await db.insert(subscriber).values({
    subscriberId,
    tenantId,
    email: normalizedEmail,
    verifyToken,
  });

  return { token: verifyToken, alreadySubscribed: false, pendingVerification: false };
}

/** Verify a subscriber by their token. Returns true if successful. */
export async function verifySubscriber(
  db: Database,
  tenantId: string,
  token: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .update(subscriber)
    .set({ verified: true, verifiedAt: now, verifyToken: null })
    .where(
      and(
        eq(subscriber.verifyToken, token),
        eq(subscriber.tenantId, tenantId),
        eq(subscriber.verified, false)
      )
    )
    .returning({ subscriberId: subscriber.subscriberId });
  return result.length > 0;
}

/** Unsubscribe by email. */
export async function unsubscribeByEmail(
  db: Database,
  tenantId: string,
  email: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .update(subscriber)
    .set({ unsubscribed: true, unsubscribedAt: now })
    .where(
      and(
        eq(subscriber.email, email.trim().toLowerCase()),
        eq(subscriber.tenantId, tenantId),
        eq(subscriber.unsubscribed, false)
      )
    )
    .returning({ subscriberId: subscriber.subscriberId });
  return result.length > 0;
}

/** Unsubscribe by subscriber id (used in unsubscribe links). */
export async function unsubscribeById(
  db: Database,
  tenantId: string,
  subscriberId: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .update(subscriber)
    .set({ unsubscribed: true, unsubscribedAt: now })
    .where(
      and(
        eq(subscriber.subscriberId, subscriberId),
        eq(subscriber.tenantId, tenantId),
        eq(subscriber.unsubscribed, false)
      )
    )
    .returning({ subscriberId: subscriber.subscriberId });
  return result.length > 0;
}

/** List all verified, active subscribers (for sending notifications). */
export async function listVerifiedSubscribers(
  db: Database,
  tenantId: string
): Promise<Subscriber[]> {
  const rows = await db
    .select()
    .from(subscriber)
    .where(
      and(
        eq(subscriber.tenantId, tenantId),
        eq(subscriber.verified, true),
        eq(subscriber.unsubscribed, false)
      )
    )
    .orderBy(asc(subscriber.createdAt));
  return rows.map(toSubscriber);
}

/** List all subscribers for admin view. */
export async function listAllSubscribers(
  db: Database,
  tenantId: string
): Promise<Subscriber[]> {
  const rows = await db
    .select()
    .from(subscriber)
    .where(eq(subscriber.tenantId, tenantId))
    .orderBy(desc(subscriber.createdAt));
  return rows.map(toSubscriber);
}

/** Aggregate subscriber counts by state, without loading any email addresses. */
export interface SubscriberCounts {
  verified: number;
  pending: number;
  unsubscribed: number;
  total: number;
}

/**
 * Count subscribers grouped by state for the admin view. Returns only
 * aggregate numbers — email addresses are never selected.
 */
export async function countSubscribers(
  db: Database,
  tenantId: string
): Promise<SubscriberCounts> {
  const rows = await db
    .select({
      verified: sql<number>`sum(case when ${subscriber.verified} = 1 and ${subscriber.unsubscribed} = 0 then 1 else 0 end)`,
      pending: sql<number>`sum(case when ${subscriber.verified} = 0 and ${subscriber.unsubscribed} = 0 then 1 else 0 end)`,
      unsubscribed: sql<number>`sum(case when ${subscriber.unsubscribed} = 1 then 1 else 0 end)`,
      total: sql<number>`count(*)`,
    })
    .from(subscriber)
    .where(eq(subscriber.tenantId, tenantId));

  const row = rows[0];
  return {
    verified: Number(row?.verified ?? 0),
    pending: Number(row?.pending ?? 0),
    unsubscribed: Number(row?.unsubscribed ?? 0),
    total: Number(row?.total ?? 0),
  };
}

/** Hard-delete a subscriber (admin action). */
export async function deleteSubscriber(
  db: Database,
  tenantId: string,
  subscriberId: string
): Promise<void> {
  await db
    .delete(subscriber)
    .where(
      and(eq(subscriber.subscriberId, subscriberId), eq(subscriber.tenantId, tenantId))
    );
}
