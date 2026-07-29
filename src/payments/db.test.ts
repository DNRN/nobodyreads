import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import type { MemberIdentity } from "../community/types.js";
import {
  grantEntitlement,
  revokeEntitlement,
  getEntitlement,
  hasPageAccess,
  listMemberEntitlements,
  listPaidTiers,
  getActivePaidTier,
  upsertPaidTier,
  deletePaidTier,
  upsertPaymentCustomer,
  getPaymentCustomerRef,
} from "./db.js";

const TENANT = "t1";
const bob: MemberIdentity = { issuer: "platform", subject: "bob", displayName: "Bob" };

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

const tierScope = { kind: "tier", tierId: "tier1" } as const;

// ---------- paid tiers ----------

describe("paid tiers", () => {
  const tier = {
    id: "tier1",
    name: "Supporter",
    currency: "eur",
    amountMonthly: 300,
    amountYearly: 3000,
    active: true,
    createdAt: "2026-01-01",
  };

  it("round-trips", async () => {
    await upsertPaidTier(t.db, tier, TENANT);
    const tiers = await listPaidTiers(t.db, TENANT);
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({ id: "tier1", amountMonthly: 300, amountYearly: 3000 });
  });

  it("updates in place rather than duplicating", async () => {
    await upsertPaidTier(t.db, tier, TENANT);
    await upsertPaidTier(t.db, { ...tier, amountMonthly: 500 }, TENANT);

    const tiers = await listPaidTiers(t.db, TENANT);
    expect(tiers).toHaveLength(1);
    expect(tiers[0].amountMonthly).toBe(500);
  });

  it("stores amounts as integer minor units", async () => {
    await upsertPaidTier(t.db, tier, TENANT);
    const rows = await t.client.execute("SELECT amount_monthly FROM paid_tier");
    expect(rows.rows[0].amount_monthly).toBe(300);
  });

  it("getActivePaidTier skips inactive tiers", async () => {
    await upsertPaidTier(t.db, { ...tier, active: false }, TENANT);
    expect(await getActivePaidTier(t.db, TENANT)).toBeNull();
  });

  it("is scoped to a tenant", async () => {
    await upsertPaidTier(t.db, tier, TENANT);
    expect(await getActivePaidTier(t.db, "other")).toBeNull();
  });

  it("deletes", async () => {
    await upsertPaidTier(t.db, tier, TENANT);
    await deletePaidTier(t.db, "tier1", TENANT);
    expect(await listPaidTiers(t.db, TENANT)).toHaveLength(0);
  });
});

// ---------- entitlement grants ----------

describe("grantEntitlement", () => {
  it("creates an active entitlement", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      source: "stripe",
      externalRef: "sub_1",
      expiresAt: 5000,
      eventAt: 100,
    });

    const row = await getEntitlement(t.db, TENANT, bob, tierScope);
    expect(row).toMatchObject({ status: "active", externalRef: "sub_1", expiresAt: 5000 });
  });

  it("is idempotent — the same grant twice leaves one row", async () => {
    const input = {
      member: bob,
      scope: tierScope,
      source: "stripe",
      expiresAt: 5000,
      eventAt: 100,
    };
    await grantEntitlement(t.db, TENANT, input);
    await grantEntitlement(t.db, TENANT, input);

    const rows = await t.client.execute("SELECT COUNT(*) AS n FROM entitlement");
    expect(rows.rows[0].n).toBe(1);
  });

  it("extends the expiry on renewal", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      source: "stripe",
      expiresAt: 5000,
      eventAt: 100,
    });
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      source: "stripe",
      expiresAt: 9000,
      eventAt: 200,
    });

    expect((await getEntitlement(t.db, TENANT, bob, tierScope))?.expiresAt).toBe(9000);
  });

  it("lets a resubscribe reuse the revoked row", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      source: "stripe",
      expiresAt: null,
      eventAt: 100,
    });
    await revokeEntitlement(t.db, TENANT, { member: bob, scope: tierScope, eventAt: 200 });
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      source: "stripe",
      expiresAt: null,
      eventAt: 300,
    });

    const row = await getEntitlement(t.db, TENANT, bob, tierScope);
    expect(row?.status).toBe("active");
    expect(row?.revokedAt).toBeNull();

    const rows = await t.client.execute("SELECT COUNT(*) AS n FROM entitlement");
    expect(rows.rows[0].n).toBe(1);
  });
});

// ---------- ordering guard ----------

