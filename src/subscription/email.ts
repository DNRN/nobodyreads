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
  /** Optional Reply-To address. Useful when the verified sender differs from
   * the address replies should go to (e.g. a per-tenant contact address). */
  replyTo?: string;
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

/**
 * Something that can be resolved into an email provider at request time:
 * an already-built {@link EmailProvider}, an {@link EmailConfig} to build one
 * from, or `null`/`undefined` to fall back to the file-based config.
 */
export type EmailResolvable = EmailProvider | EmailConfig | null | undefined;

/** Type guard: is this an already-built provider instance? */
export function isEmailProvider(value: unknown): value is EmailProvider {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as EmailProvider).sendEmail === "function"
  );
}

/**
 * Resolve an {@link EmailResolvable} into a concrete provider.
 *
 * - An {@link EmailProvider} instance is returned as-is (always enabled).
 * - An {@link EmailConfig} is passed to {@link createEmailProvider}.
 * - `null`/`undefined` falls back to the file-based config on disk.
 */
export function resolveEmailProvider(
  email?: EmailResolvable
): EmailProvider | null {
  if (isEmailProvider(email)) return email;
  return createEmailProvider(email ?? undefined);
}

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

// --- Lettermint provider (fetch-based, no SDK) ---

class LettermintProvider implements EmailProvider {
  private apiToken: string;
  private fromName: string;
  private fromEmail: string;
  private replyTo?: string;

  constructor(
    apiToken: string,
    fromName: string,
    fromEmail: string,
    replyTo?: string
  ) {
    this.apiToken = apiToken;
    this.fromName = fromName;
    this.fromEmail = fromEmail;
    this.replyTo = replyTo;
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    const body: Record<string, unknown> = {
      from: `${this.fromName} <${this.fromEmail}>`,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    };

    if (this.replyTo) {
      body.reply_to = [this.replyTo];
    }

    const response = await fetch("https://api.lettermint.co/v1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-lettermint-token": this.apiToken,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Lettermint error (${response.status}): ${text}`);
    }
  }
}

// Register the built-in Lettermint provider
registerEmailProvider("lettermint", ({ from, options }) => {
  const apiToken =
    typeof options.apiToken === "string" ? options.apiToken : undefined;

  if (!apiToken || !from.email) return null;
  return new LettermintProvider(apiToken, from.name, from.email, from.replyTo);
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
      replyTo: z.string().optional(),
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
    from: {
      name: cfg.from?.name ?? "",
      email: cfg.from?.email ?? "",
      replyTo: cfg.from?.replyTo,
    },
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
