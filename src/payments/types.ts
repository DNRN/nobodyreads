import type { MemberIdentity } from "../community/types.js";

/**
 * How a page is gated.
 *
 * - `public`  — anyone can read it (the default, and the overwhelming majority)
 * - `members` — anyone who has joined the plot, free
 * - `paid`    — a tier subscriber, or someone who bought this single page
 */
export type AccessTier = "public" | "members" | "paid";

export const ACCESS_TIERS: readonly AccessTier[] = ["public", "members", "paid"];

/** Coerce untrusted input to a known tier. Unknown values fail closed to public
 * for *storage*; the gate separately fails closed to a teaser at read time. */
export function toAccessTier(value: unknown): AccessTier {
  return ACCESS_TIERS.includes(value as AccessTier) ? (value as AccessTier) : "public";
}

/** A subscription tier a plot offers. Amounts are minor units (cents). */
export interface PaidTier {
  id: string;
  name: string;
  description?: string;
  currency: string;
  amountMonthly: number | null;
  amountYearly: number | null;
  active: boolean;
  createdAt: string;
}

/**
 * What an entitlement covers.
 *
 * A `tier` entitlement unlocks every `paid` page on the plot; a `page`
 * entitlement unlocks exactly one. Multiple tiers per plot are Phase 5b, but
 * `scope_ref` already holds a tier id, so nothing needs redesigning for it.
 */
export type EntitlementScope =
  | { kind: "tier"; tierId: string; interval?: "month" | "year" }
  | { kind: "page"; pageId: string };

/** The stored form of an entitlement. */
export interface Entitlement {
  member: MemberIdentity;
  scopeKind: "tier" | "page";
  scopeRef: string;
  status: "active" | "revoked";
  source: string;
  externalRef: string | null;
  /** Epoch seconds; null = never expires. */
  expiresAt: number | null;
  revokedAt: number | null;
  lastEventAt: number;
}

/**
 * The outcome of the gate. `visibility: "full"` means the caller may render the
 * stored body; `"teaser"` means it must not.
 *
 * `reason` is for the UI and for debugging a support ticket — never branch on
 * it to decide whether to show the body. That is what `visibility` is for.
 */
export type AccessDecision =
  | {
      visibility: "full";
      reason: "public" | "owner" | "preview" | "entitled" | "member";
    }
  | {
      visibility: "teaser";
      reason: "members_only" | "payment_required";
      /** The tier to offer, when one is configured. */
      tier: PaidTier | null;
      /** Single-page purchase price in minor units, when the page sells one. */
      priceAmount: number | null;
      currency: string;
    };

export interface PageAccessOptions {
  /**
   * Whether the current viewer owns the plot.
   *
   * The host decides ownership; the package never does. Same contract as
   * `canModerate` on the comment routes — the package has no idea what a
   * platform session looks like.
   */
  isOwner?: boolean;
  /**
   * Render as if the viewer were someone else, for the owner's "preview as"
   * control. Ignored entirely unless `isOwner` is true.
   */
  previewAs?: "owner" | "member" | "public" | null;
  /** Words in a derived teaser when the page has no excerpt and no marker. */
  teaserWords?: number;
}

export const DEFAULT_TEASER_WORDS = 75;