describe("out-of-order events", () => {
  it("ignores a grant older than the row's last applied event", async () => {
    await revokeAfterGrant();

    // The straggler: a subscription.updated from *before* the cancellation.
    const applied = await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      source: "stripe",
      expiresAt: 9999,
      eventAt: 90,
    });

    expect(applied).toBe(false);
    expect((await getEntitlement(t.db, TENANT, bob, tierScope))?.status).toBe("revoked");
  });

  it("reaches the same final state whichever order the two events arrive in", async () => {
    // Order A: grant@100 then revoke@200.
    await revokeAfterGrant();
    const orderA = await getEntitlement(t.db, TENANT, bob, tierScope);

    // Order B: revoke@200 arrives first, then the grant@100 straggles in.
    t = await createTestDb();
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      source: "stripe",
      expiresAt: null,
      eventAt: 200,
    });
    await revokeEntitlement(t.db, TENANT, { member: bob, scope: tierScope, eventAt: 200 });
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      source: "stripe",
      expiresAt: 9999,
      eventAt: 100,
    });
    const orderB = await getEntitlement(t.db, TENANT, bob, tierScope);

    expect(orderA?.status).toBe("revoked");
    expect(orderB?.status).toBe("revoked");
  });

  it("ignores a revoke older than the row's last applied event", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      source: "stripe",
      expiresAt: null,
      eventAt: 300,
    });

    const applied = await revokeEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      eventAt: 100,
    });

    expect(applied).toBe(false);
    expect((await getEntitlement(t.db, TENANT, bob, tierScope))?.status).toBe("active");
  });

  it("revoking something never granted still writes a tombstone", async () => {
    // Not a no-op on purpose: the row is what a later, *older* grant loses
    // against. Without it, a delayed subscription.updated re-grants a
    // cancelled subscription.
    expect(
      await revokeEntitlement(t.db, TENANT, { member: bob, scope: tierScope, eventAt: 200 }),
    ).toBe(true);

    const row = await getEntitlement(t.db, TENANT, bob, tierScope);
    expect(row).toMatchObject({ status: "revoked", lastEventAt: 200 });

    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      source: "stripe",
      expiresAt: 9999,
      eventAt: 100,
    });
    expect((await getEntitlement(t.db, TENANT, bob, tierScope))?.status).toBe("revoked");
  });

  async function revokeAfterGrant(): Promise<void> {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      source: "stripe",
      expiresAt: null,
      eventAt: 100,
    });
    await revokeEntitlement(t.db, TENANT, { member: bob, scope: tierScope, eventAt: 200 });
  }
});

// ---------- reads ----------

describe("hasPageAccess", () => {
  it("is false with no entitlement at all", async () => {
    expect(await hasPageAccess(t.db, TENANT, bob, "p1", 1000)).toBe(false);
  });

  it("is true for a live tier entitlement, whatever the page", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      source: "stripe",
      expiresAt: 5000,
      eventAt: 100,
    });
    expect(await hasPageAccess(t.db, TENANT, bob, "any-page", 1000)).toBe(true);
  });

  it("is page-specific for a page entitlement", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: { kind: "page", pageId: "p1" },
      source: "stripe",
      expiresAt: null,
      eventAt: 100,
    });
    expect(await hasPageAccess(t.db, TENANT, bob, "p1", 1000)).toBe(true);
    expect(await hasPageAccess(t.db, TENANT, bob, "p2", 1000)).toBe(false);
  });

  it("goes false the moment the expiry passes", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      source: "stripe",
      expiresAt: 5000,
      eventAt: 100,
    });
    expect(await hasPageAccess(t.db, TENANT, bob, "p1", 4999)).toBe(true);
    expect(await hasPageAccess(t.db, TENANT, bob, "p1", 5001)).toBe(false);
  });
});

describe("listMemberEntitlements", () => {
  it("returns only live entitlements", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: tierScope,
      source: "stripe",
      expiresAt: null,
      eventAt: 100,
    });
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: { kind: "page", pageId: "expired" },
      source: "stripe",
      expiresAt: 500,
      eventAt: 100,
    });

    const live = await listMemberEntitlements(t.db, TENANT, bob, 1000);
    expect(live).toHaveLength(1);
    expect(live[0].scopeKind).toBe("tier");
  });
});

// ---------- payment customers ----------

describe("payment customers", () => {
  it("round-trips and updates in place", async () => {
    await upsertPaymentCustomer(t.db, TENANT, bob, "stripe", "cus_1");
    expect(await getPaymentCustomerRef(t.db, TENANT, bob, "stripe")).toBe("cus_1");

    await upsertPaymentCustomer(t.db, TENANT, bob, "stripe", "cus_2");
    expect(await getPaymentCustomerRef(t.db, TENANT, bob, "stripe")).toBe("cus_2");

    const rows = await t.client.execute("SELECT COUNT(*) AS n FROM payment_customer");
    expect(rows.rows[0].n).toBe(1);
  });

  it("is null for an unknown member", async () => {
    expect(await getPaymentCustomerRef(t.db, TENANT, bob, "stripe")).toBeNull();
  });
});
