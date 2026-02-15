import type { SubscriptionSettings } from "./types.js";
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

// --- Mailgun provider (fetch-based, no SDK) ---

class MailgunProvider implements EmailProvider {
  private apiKey: string;
  private domain: string;
  private from: string;

  constructor(apiKey: string, domain: string, fromName: string, fromEmail: string) {
    this.apiKey = apiKey;
    this.domain = domain;
    this.from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    const url = `https://api.mailgun.net/v3/${this.domain}/messages`;
    const body = new URLSearchParams({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${this.apiKey}`).toString("base64")}`,
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Mailgun error (${response.status}): ${text}`);
    }
  }
}

/** Create an email provider from the subscription settings. */
export function createEmailProvider(settings: SubscriptionSettings): EmailProvider | null {
  if (!settings.apiKey || !settings.domain || !settings.fromEmail) {
    return null;
  }

  switch (settings.provider) {
    case "mailgun":
      return new MailgunProvider(
        settings.apiKey,
        settings.domain,
        settings.fromName,
        settings.fromEmail
      );
    default:
      return null;
  }
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
