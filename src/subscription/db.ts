import type { Client, Row } from "@libsql/client";
import { randomUUID, randomBytes } from "node:crypto";
import type { Subscriber, SubscriptionSettings } from "./types.js";
import { DEFAULT_SUBSCRIPTION_SETTINGS } from "./types.js";

// --- Row mapper ---

function rowToSubscriber(row: Row): Subscriber {
  return {
    id: row.subscriber_id as string,
    email: row.email as string,
    verified: (row.verified as number) === 1,
    verifyToken: row.verify_token ? (row.verify_token as string) : null,
    createdAt: row.created_at as string,
    verifiedAt: row.verified_at ? (row.verified_at as string) : null,
    unsubscribed: (row.unsubscribed as number) === 1,
    unsubscribedAt: row.unsubscribed_at
      ? (row.unsubscribed_at as string)
      : null,
  };
}

// --- Settings ---

/** Read subscription settings from the site_settings table. */
export async function getSubscriptionSettings(
  db: Client,
  tenantId: string
): Promise<SubscriptionSettings> {
  const result = await db.execute({
    sql: `SELECT key, value FROM site_settings WHERE tenant_id = ? AND key LIKE 'subscription.%'`,
    args: [tenantId],
  });

  const settings = { ...DEFAULT_SUBSCRIPTION_SETTINGS };

  for (const row of result.rows) {
    const key = (row.key as string).replace("subscription.", "");
    const value = row.value as string;
    switch (key) {
      case "enabled":
        settings.enabled = value === "true";
        break;
      case "provider":
        settings.provider = value as SubscriptionSettings["provider"];
        break;
      case "apiKey":
        settings.apiKey = value;
        break;
      case "domain":
        settings.domain = value;
        break;
      case "fromName":
        settings.fromName = value;
        break;
      case "fromEmail":
        settings.fromEmail = value;
        break;
    }
  }

  // Env-var fallbacks (env vars override only when DB values are empty)
  if (!settings.apiKey && process.env.MAILGUN_API_KEY) {
    settings.apiKey = process.env.MAILGUN_API_KEY;
  }
  if (!settings.domain && process.env.MAILGUN_DOMAIN) {
    settings.domain = process.env.MAILGUN_DOMAIN;
  }

  return settings;
}

/** Persist subscription settings to the site_settings table. */
export async function saveSubscriptionSettings(
  db: Client,
  tenantId: string,
  settings: SubscriptionSettings
): Promise<void> {
  const pairs: [string, string][] = [
    ["subscription.enabled", String(settings.enabled)],
    ["subscription.provider", settings.provider],
    ["subscription.apiKey", settings.apiKey],
    ["subscription.domain", settings.domain],
    ["subscription.fromName", settings.fromName],
    ["subscription.fromEmail", settings.fromEmail],
  ];

  for (const [key, value] of pairs) {
    await db.execute({
      sql: `INSERT INTO site_settings (tenant_id, key, value) VALUES (?, ?, ?)
            ON CONFLICT (tenant_id, key) DO UPDATE SET value = excluded.value`,
      args: [tenantId, key, value],
    });
  }
}

// --- Subscribers ---

/**
 * Add a new subscriber. Returns the verify token.
 * If the email already exists and is unverified, resets the token.
 * If verified and not unsubscribed, returns null (already subscribed).
 */
export async function addSubscriber(
  db: Client,
  tenantId: string,
  email: string
): Promise<{ token: string | null; alreadySubscribed: boolean }> {
  const normalizedEmail = email.trim().toLowerCase();
  const verifyToken = randomBytes(32).toString("hex");

  // Check if subscriber already exists
  const existing = await db.execute({
    sql: `SELECT subscriber_id, verified, unsubscribed, verify_token
          FROM subscriber WHERE email = ? AND tenant_id = ? LIMIT 1`,
    args: [normalizedEmail, tenantId],
  });

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    const verified = (row.verified as number) === 1;
    const unsubscribed = (row.unsubscribed as number) === 1;

    if (verified && !unsubscribed) {
      return { token: null, alreadySubscribed: true };
    }

    // Re-subscribe or re-send verification
    await db.execute({
      sql: `UPDATE subscriber
            SET verify_token = ?, verified = 0, verified_at = NULL,
                unsubscribed = 0, unsubscribed_at = NULL
            WHERE subscriber_id = ? AND tenant_id = ?`,
      args: [verifyToken, row.subscriber_id as string, tenantId],
    });

    return { token: verifyToken, alreadySubscribed: false };
  }

  // New subscriber
  const subscriberId = randomUUID();
  await db.execute({
    sql: `INSERT INTO subscriber (subscriber_id, tenant_id, email, verify_token)
          VALUES (?, ?, ?, ?)`,
    args: [subscriberId, tenantId, normalizedEmail, verifyToken],
  });

  return { token: verifyToken, alreadySubscribed: false };
}

/** Verify a subscriber by their token. Returns true if successful. */
export async function verifySubscriber(
  db: Client,
  tenantId: string,
  token: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `UPDATE subscriber
          SET verified = 1, verified_at = ?, verify_token = NULL
          WHERE verify_token = ? AND tenant_id = ? AND verified = 0`,
    args: [now, token, tenantId],
  });
  return result.rowsAffected > 0;
}

/** Unsubscribe by email or by token (used in unsubscribe links). */
export async function unsubscribeByEmail(
  db: Client,
  tenantId: string,
  email: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `UPDATE subscriber
          SET unsubscribed = 1, unsubscribed_at = ?
          WHERE email = ? AND tenant_id = ? AND unsubscribed = 0`,
    args: [now, email.trim().toLowerCase(), tenantId],
  });
  return result.rowsAffected > 0;
}

/** Unsubscribe by subscriber id (used in unsubscribe links). */
export async function unsubscribeById(
  db: Client,
  tenantId: string,
  subscriberId: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `UPDATE subscriber
          SET unsubscribed = 1, unsubscribed_at = ?
          WHERE subscriber_id = ? AND tenant_id = ? AND unsubscribed = 0`,
    args: [now, subscriberId, tenantId],
  });
  return result.rowsAffected > 0;
}

/** List all verified, active subscribers (for sending notifications). */
export async function listVerifiedSubscribers(
  db: Client,
  tenantId: string
): Promise<Subscriber[]> {
  const result = await db.execute({
    sql: `SELECT subscriber_id, email, verified, verify_token, created_at,
                 verified_at, unsubscribed, unsubscribed_at
          FROM subscriber
          WHERE tenant_id = ? AND verified = 1 AND unsubscribed = 0
          ORDER BY created_at ASC`,
    args: [tenantId],
  });
  return result.rows.map(rowToSubscriber);
}

/** List all subscribers for admin view. */
export async function listAllSubscribers(
  db: Client,
  tenantId: string
): Promise<Subscriber[]> {
  const result = await db.execute({
    sql: `SELECT subscriber_id, email, verified, verify_token, created_at,
                 verified_at, unsubscribed, unsubscribed_at
          FROM subscriber
          WHERE tenant_id = ?
          ORDER BY created_at DESC`,
    args: [tenantId],
  });
  return result.rows.map(rowToSubscriber);
}

/** Hard-delete a subscriber (admin action). */
export async function deleteSubscriber(
  db: Client,
  tenantId: string,
  subscriberId: string
): Promise<void> {
  await db.execute({
    sql: `DELETE FROM subscriber WHERE subscriber_id = ? AND tenant_id = ?`,
    args: [subscriberId, tenantId],
  });
}
