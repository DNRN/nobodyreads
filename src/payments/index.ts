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
