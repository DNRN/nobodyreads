import Stripe from "stripe";
import type { MemberIdentity } from "../../community/types.js";
import type {
  ChargeContext,
  ChargeContextResolver,
  CheckoutRequest,
  CheckoutSession,
  EntitlementEvent,
  PaymentProvider,
} from "../provider.js";
import type { EntitlementScope } from "../types.js";

/**
 * Stripe adapter.
 *
 * The `stripe` dependency earns its place through exactly one function:
 * `webhooks.constructEventAsync`. It does timing-safe HMAC comparison, enforces
 * a timestamp tolerance against replay, and handles the multiple signatures a
 * `Stripe-Signature` header carries during secret rotation. Hand-rolling that
 * is how signature verification gets quietly broken.
 */

const PROVIDER_ID = "stripe";

/**
 * Grace added to `current_period_end` before an entitlement expires.
 *
 * Without it, a card that fails on renewal day locks the reader out mid-dunning
 * — and Stripe usually recovers the payment a day or two later, so the lockout
 * was never necessary. Three days costs almost nothing and removes a whole
 * class of support ticket.
 *
 * The `.me` terms deliberately do NOT mention this window: delivering more than
 * we promise is the safe direction, and stating it would make a discretionary
 * kindness contractual. Do not "reconcile" the two by shortening this to match
 * the terms. Full reasoning: `nobodyreads.me/docs/payment/README.md`.
 */
export const ENTITLEMENT_GRACE_SECONDS = Number(
  process.env.ENTITLEMENT_GRACE_SECONDS || 3 * 24 * 60 * 60
);

// Metadata keys. Namespaced so they cannot collide with a creator's own.
const META_TENANT = "nbr_tenant";
const META_ISSUER = "nbr_issuer";
const META_SUBJECT = "nbr_subject";
const META_DISPLAY = "nbr_display";
const META_SCOPE_KIND = "nbr_scope_kind";
const META_SCOPE_REF = "nbr_scope_ref";

/**
 * Stripe Tax, for a host that is registered to collect it.
 *
 * Off by default, and every field below is applied inside one `enabled` branch,
 * so a self-hoster who has not set up Stripe Tax gets exactly the session this
 * adapter has always built. A host that *is* VAT-registered wants all of it —
 * which is why this lives here rather than in a platform's own fork.
 *
 * Enabling it on a Checkout session also enables it on the Subscription that
 * session creates, so renewals are taxed without any further work. That is the
 * property the whole recurring path leans on; it is not obvious from the API.
 */
export interface StripeTaxOptions {
  /** Master switch. Requires tax registrations on the Stripe account. */
  enabled: boolean;
  /**
   * Whether the configured price already includes tax. Defaults to inclusive:
   * a tier priced at €5 charges the reader €5 and carves the VAT out of it,
   * which is the only version where the reader pays what the plot advertises.
   */
  behavior?: "inclusive" | "exclusive";
  /** Stripe product tax code, e.g. `txcd_10000000` for digital services. */
  code?: string;
  /**
   * Collect customer VAT IDs. A valid cross-border EU business number makes the
   * sale a reverse charge, which comes back as zero tax on an unchanged gross —
   * a case the fee maths already handles, since it only ever subtracts.
   */
  collectTaxIds?: boolean;
}

export interface StripeProviderOptions {
  secretKey: string;
  webhookSecret?: string;
  /** Stripe Tax. Omitted or disabled leaves checkout exactly as it was. */
  tax?: StripeTaxOptions;
  /**
   * Recover who a charge belongs to when the event carries no metadata — which
   * is every subscription refund and dispute. See `ChargeContextResolver`.
   */
  resolveChargeContext?: ChargeContextResolver;
  /** Injectable for tests. */
  client?: Stripe;
}

