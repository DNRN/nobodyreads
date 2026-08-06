import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
import {
  createStripeProvider,
  mapStripeEventToEntitlementEvents,
  ENTITLEMENT_GRACE_SECONDS,
} from "./stripe.js";

const TENANT = "t1";

const META = {
  nbr_tenant: TENANT,
  nbr_issuer: "platform",
  nbr_subject: "bob",
  nbr_display: "Bob",
  nbr_scope_kind: "tier",
  nbr_scope_ref: "tier1",
};

function event(type: string, object: unknown, overrides: Partial<Stripe.Event> = {}): Stripe.Event {
  return {
    id: "evt_1",
    created: 1000,
    type,
    data: { object },
    ...overrides,
  } as unknown as Stripe.Event;
}

// ---------- checkout ----------

describe("createCheckout", () => {
  function stubStripe() {
    const create = vi.fn(async () => ({ id: "cs_1", url: "https://checkout.stripe.com/cs_1" }));
    const client = { checkout: { sessions: { create } } } as unknown as Stripe;
    return { client, create };
  }

  const baseRequest = {
    tenantId: TENANT,
    member: { issuer: "platform", subject: "bob", displayName: "Bob" },
    amount: 300,
    currency: "eur",
    productName: "Supporter",
    successUrl: "https://example.com/ok",
    cancelUrl: "https://example.com/no",
  };

  it("creates a subscription session with a recurring interval", async () => {
    const { client, create } = stubStripe();
    const provider = createStripeProvider({ secretKey: "sk_test", client });

    await provider.createCheckout({
      ...baseRequest,
      scope: { kind: "tier", tierId: "tier1", interval: "year" },
    });

    const params = create.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams;
    expect(params.mode).toBe("subscription");
    expect(params.line_items?.[0].price_data?.recurring?.interval).toBe("year");
    expect(params.line_items?.[0].price_data?.unit_amount).toBe(300);
  });

  it("creates a one-off payment session for a single page", async () => {
    const { client, create } = stubStripe();
    const provider = createStripeProvider({ secretKey: "sk_test", client });

    await provider.createCheckout({ ...baseRequest, scope: { kind: "page", pageId: "p1" } });

    const params = create.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams;
    expect(params.mode).toBe("payment");
    expect(params.line_items?.[0].price_data?.recurring).toBeUndefined();
  });

  it("puts metadata on subscription_data as well as the session", async () => {
    // The footgun: customer.subscription.updated / .deleted carry the
    // *subscription's* metadata. Session-only metadata means every renewal
    // arrives with no idea who the member is.
    const { client, create } = stubStripe();
    const provider = createStripeProvider({ secretKey: "sk_test", client });

    await provider.createCheckout({
      ...baseRequest,
      scope: { kind: "tier", tierId: "tier1", interval: "month" },
    });

    const params = create.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams;
    expect(params.metadata?.nbr_subject).toBe("bob");
    expect(params.subscription_data?.metadata?.nbr_subject).toBe("bob");
    expect(params.subscription_data?.metadata?.nbr_scope_ref).toBe("tier1");
  });

  it("puts metadata on payment_intent_data for a one-off", async () => {
    const { client, create } = stubStripe();
    const provider = createStripeProvider({ secretKey: "sk_test", client });

    await provider.createCheckout({ ...baseRequest, scope: { kind: "page", pageId: "p1" } });

    const params = create.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams;
    expect(params.payment_intent_data?.metadata?.nbr_scope_ref).toBe("p1");
  });

  it("sets client_reference_id as a metadata fallback", async () => {
    const { client, create } = stubStripe();
    const provider = createStripeProvider({ secretKey: "sk_test", client });

    await provider.createCheckout({ ...baseRequest, scope: { kind: "page", pageId: "p1" } });

    const params = create.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams;
    expect(params.client_reference_id).toBe(`${TENANT}:platform:bob`);
  });
});

// ---------- webhook verification ----------

