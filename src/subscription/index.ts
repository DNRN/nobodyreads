import type { IncomingMessage, ServerResponse } from "node:http";
import type { Client } from "@libsql/client";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import { redirect, parseFormBody } from "../shared/http.js";
import {
  getSubscriptionSettings,
  saveSubscriptionSettings,
  addSubscriber,
  verifySubscriber,
  unsubscribeById,
  listVerifiedSubscribers,
  deleteSubscriber,
} from "./db.js";
import type { SubscriptionSettings } from "./types.js";
import {
  createEmailProvider,
  sendVerificationEmail,
  sendNewPostNotification,
} from "./email.js";

// --- Public API ---

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
) => Promise<void>;

export interface SubscriptionRouterOptions {
  db: Client;
  tenantId?: string;
  urlPrefix?: string;
}

/**
 * Create the subscription request handler.
 *
 * Public routes:
 *   POST /api/subscribe           — submit email
 *   GET  /api/subscribe/verify    — verify email via token
 *   GET  /api/unsubscribe         — unsubscribe via id
 *
 * Admin routes:
 *   POST /admin/settings/save     — save subscription settings
 *   POST /admin/subscribers/delete/:id — delete subscriber
 */
export function createSubscriptionRouter(
  options: SubscriptionRouterOptions
): RequestHandler {
  const { db } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const urlPrefix = options.urlPrefix ?? "";
  const adminBase = `${urlPrefix}/admin`;

  return async (req, res, pathname) => {
    const siteUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const siteName = process.env.SITE_NAME || "nobodyreads.me";

    // --- POST /api/subscribe ---
    if (pathname === "/api/subscribe" && req.method === "POST") {
      const body = await parseFormBody(req);
      const email = (body.email || "").trim().toLowerCase();

      if (!email || !isValidEmail(email)) {
        return respondHtml(res, 400, "Invalid email", "Please provide a valid email address.", siteUrl);
      }

      const settings = await getSubscriptionSettings(db, tenantId);
      if (!settings.enabled) {
        return respondHtml(res, 403, "Subscriptions disabled", "Email subscriptions are not currently available.", siteUrl);
      }

      const { token, alreadySubscribed } = await addSubscriber(db, tenantId, email);

      if (alreadySubscribed) {
        return respondHtml(res, 200, "Already subscribed", "You're already subscribed. You'll be notified when new posts are published.", siteUrl);
      }

      // Send verification email
      const provider = createEmailProvider(settings);
      if (provider && token) {
        try {
          await sendVerificationEmail(provider, siteUrl, siteName, email, token);
        } catch (err) {
          console.error("Failed to send verification email:", err);
          return respondHtml(res, 500, "Email error", "We couldn't send the verification email. Please try again later.", siteUrl);
        }
      }

      return respondHtml(res, 200, "Check your email", "We've sent you a confirmation email. Please click the link to verify your subscription.", siteUrl);
    }

    // --- GET /api/subscribe/verify ---
    if (pathname === "/api/subscribe/verify" && req.method === "GET") {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const token = url.searchParams.get("token") || "";

      if (!token) {
        return respondHtml(res, 400, "Invalid link", "This verification link is invalid.", siteUrl);
      }

      const verified = await verifySubscriber(db, tenantId, token);

      if (verified) {
        return respondHtml(res, 200, "Subscription confirmed", "You're now subscribed! You'll receive an email when new posts are published.", siteUrl);
      }

      return respondHtml(res, 400, "Invalid or expired link", "This verification link is no longer valid. It may have already been used.", siteUrl);
    }

    // --- GET /api/unsubscribe ---
    if (pathname === "/api/unsubscribe" && req.method === "GET") {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const id = url.searchParams.get("id") || "";

      if (!id) {
        return respondHtml(res, 400, "Invalid link", "This unsubscribe link is invalid.", siteUrl);
      }

      const result = await unsubscribeById(db, tenantId, id);

      if (result) {
        return respondHtml(res, 200, "Unsubscribed", "You've been unsubscribed and won't receive any more emails.", siteUrl);
      }

      return respondHtml(res, 200, "Already unsubscribed", "You're already unsubscribed.", siteUrl);
    }

    // --- POST /admin/settings/save ---
    if (pathname === "/admin/settings/save" && req.method === "POST") {
      const body = await parseFormBody(req);

      const settings: SubscriptionSettings = {
        enabled: body.enabled === "on",
        provider: "mailgun",
        apiKey: (body.apiKey || "").trim(),
        domain: (body.domain || "").trim(),
        fromName: (body.fromName || "").trim(),
        fromEmail: (body.fromEmail || "").trim(),
      };

      await saveSubscriptionSettings(db, tenantId, settings);
      return redirect(res, `${adminBase}/settings`);
    }

    // --- POST /admin/subscribers/delete/:id ---
    const deleteMatch = pathname.match(
      /^\/admin\/subscribers\/delete\/([a-zA-Z0-9_-]+)$/
    );
    if (deleteMatch && req.method === "POST") {
      await deleteSubscriber(db, tenantId, deleteMatch[1]);
      return redirect(res, `${adminBase}/settings`);
    }
  };
}

/**
 * Send new-post notifications to all verified subscribers.
 * Call this when a post transitions from draft to published.
 * Runs asynchronously — errors are logged, not thrown.
 */
export async function notifySubscribers(
  db: Client,
  tenantId: string,
  post: { title: string; slug: string; excerpt: string }
): Promise<void> {
  try {
    const settings = await getSubscriptionSettings(db, tenantId);
    if (!settings.enabled) return;

    const provider = createEmailProvider(settings);
    if (!provider) return;

    const subscribers = await listVerifiedSubscribers(db, tenantId);
    if (subscribers.length === 0) return;

    const siteUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const siteName = process.env.SITE_NAME || "nobodyreads.me";

    await sendNewPostNotification(provider, siteUrl, siteName, post, subscribers);
    console.log(`Sent new-post notification to ${subscribers.length} subscriber(s)`);
  } catch (err) {
    console.error("Failed to send subscriber notifications:", err);
  }
}

// --- Utility ---

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function respondHtml(
  res: ServerResponse,
  status: number,
  title: string,
  message: string,
  siteUrl: string
): void {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 80px auto; padding: 20px; text-align: center; color: #333; }
    h1 { font-size: 1.4rem; margin-bottom: 0.5rem; }
    p { color: #666; line-height: 1.5; }
    a { color: #333; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  <p><a href="${escapeHtml(siteUrl)}">&larr; Back to site</a></p>
</body>
</html>`.trim();

  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