export function createStripeProvider(options: StripeProviderOptions): PaymentProvider {
  const stripe = options.client ?? new Stripe(options.secretKey);
  const webhookSecret = options.webhookSecret;
  const tax = options.tax?.enabled ? options.tax : null;

  return {
    id: PROVIDER_ID,

    async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
      const metadata = buildMetadata(req.tenantId, req.member, req.scope);

      const priceData: Stripe.Checkout.SessionCreateParams.LineItem.PriceData = {
        currency: req.currency,
        unit_amount: req.amount,
        product_data: { name: req.productName },
      };

      if (tax) {
        // Required, not optional. `tax_behavior` defaults to "unspecified",
        // which Stripe rejects outright once automatic tax is on.
        priceData.tax_behavior = tax.behavior ?? "inclusive";
        if (tax.code) priceData.product_data!.tax_code = tax.code;
      }

      const isSubscription = req.scope.kind === "tier";
      if (isSubscription) {
        // Inline `price_data` rather than real Price objects, so the package
        // needs no product-catalog sync. The trade-off is that the customer
        // portal cannot switch monthly↔annual — deferred out of 5a on purpose.
        priceData.recurring = {
          interval: req.scope.kind === "tier" ? req.scope.interval ?? "month" : "month",
        };
      }

      const params: Stripe.Checkout.SessionCreateParams = {
        mode: isSubscription ? "subscription" : "payment",
        line_items: [{ price_data: priceData, quantity: 1 }],
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        client_reference_id: `${req.tenantId}:${req.member.issuer}:${req.member.subject}`,
        metadata,
      };

      if (req.customerRef) params.customer = req.customerRef;
      else if (req.email) params.customer_email = req.email;

      if (tax) {
        params.automatic_tax = { enabled: true };
        // Where the reader is, is what decides the rate. For a digital service
        // this is the location evidence, so it is collected rather than guessed.
        params.billing_address_collection = "required";
        if (tax.collectTaxIds) params.tax_id_collection = { enabled: true };

        // Only legal alongside `customer`, and mandatory there: with a saved
        // customer and automatic tax, Stripe refuses to create the session
        // unless it is allowed to write the checkout address back. That fails on
        // a reader's SECOND purchase, not their first, so it survives exactly
        // the kind of manual test pass that only ever buys once.
        if (params.customer) params.customer_update = { address: "auto", name: "auto" };
      }

      // The classic footgun: metadata set only on the Session is *not* carried
      // by `customer.subscription.updated` / `.deleted`, which carry the
      // **subscription's** metadata. Without this, every renewal arrives with
      // no idea which member it belongs to.
      if (isSubscription) {
        params.subscription_data = { metadata };
      } else {
        params.payment_intent_data = { metadata };
      }

      const session = await stripe.checkout.sessions.create(params);
      if (!session.url) throw new Error("Stripe returned a checkout session with no URL");

      return { url: session.url, sessionId: session.id };
    },

    async handleWebhook(req: Request): Promise<EntitlementEvent[]> {
      if (!webhookSecret) throw new Error("Stripe webhook secret is not configured");

      const signature = req.headers.get("stripe-signature");
      if (!signature) throw new Error("Missing Stripe-Signature header");

      // Raw bytes, exactly as received. Stripe's HMAC is over the exact body,
      // so anything that reparses and re-serialises it breaks verification.
      const payload = await req.text();

      const event = await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret);
      return mapStripeEventToEntitlementEvents(event, {
        resolveChargeContext: options.resolveChargeContext,
      });
    },

    async getManageUrl(input): Promise<string | null> {
      if (!input.customerRef) return null;
      try {
        const session = await stripe.billingPortal.sessions.create({
          customer: input.customerRef,
          return_url: input.returnUrl,
        });
        return session.url;
      } catch (err) {
        console.error("[payments] failed to create Stripe portal session:", err);
        return null;
      }
    },
  };
}

function buildMetadata(
  tenantId: string,
  member: MemberIdentity,
  scope: EntitlementScope
): Record<string, string> {
  return {
    [META_TENANT]: tenantId,
    [META_ISSUER]: member.issuer,
    [META_SUBJECT]: member.subject,
    [META_DISPLAY]: member.displayName ?? "",
    [META_SCOPE_KIND]: scope.kind,
    [META_SCOPE_REF]: scope.kind === "tier" ? scope.tierId : scope.pageId,
  };
}

// --- Event mapping ---

/**
 * Translate a Stripe event into zero or more entitlement changes.
 *
 * Exported publicly so `.me` can reuse the *semantics* — what `invoice.paid`
 * means for access — without forking them. `.me` supplies its own storage and
 * ledger; the meaning of the events is the same on both sides, and two copies
 * of this mapping would drift.
 *
 * Anything not listed here maps to `[]`, which the route turns into a 200.
 */
export interface EventMapperOptions {
  /** See `ChargeContextResolver`. Without it, anonymous charge events map to []. */
  resolveChargeContext?: ChargeContextResolver;
}

