// Payments — entitlements, the paywall gate, and (from M2) payment providers.
//
// Consumed by hosts through the package barrel in `src/index.ts`; this file is
// the slice's own barrel so the internal file layout stays free to change.

export {
  resolvePageAccess,
  redactPage,
  getReadableContent,
  requiresPrivateCache,
} from "./access.js";
export { buildTeaser } from "./teaser.js";
export {
  nowSeconds,
  listPaidTiers,
  getActivePaidTier,
  getPaidTierById,
  upsertPaidTier,
  deletePaidTier,
  hasPageAccess,
  listMemberEntitlements,
  getEntitlement,
  grantEntitlement,
  revokeEntitlement,
  upsertPaymentCustomer,
  getPaymentCustomerRef,
} from "./db.js";
export { toAccessTier, ACCESS_TIERS, DEFAULT_TEASER_WORDS } from "./types.js";

// --- Payment providers (M2) ---
export { createPaymentsRoutes } from "./routes.js";
export { createPaymentsWebhookRoutes } from "./webhook.js";
export { applyEntitlementEvents } from "./events.js";
export {
  createPaymentProvider,
  createSiteSettingsPaymentSource,
  getTenantPaymentsConfig,
  resolvePaymentsConfig,
  isPaymentsConfigured,
  SETTING_PAYMENTS_PROVIDER,
  SETTING_PAYMENTS_PUBLISHABLE_KEY,
  SETTING_PAYMENTS_SECRET_KEY_ENC,
  SETTING_PAYMENTS_WEBHOOK_SECRET_ENC,
} from "./config.js";
export {
  createStripeProvider,
  mapStripeEventToEntitlementEvents,
  invoiceMetadata,
  ENTITLEMENT_GRACE_SECONDS,
} from "./adapters/stripe.js";

export type {
  AccessTier,
  AccessDecision,
  PageAccessOptions,
  PaidTier,
  Entitlement,
  EntitlementScope,
} from "./types.js";
export type { TeaserOptions } from "./teaser.js";
export type { GrantEntitlementInput, RevokeEntitlementInput } from "./db.js";
export type {
  PaymentProvider,
  PaymentProviderSource,
  CheckoutRequest,
  CheckoutSession,
  EntitlementEvent,
} from "./provider.js";
export type { PaymentsConfig } from "./config.js";
export type { PaymentsRouterOptions } from "./routes.js";
export type { PaymentsWebhookOptions } from "./webhook.js";
export type { ApplyResult } from "./events.js";
