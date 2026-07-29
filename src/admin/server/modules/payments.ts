import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { and, count, eq, gt, isNull, or } from "drizzle-orm";
import { entitlement } from "../../../payments/schema.js";
import {
  getActivePaidTier,
  listPaidTiers,
  upsertPaidTier,
  nowSeconds,
} from "../../../payments/db.js";
import type { AdminModuleContext } from "./types.js";

/**
 * Payments admin routes (per-tenant): the plot's paid tier and who is
 * subscribed to it.
 *
 * Owner-gating happens in the host's admin handler, like every other admin
 * module — the package never decides ownership.
 *
 * Note what is *not* here: anything that moves money. On `.me` the platform is
 * merchant of record, so Connect onboarding, the payout ledger and commission
 * live in the platform repo. A self-hoster charges through their own keys and
 * has none of that. What both share is "what does this plot sell, and to whom",
 * which is what this module covers.
 *
 * Routes (mounted under the tenant admin base):
 *   GET  /payments/tier         -> the active tier, or null
 *   POST /payments/tier         -> create or update it
 *   GET  /payments/subscribers  -> live entitlement counts
 */
export function createPaymentsAdminRoutes(ctx: AdminModuleContext): Hono {
  const { db, tenantId } = ctx;
  const app = new Hono();

  app.get("/payments/tier", async (c) => {
    return c.json({ tier: await getActivePaidTier(db, tenantId) });
  });

  app.get("/payments/tiers", async (c) => {
    return c.json({ tiers: await listPaidTiers(db, tenantId) });
  });

  app.post("/payments/tier", async (c) => {
    const body = await c.req.parseBody();

    const name = String(body.name || "").trim() || "Supporter";
    const amountMonthly = parseMinorUnits(body.amount_monthly);
    const amountYearly = parseMinorUnits(body.amount_yearly);

    if (amountMonthly == null && amountYearly == null) {
      return c.json({ error: "Set a monthly or a yearly price" }, 400);
    }

    // No price floor here on purpose. A minimum only makes sense where a
    // platform carries fixed per-transaction costs, so `.me` enforces one and
    // the package stays tenant-agnostic — a self-hoster may price as they like.
    const existing = await getActivePaidTier(db, tenantId);

    await upsertPaidTier(
      db,
      {
        id: existing?.id ?? randomUUID(),
        name,
        description: String(body.description || "").trim() || undefined,
        currency: String(body.currency || existing?.currency || "eur").toLowerCase(),
        amountMonthly,
        amountYearly,
        active: body.active !== "off",
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      },
      tenantId
    );

    return c.json({ ok: true, tier: await getActivePaidTier(db, tenantId) });
  });

  /**
   * Counts, never a list of who. The admin UI wants "43 supporters", and an
   * endpoint that returns reader identities is a much larger thing to secure
   * for no gain here.
   */
  app.get("/payments/subscribers", async (c) => {
    const now = nowSeconds();

    const live = and(
      eq(entitlement.tenantId, tenantId),
      eq(entitlement.status, "active"),
      or(isNull(entitlement.expiresAt), gt(entitlement.expiresAt, now))
    );

    const [subscribers, purchases] = await Promise.all([
      db
        .select({ value: count() })
        .from(entitlement)
        .where(and(live, eq(entitlement.scopeKind, "tier"))),
      db
        .select({ value: count() })
        .from(entitlement)
        .where(and(live, eq(entitlement.scopeKind, "page"))),
    ]);

    return c.json({
      subscribers: subscribers[0]?.value ?? 0,
      singlePurchases: purchases[0]?.value ?? 0,
    });
  });

  return app;
}

/** "3", "3.50" or "3,50" → integer cents. Null for empty or non-positive. */
function parseMinorUnits(input: unknown): number | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const value = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}