export async function mapStripeEventToEntitlementEvents(
  event: Stripe.Event,
  options: EventMapperOptions = {}
): Promise<EntitlementEvent[]> {
  const occurredAt = event.created;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      // **Subscriptions are granted by `invoice.paid`, not here.**
      //
      // A webhook payload does not expand the subscription, so this event
      // cannot see `current_period_end` — it would have to guess an expiry.
      // That guess then *competes* with the real one: Stripe creates the
      // invoice a second before the session completes, so the checkout event is
      // the newer of the two, and `last_event_at` would let its short guess
      // overwrite the authoritative period end that arrived moments earlier.
      // The reader's access would silently shrink to a few days.
      //
      // `invoice.paid` fires for the first period as well as every renewal and
      // always carries the real period, so letting it own subscription access
      // removes the race rather than trying to win it.
      if (session.mode === "subscription") return [];

      const context = readContext(session.metadata, session.client_reference_id);
      if (!context) return [];

      // A one-off page purchase never expires.
      const expiresAt = null;

      return [
        {
          eventId: event.id,
          occurredAt,
          provider: PROVIDER_ID,
          kind: event.type,
          ...context,
          action: "grant",
          expiresAt,
          externalRef: refOf(session.subscription) ?? refOf(session.payment_intent),
          customerRef: refOf(session.customer),
          amount: session.amount_total,
          currency: session.currency,
        },
      ];
    }

    // The renewal signal. Without this, every subscription silently expires at
    // the end of its first period.
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const context = readContext(invoiceMetadata(invoice), null);
      if (!context) return [];

      return [
        {
          eventId: event.id,
          occurredAt,
          provider: PROVIDER_ID,
          kind: event.type,
          ...context,
          action: "grant",
          expiresAt: withGrace(invoicePeriodEnd(invoice)),
          externalRef: refOf(invoiceSubscription(invoice)),
          customerRef: refOf(invoice.customer),
          amount: invoice.amount_paid,
          currency: invoice.currency,
        },
      ];
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const context = readContext(subscription.metadata, null);
      if (!context) return [];

      const dead =
        event.type === "customer.subscription.deleted" ||
        ["canceled", "unpaid", "incomplete_expired"].includes(subscription.status);

      return [
        {
          eventId: event.id,
          occurredAt,
          provider: PROVIDER_ID,
          kind: event.type,
          ...context,
          action: dead ? "revoke" : "grant",
          expiresAt: dead ? null : withGrace(subscriptionPeriodEnd(subscription)),
          externalRef: subscription.id,
          customerRef: refOf(subscription.customer),
        },
      ];
    }

    case "charge.refunded":
    case "charge.dispute.created": {
      const isRefund = event.type === "charge.refunded";
      const metadata = isRefund
        ? (event.data.object as Stripe.Charge).metadata
        : ((event.data.object as Stripe.Dispute).metadata ?? {});

      // A charge created by a **subscription invoice carries none of our
      // metadata** — neither the charge nor its payment intent. So metadata
      // alone identifies one-off purchases only, and every subscription refund
      // would silently map to nothing: money back, access retained. The host's
      // resolver answers from its own records; without one, behaviour is
      // unchanged.
      const chargeId = isRefund
        ? (event.data.object as Stripe.Charge).id
        : refOf((event.data.object as Stripe.Dispute).charge);

      const context: ChargeContext | null =
        readContext(metadata, null) ??
        (chargeId && options.resolveChargeContext
          ? await options.resolveChargeContext(chargeId)
          : null);
      if (!context) return [];

      return [
        {
          eventId: event.id,
          occurredAt,
          provider: PROVIDER_ID,
          kind: event.type,
          ...context,
          action: "revoke",
          expiresAt: null,
          externalRef: null,
        },
      ];
    }

    // Deliberately NOT handled: `invoice.payment_failed`. Dunning is still in
    // flight when it fires and Stripe usually recovers the payment; the grace
    // window on the existing expiry already covers the gap. Revoking here would
    // lock a reader out over a card that works fine two days later.
    default:
      return [];
  }
}

/** Local alias — the resolver returns this exact shape. */
type EventContext = ChargeContext;

/**
 * Recover who and what an event is about, from metadata, falling back to
 * `client_reference_id`. Returns null when the event is not ours — a creator's
 * own Stripe account may carry unrelated traffic.
 */
