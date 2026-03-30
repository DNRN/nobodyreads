import type { Subscriber } from "./types.js";

// --- Email provider abstraction ---

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  sendEmail(message: EmailMessage): Promise<void>;
}

// --- Provider registry ---

/**
 * Registry for email providers.
 *
 * To add a custom provider, call `registerEmailProvider` with a name and a
 * factory function. The factory receives no arguments — it should read its own
 * configuration from `process.env` and return an `EmailProvider` instance, or
 * `null` if the required env vars are missing.
 *
 * Example:
 * ```ts
 * registerEmailProvider("sendgrid", () => {
 *   const apiKey = process.env.SENDGRID_API_KEY;
 *   if (!apiKey) return null;
 *   return new SendgridProvider(apiKey, getFromAddress());
 * });
 * ```
 */
const providers = new Map<string, () => EmailProvider | null>();

export function registerEmailProvider(
  name: string,
  factory: () => EmailProvider | null
): void {
  providers.set(name.toLowerCase(), factory);
}

// --- Mailjet provider (fetch-based, no SDK) ---

class MailjetProvider implements EmailProvider {
  private apiKey: string;
  private apiSecret: string;
  private fromName: string;
  private fromEmail: string;

  constructor(apiKey: string, apiSecret: string, fromName: string, fromEmail: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.fromName = fromName;
    this.fromEmail = fromEmail;
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    const url = "https://api.mailjet.com/v3.1/send";

    const body = {
      Messages: [
        {
          From: {
            Email: this.fromEmail,
            Name: this.fromName,
          },
          To: [{ Email: message.to }],
          Subject: message.subject,
          HTMLPart: message.html,
          TextPart: message.text,
        },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString("base64")}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Mailjet error (${response.status}): ${text}`);
    }
  }
}

// Register the built-in Mailjet provider
registerEmailProvider("mailjet", () => {
  const apiKey = process.env.MAILJET_API_KEY;
  const apiSecret = process.env.MAILJET_API_SECRET;
  const fromEmail = process.env.EMAIL_FROM_EMAIL;
  const fromName = process.env.EMAIL_FROM_NAME || "";

  if (!apiKey || !apiSecret || !fromEmail) return null;
  return new MailjetProvider(apiKey, apiSecret, fromName, fromEmail);
});

// --- Env helpers ---

/** Check whether email subscriptions are enabled via env. */
export function isEmailEnabled(): boolean {
  return process.env.EMAIL_ENABLED === "true";
}

/** Create an email provider based on the EMAIL_PROVIDER env var. */
export function createEmailProvider(): EmailProvider | null {
  const name = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  if (!name) return null;

  const factory = providers.get(name);
  if (!factory) {
    console.warn(`Unknown email provider "${name}". Registered providers: ${[...providers.keys()].join(", ")}`);
    return null;
  }

  return factory();
}

// --- Email templates ---

/** Send a double opt-in verification email. */
export async function sendVerificationEmail(
  provider: EmailProvider,
  siteUrl: string,
  siteName: string,
  email: string,
  token: string
): Promise<void> {
  const verifyUrl = `${siteUrl}/api/subscribe/verify?token=${encodeURIComponent(token)}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #333;">
  <h2>Confirm your subscription</h2>
  <p>You requested to receive email notifications when new posts are published on <strong>${escapeHtml(siteName)}</strong>.</p>
  <p>Please confirm by clicking the link below:</p>
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(verifyUrl)}" style="background: #333; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
      Confirm subscription
    </a>
  </p>
  <p style="font-size: 13px; color: #666;">If you didn't request this, you can safely ignore this email.</p>
</body>
</html>`.trim();

  const text = `Confirm your subscription to ${siteName}\n\nClick here to confirm: ${verifyUrl}\n\nIf you didn't request this, you can safely ignore this email.`;

  await provider.sendEmail({
    to: email,
    subject: `Confirm your subscription to ${siteName}`,
    html,
    text,
  });
}

/** Send a new-post notification to a list of subscribers. */
export async function sendNewPostNotification(
  provider: EmailProvider,
  siteUrl: string,
  siteName: string,
  post: { title: string; slug: string; excerpt: string },
  subscribers: Subscriber[]
): Promise<void> {
  const postUrl = `${siteUrl}/posts/${post.slug}`;

  for (const subscriber of subscribers) {
    const unsubscribeUrl = `${siteUrl}/api/unsubscribe?id=${encodeURIComponent(subscriber.id)}`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #333;">
  <h2>${escapeHtml(post.title)}</h2>
  ${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ""}
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(postUrl)}" style="background: #333; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
      Read post
    </a>
  </p>
  <p style="font-size: 13px; color: #666;">
    You're receiving this because you subscribed to ${escapeHtml(siteName)}.<br/>
    <a href="${escapeHtml(unsubscribeUrl)}" style="color: #666;">Unsubscribe</a>
  </p>
</body>
</html>`.trim();

    const text = `New post: ${post.title}\n\n${post.excerpt ? post.excerpt + "\n\n" : ""}Read it here: ${postUrl}\n\nUnsubscribe: ${unsubscribeUrl}`;

    try {
      await provider.sendEmail({
        to: subscriber.email,
        subject: `New post: ${post.title}`,
        html,
        text,
      });
    } catch (err) {
      console.error(`Failed to send notification to ${subscriber.email}:`, err);
    }
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
