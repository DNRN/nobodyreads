import type { Database } from "../db/index.js";
import { getSiteSettings } from "../shared/site-settings.js";
import { decryptSecret } from "../shared/secrets.js";
import type { PaymentProvider, PaymentProviderSource } from "./provider.js";
import { createStripeProvider } from "./adapters/stripe.js";

// --- Per-tenant payment settings keys (site_settings) ---
export const SETTING_PAYMENTS_PROVIDER = "payments_provider";
export const SETTING_PAYMENTS_PUBLISHABLE_KEY = "payments_publishable_key";
/** Encrypted (see `secrets.ts`). Never returned to a client. */
export const SETTING_PAYMENTS_SECRET_KEY_ENC = "payments_secret_key_enc";
/** Encrypted. The webhook signing secret. */
export const SETTING_PAYMENTS_WEBHOOK_SECRET_ENC = "payments_webhook_secret_enc";

export interface PaymentsConfig {
  provider: string;
  secretKey: string;
  webhookSecret?: string;
  publishableKey?: string;
}

/**
 * Build a provider from config.
 *
 * The `default:` branch returns **`null`**, not a fallback adapter. This is a
 * deliberate divergence from `createThemeProvider`, which falls through to
 * `openai-compatible` because a sane generic default exists there. There is no
 * sane default *merchant*: guessing would mean charging a reader through
 * someone's account by accident. Unknown config means payments are off.
 *
 * Never throws at construction — same guarantee as the theme provider, so a
 * misconfigured tenant degrades to "no checkout button" rather than a 500 on
 * every page.
 */
export function createPaymentProvider(config: PaymentsConfig | undefined): PaymentProvider | null {
  if (!config?.secretKey) return null;

  switch (config.provider) {
    case "stripe":
      return createStripeProvider({
        secretKey: config.secretKey,
        webhookSecret: config.webhookSecret,
      });
    default:
      return null;
  }
}

/**
 * Read a tenant's own payment config from `site_settings`, or `undefined`.
 *
 * Self-hosters bring their own Stripe keys this way and pay no commission.
 * `.me` does not use this path — it supplies a platform-level provider through
 * `PaymentProviderSource` instead.
 */
export async function getTenantPaymentsConfig(
  db: Database,
  tenantId: string
): Promise<PaymentsConfig | undefined> {
  const settings = await getSiteSettings(db, tenantId);

  const provider = settings[SETTING_PAYMENTS_PROVIDER];
  const secretKey = decryptSecret(settings[SETTING_PAYMENTS_SECRET_KEY_ENC]);
  if (!provider || !secretKey) return undefined;

  return {
    provider,
    secretKey,
    webhookSecret: decryptSecret(settings[SETTING_PAYMENTS_WEBHOOK_SECRET_ENC]) ?? undefined,
    publishableKey: settings[SETTING_PAYMENTS_PUBLISHABLE_KEY] || undefined,
  };
}

/**
 * Resolve payment config from the environment. The single-tenant self-host path.
 */
export function resolvePaymentsConfig(): PaymentsConfig | undefined {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return undefined;

  return {
    provider: process.env.PAYMENTS_PROVIDER || "stripe",
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || undefined,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || undefined,
  };
}

/**
 * The default {@link PaymentProviderSource}: a tenant's stored keys, falling
 * back to the deployment's environment.
 *
 * Providers are cached per tenant because constructing a Stripe client sets up
 * an HTTP agent; rebuilding one per request would be wasteful. The cache keys
 * on the resolved secret so rotating a key takes effect without a restart.
 */
export function createSiteSettingsPaymentSource(db: Database): PaymentProviderSource {
  const cache = new Map<string, { key: string; provider: PaymentProvider | null }>();

  return async (tenantId: string) => {
    const config = (await getTenantPaymentsConfig(db, tenantId)) ?? resolvePaymentsConfig();
    if (!config) return null;

    const cacheKey = `${config.provider}:${config.secretKey}:${config.webhookSecret ?? ""}`;
    const cached = cache.get(tenantId);
    if (cached && cached.key === cacheKey) return cached.provider;

    const provider = createPaymentProvider(config);
    cache.set(tenantId, { key: cacheKey, provider });
    return provider;
  };
}

/**
 * Whether a tenant has payments configured at all — for showing or hiding the
 * creator UI. Not a gate: never decide access with this.
 */
export async function isPaymentsConfigured(db: Database, tenantId: string): Promise<boolean> {
  return Boolean((await getTenantPaymentsConfig(db, tenantId)) ?? resolvePaymentsConfig());
}
