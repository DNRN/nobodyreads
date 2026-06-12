import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { zValidator } from "@hono/zod-validator";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import type { Database } from "../db/index.js";
import { subscribeFormSchema } from "../db/validation.js";
import {
  addSubscriber,
  verifySubscriber,
  unsubscribeById,
  listVerifiedSubscribers,
  deleteSubscriber,
} from "./db.js";
import {
  resolveEmailProvider,
  sendVerificationEmail,
  sendNewPostNotification,
} from "./email.js";
import type { EmailResolvable } from "./email.js";

export interface SubscriptionRouterOptions {
  db: Database;
  tenantId?: string;
  urlPrefix?: string;
  /**
   * Email provider or config to use for this (sub-)site. When omitted, the
   * file-based config (`config/email.config.json` / `EMAIL_CONFIG`) is used.
   * Multi-tenant hosts pass a per-tenant config here.
   */
  email?: EmailResolvable;
  /** Absolute base URL for links in emails/responses (e.g. per-tenant site URL). */
  siteUrl?: string;
  /** Display name used in email subjects/branding. */
  siteName?: string;
}

/** Options for {@link notifySubscribers}. */
export interface NotifyOptions {
  email?: EmailResolvable;
  siteUrl?: string;
  siteName?: string;
}

function resolveSiteUrl(siteUrl?: string): string {
  return (
    siteUrl ||
    process.env.SITE_URL ||
    `http://localhost:${process.env.PORT || 3000}`
  );
}

function resolveSiteName(siteName?: string): string {
  return siteName || process.env.SITE_NAME || "nobodyreads.me";
}

/**
 * Public subscription routes. Mount at /api.
 *
 * Routes:
 *   POST /subscribe        — submit email
 *   GET  /subscribe/verify  — verify via token
 *   GET  /unsubscribe       — unsubscribe via id
 */
export function createSubscriptionApiRoutes(
  options: SubscriptionRouterOptions
): Hono {
  const { db } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const emailOption = options.email;
  const siteUrl = resolveSiteUrl(options.siteUrl);
  const siteName = resolveSiteName(options.siteName);

  const app = new Hono();

  app.post(
    "/subscribe",
    zValidator("form", subscribeFormSchema, (result, c) => {
      if (!result.success) {
        return respondHtml(
          c,
          400,
          "Invalid email",
          "Please provide a valid email address.",
          siteUrl
        );
      }
    }),
    async (c) => {
      const { email } = c.req.valid("form");

      const provider = resolveEmailProvider(emailOption);
      if (!provider) {
        return respondHtml(
          c,
          403,
          "Subscriptions disabled",
          "Email subscriptions are not currently available.",
          siteUrl
        );
      }

      const { token, alreadySubscribed, pendingVerification } =
        await addSubscriber(db, tenantId, email);

      if (alreadySubscribed) {
        return respondHtml(
          c,
          200,
          "Already subscribed",
          "You're already subscribed. You'll be notified when new posts are published.",
          siteUrl
        );
      }

      if (token) {
        try {
          await sendVerificationEmail(
            provider,
            siteUrl,
            siteName,
            email,
            token
          );
        } catch (err) {
          console.error("Failed to send verification email:", err);
          return respondHtml(
            c,
            500,
            "Email error",
            "We couldn't send the verification email. Please try again later.",
            siteUrl
          );
        }
      }

      if (pendingVerification) {
        return respondHtml(
          c,
          200,
          "Almost there",
          "This email is already signed up but not yet confirmed. We've re-sent the confirmation link — please check your inbox to validate your email.",
          siteUrl
        );
      }

      return respondHtml(
        c,
        200,
        "Check your email",
        "We've sent you a confirmation email. Please click the link to verify your subscription.",
        siteUrl
      );
    }
  );

  app.get("/subscribe/verify", async (c) => {
    const token = c.req.query("token") || "";

    if (!token) {
      return respondHtml(
        c,
        400,
        "Invalid link",
        "This verification link is invalid.",
        siteUrl
      );
    }

    const verified = await verifySubscriber(db, tenantId, token);
    if (verified) {
      return respondHtml(
        c,
        200,
        "Subscription confirmed",
        "You're now subscribed! You'll receive an email when new posts are published.",
        siteUrl
      );
    }

    return respondHtml(
      c,
      400,
      "Invalid or expired link",
      "This verification link is no longer valid. It may have already been used.",
      siteUrl
    );
  });

  app.get("/unsubscribe", async (c) => {
    const id = c.req.query("id") || "";

    if (!id) {
      return respondHtml(
        c,
        400,
        "Invalid link",
        "This unsubscribe link is invalid.",
        siteUrl
      );
    }

    const result = await unsubscribeById(db, tenantId, id);
    if (result) {
      return respondHtml(
        c,
        200,
        "Unsubscribed",
        "You've been unsubscribed and won't receive any more emails.",
        siteUrl
      );
    }

    return respondHtml(
      c,
      200,
      "Already unsubscribed",
      "You're already unsubscribed.",
      siteUrl
    );
  });

  return app;
}

/**
 * Admin subscription routes. Mount at /admin.
 *
 * Routes:
 *   POST /subscribers/delete/:id — delete a subscriber
 */
export function createSubscriptionAdminRoutes(
  options: SubscriptionRouterOptions
): Hono {
  const { db } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const urlPrefix = options.urlPrefix ?? "";
  const adminBase = `${urlPrefix}/admin`;

  const app = new Hono();

  app.post("/subscribers/delete/:id", async (c) => {
    const subscriberId = c.req.param("id");
    await deleteSubscriber(db, tenantId, subscriberId);
    return c.redirect(`${adminBase}/settings`);
  });

  return app;
}

/**
 * Send new-post notifications to all verified subscribers.
 * Call when a post transitions from draft to published.
 */
export async function notifySubscribers(
  db: Database,
  tenantId: string,
  post: { title: string; slug: string; excerpt: string },
  options: NotifyOptions = {}
): Promise<void> {
  try {
    const provider = resolveEmailProvider(options.email);
    if (!provider) return;

    const subscribers = await listVerifiedSubscribers(db, tenantId);
    if (subscribers.length === 0) return;

    const siteUrl = resolveSiteUrl(options.siteUrl);
    const siteName = resolveSiteName(options.siteName);

    await sendNewPostNotification(
      provider,
      siteUrl,
      siteName,
      post,
      subscribers
    );
    console.log(
      `Sent new-post notification to ${subscribers.length} subscriber(s)`
    );
  } catch (err) {
    console.error("Failed to send subscriber notifications:", err);
  }
}

// --- Utility ---

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function respondHtml(
  c: Context,
  status: number,
  title: string,
  message: string,
  siteUrl: string
): Response {
  const body = `<!DOCTYPE html>
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
</html>`;

  return c.html(body, status as ContentfulStatusCode);
}