describe("handleWebhook", () => {
  it("throws when the signature is missing", async () => {
    const provider = createStripeProvider({
      secretKey: "sk_test",
      webhookSecret: "whsec",
      client: {} as Stripe,
    });

    await expect(
      provider.handleWebhook(new Request("https://example.com", { method: "POST", body: "{}" })),
    ).rejects.toThrow("Stripe-Signature");
  });

  it("throws when no webhook secret is configured", async () => {
    const provider = createStripeProvider({ secretKey: "sk_test", client: {} as Stripe });

    await expect(
      provider.handleWebhook(new Request("https://example.com", { method: "POST", body: "{}" })),
    ).rejects.toThrow("webhook secret");
  });

  it("verifies against the raw body bytes, not a reparsed object", async () => {
    const constructEventAsync = vi.fn(async () => event("payment_intent.succeeded", {}));
    const client = { webhooks: { constructEventAsync } } as unknown as Stripe;
    const provider = createStripeProvider({
      secretKey: "sk_test",
      webhookSecret: "whsec",
      client,
    });

    const raw = '{"id":"evt_1",  "spaced": true}';
    await provider.handleWebhook(
      new Request("https://example.com", {
        method: "POST",
        body: raw,
        headers: { "stripe-signature": "t=1,v1=abc" },
      }),
    );

    // Byte-for-byte, whitespace included — Stripe's HMAC is over exact bytes.
    expect(constructEventAsync.mock.calls[0][0]).toBe(raw);
  });
});

// ---------- event mapping ----------

