import { Hono } from "hono";
import type { Database } from "../db/index.js";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import { createSiteSettingsPaymentSource } from "./config.js";
import { applyEntitlementEvents } from "./events.js";
import type { EntitlementEvent, PaymentProviderSource } from "./provider.js";

export interface PaymentsWebhookOptions {
  db: Database;
  tenantId?: string;
  paymentProvider?: PaymentProviderSource;
  /**
   * Work out which tenant a raw request belongs to, before the signature is
   * verified — a multi-tenant host has one endpoint and many creators. Return
   * null to fall back to `tenantId`.
   */
  resolveWebhookTenant?: (req: Request) => string | null | Promise<string | null>;
  /**
   * Called with the normalized events *after* entitlements are applied.
   * `.me` uses this for the payout ledger. Failures here are logged and
   * swallowed — see the note in the handler.
   */
  onEvents?: (events: EntitlementEvent[]) => void | Promise<void>;
}

/**
 * Provider webhook, as a **separate factory** from `createPaymentsRoutes`.
 *
 * It has to be mounted outside tenant-path resolution, outside session
 * middleware, and outside anything that touches the request body — Stripe's
 * HMAC is computed over the exact bytes received, so a single `parseBody()`
 * upstream silently breaks every signature. Keeping it in its own factory makes
 * that mounting requirement impossible to overlook.
 */
export function createPaymentsWebhookRoutes(options: PaymentsWebhookOptions): Hono {
  const { db, onEvents } = options;
  const fallbackTenant = options.tenantId ?? DEFAULT_TENANT_ID;
  const paymentSource = options.paymentProvider ?? createSiteSettingsPaymentSource(db);

  const app = new Hono();

  app.post("/webhook", async (c) => {
    const tenantId = (await options.resolveWebhookTenant?.(c.req.raw)) ?? fallbackTenant;

    const provider = await paymentSource(tenantId);
    if (!provider) {
      // Nothing configured for this tenant. A 4xx/5xx would make the provider
      // retry forever and eventually disable the endpoint.
      console.warn(`[payments] webhook for ${tenantId} but no provider is configured`);
      return c.body(null, 200);
    }

    let events: EntitlementEvent[];
    try {
      // The provider reads raw bytes via `req.text()`. Never `parseBody()`.
      events = await provider.handleWebhook(c.req.raw);
    } catch (err) {
      // A bad signature is the *only* 400 this endpoint returns. Everything
      // else is a 200, because a 500 puts the provider into exponential
      // backoff and, after enough failures, disables the endpoint entirely —
      // at which point renewals stop arriving and paying readers lose access.
      console.error("[payments] webhook verification failed:", err);
      return c.json({ error: "Invalid signature" }, 400);
    }

    if (events.length === 0) return c.body(null, 200);

    await applyEntitlementEvents(db, events);

    if (onEvents) {
      try {
        await onEvents(events);
      } catch (err) {
        // A ledger failure must not turn into a non-200: the provider would
        // retry, and the retry would re-run grants that already succeeded.
        // Entitlements are the correctness-critical half; bookkeeping is
        // reconcilable after the fact.
        console.error("[payments] webhook onEvents hook failed:", err);
      }
    }

    return c.body(null, 200);
  });

  return app;
}
