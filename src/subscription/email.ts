import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { z } from "zod";

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

/** Sender identity shared across providers. */
export interface EmailFrom {
  name: string;
  email: string;
}

/** Context handed to a provider factory, derived from the email config file. */
export interface EmailProviderContext {
  /** Sender identity from the `from` section of the config. */
  from: EmailFrom;
  /** Provider-specific options from the `options` section of the config. */
  options: Record<string, unknown>;
}

export type EmailProviderFactory = (
  ctx: EmailProviderContext
) => EmailProvider | null;

// --- Provider registry ---

/**
 * Registry for email providers.
 *
 * To add a custom provider, call `registerEmailProvider` with a name and a
 * factory function. The factory receives the resolved {@link EmailProviderContext}
 * (sender identity + provider-specific `options` from the config file) and
 * returns an `EmailProvider` instance, or `null` if required options are missing.
 *
 * Example:
 * ```ts
 * registerEmailProvider("sendgrid", ({ from, options }) => {
 *   const apiKey = options.apiKey;
 *   if (typeof apiKey !== "string") return null;
 *   return new SendgridProvider(apiKey, from);
 * });
 * ```
 */
const providers = new Map<string, EmailProviderFactory>();

export function registerEmailProvider(
  name: string,
  factory: EmailProviderFactory
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
registerEmailProvider("mailjet", ({ from, options }) => {
  const apiKey = typeof options.apiKey === "string" ? options.apiKey : undefined;
  const apiSecret =
    typeof options.apiSecret === "string" ? options.apiSecret : undefined;

  if (!apiKey || !apiSecret || !from.email) return null;
  return new MailjetProvider(apiKey, apiSecret, from.name, from.email);
});

// --- Configuration ---

export const emailConfigSchema = z.object({
  /** Master switch for email subscriptions. */
  enabled: z.boolean().optional().default(false),
  /** Registered provider name (e.g. "mailjet"). */
  provider: z.string().optional(),
  /** Sender identity used by providers. */
  from: z
    .object({
      name: z.string().optional().default(""),
      email: z.string().optional().default(""),
    })
    .optional(),
  /** Provider-specific options (e.g. API keys). */
  options: z.record(z.string(), z.unknown()).optional().default({}),
});

export type EmailConfig = z.infer<typeof emailConfigSchema>;

/** Default path (relative to cwd) where the email config file is looked up. */
export const DEFAULT_EMAIL_CONFIG_PATH = join("config", "email.config.json");

/**
 * Load and validate the email configuration from disk.
 *
 * Looks at `EMAIL_CONFIG` (if set) or `config/email.config.json` relative to the
 * current working directory. When no file is present, email is disabled.
 */
export function loadEmailConfig(): EmailConfig {
  const configPath =
    process.env.EMAIL_CONFIG || join(process.cwd(), DEFAULT_EMAIL_CONFIG_PATH);

  if (!existsSync(configPath)) {
    return { enabled: false, options: {} };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    throw new Error(
      `Failed to parse email config at ${configPath}: ${(err as Error).message}`
    );
  }

  const result = emailConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid email config at ${configPath}: ${result.error.message}`
    );
  }
  return result.data;
}

// --- Helpers ---

/**
 * Check whether email subscriptions are enabled. Reads
 * `config/email.config.json` unless an explicit config is provided.
 */
export function isEmailEnabled(config?: EmailConfig): boolean {
  return (config ?? loadEmailConfig()).enabled === true;
}

/**
 * Create an email provider from the email config file (or an explicit config).
 * Returns `null` when email is disabled, no provider is set, the provider is
 * unknown, or the provider's required options are missing.
 */
export function createEmailProvider(config?: EmailConfig): EmailProvider | null {
  const cfg = config ?? loadEmailConfig();
  if (!cfg.enabled) return null;

  const name = (cfg.provider ?? "").toLowerCase();
  if (!name) return null;

  const factory = providers.get(name);
  if (!factory) {
    console.warn(
      `Unknown email provider "${name}". Registered providers: ${[...providers.keys()].join(", ")}`
    );
    return null;
  }

  return factory({
    from: { name: cfg.from?.name ?? "", email: cfg.from?.email ?? "" },
    options: cfg.options,
  });
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