describe("mapStripeEventToEntitlementEvents", () => {
  it("ignores an unrecognised event kind", async () => {
    expect(await mapStripeEventToEntitlementEvents(event("customer.created", {}))).toEqual([]);
  });

  it("ignores an event with no nbr_ metadata — not ours", async () => {
    const e = event("checkout.session.completed", { mode: "payment", metadata: {} });
    expect(await mapStripeEventToEntitlementEvents(e)).toEqual([]);
  });

  it("grants a page forever on a one-off checkout", async () => {
    const e = event("checkout.session.completed", {
      mode: "payment",
      metadata: { ...META, nbr_scope_kind: "page", nbr_scope_ref: "p1" },
      payment_intent: "pi_1",
      customer: "cus_1",
      amount_total: 300,
      currency: "eur",
    });

    const [mapped] = await mapStripeEventToEntitlementEvents(e);
    expect(mapped).toMatchObject({
      action: "grant",
      scope: { kind: "page", pageId: "p1" },
      expiresAt: null,
      externalRef: "pi_1",
      customerRef: "cus_1",
      occurredAt: 1000,
    });
  });

  it("grants a tier to period end plus grace on invoice.paid", async () => {
    const e = event("invoice.paid", {
      subscription: { id: "sub_1", metadata: META },
      lines: { data: [{ period: { end: 5000 } }] },
      customer: "cus_1",
      amount_paid: 300,
      currency: "eur",
    });

    const [mapped] = await mapStripeEventToEntitlementEvents(e);
    expect(mapped).toMatchObject({
      action: "grant",
      scope: { kind: "tier", tierId: "tier1" },
      expiresAt: 5000 + ENTITLEMENT_GRACE_SECONDS,
    });
  });

  it("revokes on customer.subscription.deleted", async () => {
    const e = event("customer.subscription.deleted", {
      id: "sub_1",
      status: "canceled",
      metadata: META,
      customer: "cus_1",
    });

    expect((await mapStripeEventToEntitlementEvents(e))[0]).toMatchObject({ action: "revoke" });
  });

  it("revokes on a subscription update to a dead status", async () => {
    for (const status of ["canceled", "unpaid", "incomplete_expired"]) {
      const e = event("customer.subscription.updated", {
        id: "sub_1",
        status,
        metadata: META,
        items: { data: [{ current_period_end: 5000 }] },
      });
      expect((await mapStripeEventToEntitlementEvents(e))[0]).toMatchObject({ action: "revoke" });
    }
  });

  it("extends on a subscription update to a live status", async () => {
    const e = event("customer.subscription.updated", {
      id: "sub_1",
      status: "active",
      metadata: META,
      items: { data: [{ current_period_end: 5000 }] },
    });

    expect((await mapStripeEventToEntitlementEvents(e))[0]).toMatchObject({
      action: "grant",
      expiresAt: 5000 + ENTITLEMENT_GRACE_SECONDS,
    });
  });

  it("reads current_period_end from the subscription itself when it is flat", async () => {
    const e = event("customer.subscription.updated", {
      id: "sub_1",
      status: "active",
      metadata: META,
      current_period_end: 7000,
    });

    expect((await mapStripeEventToEntitlementEvents(e))[0]).toMatchObject({
      expiresAt: 7000 + ENTITLEMENT_GRACE_SECONDS,
    });
  });

  it("revokes on a refund and on a dispute", async () => {
    for (const type of ["charge.refunded", "charge.dispute.created"]) {
      const e = event(type, { id: "ch_1", metadata: META });
      expect((await mapStripeEventToEntitlementEvents(e))[0]).toMatchObject({ action: "revoke" });
    }
  });

  it("emits NOTHING for invoice.payment_failed", async () => {
    // Dunning is still in flight and Stripe usually recovers the payment; the
    // grace window covers the gap. Revoking here locks a reader out over a card
    // that works again two days later.
    const e = event("invoice.payment_failed", { subscription: { id: "sub_1", metadata: META } });
    expect(await mapStripeEventToEntitlementEvents(e)).toEqual([]);
  });

  it("falls back to client_reference_id when the tenant metadata is absent", async () => {
    const e = event("checkout.session.completed", {
      mode: "payment",
      metadata: { nbr_scope_kind: "page", nbr_scope_ref: "p1" },
      client_reference_id: `${TENANT}:platform:bob`,
    });

    expect((await mapStripeEventToEntitlementEvents(e))[0]).toMatchObject({
      tenantId: TENANT,
      member: { issuer: "platform", subject: "bob" },
    });
  });

  // A charge created by a subscription invoice inherits NONE of our metadata,
  // so these two events arrive anonymous for every subscription. Without the
  // resolver the reader gets their money back and keeps the content.
  describe("anonymous charge events (subscription refunds and disputes)", () => {
    const anon = (type: string) =>
      type === "charge.refunded"
        ? event(type, { id: "ch_anon", metadata: {} })
        : event(type, { id: "dp_1", charge: "ch_anon", metadata: {} });

    it("emits nothing without a resolver — the documented default", async () => {
      for (const type of ["charge.refunded", "charge.dispute.created"]) {
        expect(await mapStripeEventToEntitlementEvents(anon(type))).toEqual([]);
      }
    });

    it("revokes via the resolver when metadata is missing", async () => {
      for (const type of ["charge.refunded", "charge.dispute.created"]) {
        const seen: string[] = [];
        const [mapped] = await mapStripeEventToEntitlementEvents(anon(type), {
          resolveChargeContext: (chargeId) => {
            seen.push(chargeId);
            return {
              tenantId: TENANT,
              member: { issuer: "platform", subject: "bob" },
              scope: { kind: "tier", tierId: "tier1" },
            };
          },
        });
        expect(seen).toEqual(["ch_anon"]);
        expect(mapped).toMatchObject({
          action: "revoke",
          tenantId: TENANT,
          member: { issuer: "platform", subject: "bob" },
        });
      }
    });

    it("accepts an async resolver", async () => {
      const [mapped] = await mapStripeEventToEntitlementEvents(anon("charge.refunded"), {
        resolveChargeContext: async () => ({
          tenantId: TENANT,
          member: { issuer: "platform", subject: "bob" },
          scope: { kind: "tier", tierId: "tier1" },
        }),
      });
      expect(mapped).toMatchObject({ action: "revoke" });
    });

    it("emits nothing when the resolver says the charge is not ours", async () => {
      expect(
        await mapStripeEventToEntitlementEvents(anon("charge.refunded"), {
          resolveChargeContext: () => null,
        }),
      ).toEqual([]);
    });

    it("prefers metadata over the resolver, and never calls it", async () => {
      let called = false;
      const [mapped] = await mapStripeEventToEntitlementEvents(
        event("charge.refunded", { id: "ch_1", metadata: META }),
        {
          resolveChargeContext: () => {
            called = true;
            return null;
          },
        },
      );
      expect(called).toBe(false);
      expect(mapped).toMatchObject({ action: "revoke", scope: { kind: "tier", tierId: "tier1" } });
    });
  });

  it("carries the provider event id through as the idempotency key", async () => {
    const e = event(
      "charge.refunded",
      { id: "ch_1", metadata: META },
      { id: "evt_specific" } as Partial<Stripe.Event>,
    );
    expect((await mapStripeEventToEntitlementEvents(e))[0].eventId).toBe("evt_specific");
  });
});

