import { Hono } from "hono";
import type { Database } from "../db/index.js";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import type { ResolveMember } from "../community/types.js";
import { getPageById } from "../content/db.js";
import {
  getActivePaidTier,
  getPaidTierById,
  getPaymentCustomerRef,
  listMemberEntitlements,
} from "./db.js";
import { createSiteSettingsPaymentSource } from "./config.js";
import type { PaymentProviderSource } from "./provider.js";
import type { EntitlementScope } from "./types.js";

export interface PaymentsRouterOptions {
  db: Database;
  tenantId?: string;
  urlPrefix?: string;
  /** Host-supplied member resolver — the package never invents identity. */
  resolveMember: ResolveMember;
  /**
   * Where the provider comes from. Defaulted at the use site, not in the type,
   * so `null` stays the documented off switch. Same shape as `RulesetSource`.
   */
  paymentProvider?: PaymentProviderSource;
}

/**
 * Reader-facing payment routes. Mount under a tenant's `/api`.
 *
 *   POST /payments/checkout     — start a Checkout session
 *   GET  /payments/manage       — redirect to the provider's portal
 *   GET  /payments/entitlements — what this reader holds (UI hints only)
 */
export function createPaymentsRoutes(options: PaymentsRouterOptions): Hono {
  const { db, resolveMember } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const urlPrefix = options.urlPrefix ?? "";
  const paymentSource = options.paymentProvider ?? createSiteSettingsPaymentSource(db);

  const app = new Hono();

  app.post("/payments/checkout", async (c) => {
    const member = await resolveMember(c);
    if (!member) {
      // Phase 5a decision: a reader holds an account before checkout, so the
      // entitlement keys off the existing (issuer, subject) identity with no
      // new identity path. Auto-provisioning from the Checkout email is a
      // deliberate follow-up.
      return c.redirect(`${urlPrefix}/login`);
    }

    const provider = await paymentSource(tenantId);
    if (!provider) return c.json({ error: "Payments are not configured" }, 503);

    const form = await c.req.parseBody();
    const scopeKind = String(form.scope_kind ?? "");
    const scopeRef = String(form.scope_ref ?? "");
    const interval = form.interval === "year" ? "year" : "month";

    if (scopeKind !== "tier" && scopeKind !== "page") {
      return c.json({ error: "Unknown purchase type" }, 400);
    }
    if (!scopeRef) return c.json({ error: "Missing purchase target" }, 400);

    // Price is resolved server-side from the database, never taken from the
    // form. A client-supplied amount is a client-chosen price.
    const priced =
      scopeKind === "tier"
        ? await priceTier(db, tenantId, scopeRef, interval)
        : await pricePage(db, tenantId, scopeRef);

    if (!priced) return c.json({ error: "That is not for sale" }, 400);

    const scope: EntitlementScope =
      scopeKind === "tier"
        ? { kind: "tier", tierId: scopeRef, interval }
        : { kind: "page", pageId: scopeRef };

    const origin = new URL(c.req.url).origin;
    const returnTo = `${origin}${urlPrefix}`;

    try {
      const session = await provider.createCheckout({
        tenantId,
        member,
        scope,
        amount: priced.amount,
        currency: priced.currency,
        productName: priced.name,
        successUrl: `${returnTo}?checkout=success`,
        cancelUrl: `${returnTo}?checkout=cancelled`,
        customerRef: await getPaymentCustomerRef(db, tenantId, member, provider.id),
      });
      return c.redirect(session.url, 303);
    } catch (err) {
      console.error("[payments] checkout failed:", err);
      return c.json({ error: "Could not start checkout" }, 502);
    }
  });

  app.get("/payments/manage", async (c) => {
    const member = await resolveMember(c);
    if (!member) return c.redirect(`${urlPrefix}/login`);

    const provider = await paymentSource(tenantId);
    if (!provider) return c.json({ error: "Payments are not configured" }, 503);

    const customerRef = await getPaymentCustomerRef(db, tenantId, member, provider.id);
    if (!customerRef) return c.json({ error: "Nothing to manage yet" }, 404);

    const origin = new URL(c.req.url).origin;
    const url = await provider.getManageUrl({
      member,
      customerRef,
      returnUrl: `${origin}${urlPrefix}`,
    });

    if (!url) return c.json({ error: "Nothing to manage yet" }, 404);
    return c.redirect(url, 303);
  });

  /**
   * What this reader currently holds.
   *
   * **This is never the gate.** It exists so a UI can show "you're a supporter"
   * without a page reload. Access is decided by `resolvePageAccess` on the
   * server, every render. A client that trusts this endpoint to decide what to
   * display has built a paywall an attacker turns off in devtools.
   */
  app.get("/payments/entitlements", async (c) => {
    const member = await resolveMember(c);
    if (!member) return c.json({ entitlements: [] });

    const entitlements = await listMemberEntitlements(db, tenantId, member);
    return c.json({
      entitlements: entitlements.map((e) => ({
        scopeKind: e.scopeKind,
        scopeRef: e.scopeRef,
        expiresAt: e.expiresAt,
      })),
    });
  });

  return app;
}

interface PricedItem {
  amount: number;
  currency: string;
  name: string;
}

async function priceTier(
  db: Database,
  tenantId: string,
  tierId: string,
  interval: "month" | "year"
): Promise<PricedItem | null> {
  const tier = (await getPaidTierById(db, tierId, tenantId)) ?? (await getActivePaidTier(db, tenantId));
  if (!tier || !tier.active) return null;

  const amount = interval === "year" ? tier.amountYearly : tier.amountMonthly;
  if (amount == null || amount <= 0) return null;

  return { amount, currency: tier.currency, name: `${tier.name} (${interval}ly)` };
}

async function pricePage(
  db: Database,
  tenantId: string,
  pageId: string
): Promise<PricedItem | null> {
  const page = await getPageById(db, pageId, tenantId);
  if (!page || page.accessTier !== "paid") return null;
  if (page.priceAmount == null || page.priceAmount <= 0) return null;

  const tier = await getActivePaidTier(db, tenantId);
  return {
    amount: page.priceAmount,
    currency: tier?.currency ?? "eur",
    name: page.title,
  };
}
