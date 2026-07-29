import type { MemberIdentity } from "../community/types.js";
import type { EntitlementScope } from "./types.js";

/**
 * The seam between "we sell things" and "Stripe".
 *
 * Adapters get **no `Database`**, mirroring the AI adapters. That is what lets
 * `.me` reuse this package's Stripe event mapper — the semantics of "what does
 * `invoice.paid` mean for an entitlement" — without inheriting OSS's storage
 * decisions. Anything an adapter needs from the database is passed in.
 */

export interface CheckoutRequest {
  tenantId: string;
  member: MemberIdentity;
  scope: EntitlementScope;
  /** Resolved server-side from `paid_tier` / `page.price_amount`. Minor units. */
  amount: number;
  currency: string;
  /** Human label shown on the Stripe Checkout page. */
  productName: string;
  successUrl: string;
  cancelUrl: string;
  /** Existing provider customer id, when the reader has bought before. */
  customerRef?: string | null;
  /** Reader's email, when known — prefills Checkout. */
  email?: string | null;
}

export interface CheckoutSession {
  /** Where to send the reader. */
  url: string;
  /** Provider session id, for logs and support. */
  sessionId: string;
}

/**
 * A normalized, provider-agnostic statement of "this member's access changed".
 *
 * Two fields carry more weight than they look like they do:
 *
 * **`occurredAt`** (epoch seconds) is the *ordering* key. An event-id set alone
 * cannot fix out-of-order delivery: if `customer.subscription.deleted` lands
 * before a straggling `.updated`, id-only dedupe happily re-grants a cancelled
 * subscription. The `entitlement.last_event_at` guard — apply only when
 * `occurredAt > last_event_at` — is what actually makes the webhook correct.
 *
 * **`customerRef`** is passed *in*, never looked up. See the note above about
 * adapters and `Database`.
 */
export interface EntitlementEvent {
  /** Provider event id. The idempotency key. */
  eventId: string;
  /** Epoch seconds at the provider. The ordering key. */
  occurredAt: number;
  provider: string;
  /** Event kind, kept for the `payment_event` audit row. */
  kind: string;
  tenantId: string;
  member: MemberIdentity;
  scope: EntitlementScope;
  action: "grant" | "revoke";
  /** Epoch seconds; null = never expires. Ignored for `revoke`. */
  expiresAt: number | null;
  /** Provider-side subscription / payment id. */
  externalRef: string | null;
  customerRef?: string | null;
  /**
   * Money, for hosts that keep a ledger. OSS itself does not — a self-hoster
   * has no commission to compute — but `.me` needs the amounts and would
   * otherwise have to re-parse the raw event.
   */
  amount?: number | null;
  currency?: string | null;
}

export interface PaymentProvider {
  /** Provider id, e.g. "stripe". Recorded on `payment_event`. */
  readonly id: string;

  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;

  /**
   * Verify the signature and normalize the payload.
   *
   * MUST throw on a bad signature — the route turns that into a 400 and only a
   * 400. An empty array means "recognised, nothing to do", which is a 200.
   */
  handleWebhook(req: Request): Promise<EntitlementEvent[]>;

  /**
   * Provider-hosted management portal. `null` when this reader has no account
   * at the provider — there is nothing to manage yet, which is not an error.
   */
  getManageUrl(input: {
    member: MemberIdentity;
    customerRef: string;
    returnUrl: string;
  }): Promise<string | null>;
}

/**
 * How a host supplies a provider, per tenant.
 *
 * A bare function type, sync-or-async, with `null` as the documented off
 * switch — the same shape as Phase 4's `RulesetSource`, defaulted **at the use
 * site** rather than in the type:
 *
 * ```ts
 * const source = options.paymentProvider ?? createSiteSettingsPaymentSource(db);
 * ```
 */
export type PaymentProviderSource = (
  tenantId: string
) => PaymentProvider | null | Promise<PaymentProvider | null>;