// ---------- invoice metadata resolution ----------

describe("invoice.paid metadata, as Stripe actually shapes it", () => {
  /**
   * Modelled on a real `invoice.paid` webhook payload. The invoice's own
   * `metadata` is `{}` — not absent, *empty* — which is what made the old
   * `invoice.metadata ?? lineMeta` fallback pick the wrong one and drop every
   * renewal on the floor.
   */
  function realInvoice(overrides: Record<string, unknown> = {}) {
    return {
      subscription: "sub_1",
      metadata: {},
      parent: { subscription_details: { metadata: META, subscription: "sub_1" } },
      lines: { data: [{ metadata: META, period: { end: 5000 } }] },
      customer: "cus_1",
      amount_paid: 500,
      currency: "eur",
      ...overrides,
    };
  }

  it("finds the metadata even though invoice.metadata is an empty object", async () => {
    const [mapped] = await mapStripeEventToEntitlementEvents(event("invoice.paid", realInvoice()));
    expect(mapped).toBeDefined();
    expect(mapped).toMatchObject({
      action: "grant",
      scope: { kind: "tier", tierId: "tier1" },
      expiresAt: 5000 + ENTITLEMENT_GRACE_SECONDS,
    });
  });

  it("falls back to the line item when parent is absent", async () => {
    const invoice = realInvoice();
    delete (invoice as Record<string, unknown>).parent;
    expect(await mapStripeEventToEntitlementEvents(event("invoice.paid", invoice))).toHaveLength(1);
  });

  it("still ignores an invoice that is genuinely not ours", async () => {
    const [none] = await mapStripeEventToEntitlementEvents(
      event("invoice.paid", {
        subscription: "sub_x",
        metadata: {},
        lines: { data: [{ metadata: {}, period: { end: 5000 } }] },
      }),
    );
    expect(none).toBeUndefined();
  });
});

describe("invoice.paid owns subscription access, not checkout", () => {
  it("emits nothing for a subscription checkout", async () => {
    // A webhook does not expand the subscription, so this event cannot know the
    // period end. Any guess it made would be the *newer* event (Stripe creates
    // the invoice a second earlier) and would overwrite the real period end via
    // the last_event_at guard — silently shrinking a month of access to days.
    expect(
      await mapStripeEventToEntitlementEvents(
        event("checkout.session.completed", {
          mode: "subscription",
          metadata: META,
          subscription: "sub_1",
          customer: "cus_1",
        }),
      ),
    ).toEqual([]);
  });

  it("grants the real period from invoice.paid instead", async () => {
    const [mapped] = await mapStripeEventToEntitlementEvents(
      event("invoice.paid", {
        subscription: "sub_1",
        metadata: {},
        parent: { subscription_details: { metadata: META } },
        lines: { data: [{ metadata: META, period: { end: 5000 } }] },
        customer: "cus_1",
        amount_paid: 500,
        currency: "eur",
      }),
    );
    expect(mapped.expiresAt).toBe(5000 + ENTITLEMENT_GRACE_SECONDS);
  });

  it("still grants a one-off page purchase forever", async () => {
    const [mapped] = await mapStripeEventToEntitlementEvents(
      event("checkout.session.completed", {
        mode: "payment",
        metadata: { ...META, nbr_scope_kind: "page", nbr_scope_ref: "p1" },
        payment_intent: "pi_1",
      }),
    );
    expect(mapped.expiresAt).toBeNull();
  });
});
