import { eq, and, desc, asc } from "drizzle-orm";
import { subscriber } from "../db/schema.js";
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

/**
 * Add a new subscriber. Returns the verify token.
 * If the email already exists and is unverified, resets the token.
 * If verified and not unsubscribed, returns null (already subscribed).
 */
export async function addSubscriber(
  db: Database,
  tenantId: string,
  email: string
): Promise<{ token: string | null; alreadySubscribed: boolean }> {
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
      return { token: null, alreadySubscribed: true };
    }

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

    return { token: verifyToken, alreadySubscribed: false };
  }

  const subscriberId = randomUUID();
  await db.insert(subscriber).values({
    subscriberId,
    tenantId,
    email: normalizedEmail,
    verifyToken,
  });

  return { token: verifyToken, alreadySubscribed: false };
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