function readContext(
  metadata: Stripe.Metadata | null | undefined,
  clientReferenceId: string | null | undefined
): EventContext | null {
  const meta = metadata ?? {};

  let tenantId = meta[META_TENANT];
  let issuer = meta[META_ISSUER];
  let subject = meta[META_SUBJECT];

  if ((!tenantId || !issuer || !subject) && clientReferenceId) {
    const [t, i, s] = clientReferenceId.split(":");
    tenantId ||= t;
    issuer ||= i;
    subject ||= s;
  }

  const scopeKind = meta[META_SCOPE_KIND];
  const scopeRef = meta[META_SCOPE_REF];

  if (!tenantId || !issuer || !subject || !scopeRef) return null;
  if (scopeKind !== "tier" && scopeKind !== "page") return null;

  return {
    tenantId,
    member: { issuer, subject, displayName: meta[META_DISPLAY] || "" },
    scope: scopeKind === "tier" ? { kind: "tier", tierId: scopeRef } : { kind: "page", pageId: scopeRef },
  };
}

function withGrace(periodEnd: number | null): number | null {
  return periodEnd == null ? null : periodEnd + ENTITLEMENT_GRACE_SECONDS;
}

/** Stripe returns either an id string or an expanded object. */
function refOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function readSubscriptionPeriodEnd(session: Stripe.Checkout.Session): number | null {
  const subscription = session.subscription;
  if (subscription && typeof subscription !== "string") {
    return subscriptionPeriodEnd(subscription);
  }
  // Not expanded: `invoice.paid` follows immediately and carries the period.
  return null;
}

/**
 * `current_period_end` moved from the subscription to its items in recent API
 * versions. Read both so the adapter works across versions rather than silently
 * returning null and granting an entitlement that never expires.
 */
function subscriptionPeriodEnd(subscription: Stripe.Subscription): number | null {
  const flat = (subscription as unknown as { current_period_end?: number }).current_period_end;
  if (typeof flat === "number") return flat;

  const ends = (subscription.items?.data ?? [])
    .map((item) => (item as unknown as { current_period_end?: number }).current_period_end)
    .filter((value): value is number => typeof value === "number");

  return ends.length > 0 ? Math.max(...ends) : null;
}

function invoicePeriodEnd(invoice: Stripe.Invoice): number | null {
  const ends = (invoice.lines?.data ?? [])
    .map((line) => line.period?.end)
    .filter((value): value is number => typeof value === "number");
  return ends.length > 0 ? Math.max(...ends) : null;
}

/**
 * Find our metadata on an invoice.
 *
 * Checkout writes it to `subscription_data.metadata`, so it is the
 * *subscription's* metadata — an invoice's own `metadata` is a separate, and
 * normally empty, bag. A webhook payload does not expand the subscription
 * either, so the metadata has to be dug out of wherever this API version put a
 * copy. Observed on a live `invoice.paid`:
 *
 *   invoice.metadata                             {}          <- empty
 *   invoice.parent.subscription_details.metadata {nbr_...}   <- current shape
 *   invoice.lines.data[0].metadata               {nbr_...}
 *
 * Each candidate is tested for our keys rather than merely for existence. The
 * previous version used `invoice.metadata ?? lineMeta`, and since `{}` is not
 * nullish it always won — so every renewal was silently discarded as "not
 * ours", taking the ledger row and the real expiry with it.
 */
export function invoiceMetadata(invoice: Stripe.Invoice): Stripe.Metadata {
  const subscription = invoiceSubscription(invoice);

  const candidates: (Stripe.Metadata | null | undefined)[] = [
    subscription && typeof subscription !== "string" ? subscription.metadata : null,
    (invoice as unknown as {
      parent?: { subscription_details?: { metadata?: Stripe.Metadata } };
    }).parent?.subscription_details?.metadata,
    invoice.lines?.data?.[0]?.metadata,
    invoice.metadata,
  ];

  for (const candidate of candidates) {
    if (candidate && candidate[META_TENANT]) return candidate;
  }
  return {};
}

function invoiceSubscription(
  invoice: Stripe.Invoice
): string | Stripe.Subscription | null | undefined {
  return (
    invoice as unknown as { subscription?: string | Stripe.Subscription | null }
  ).subscription;
}
