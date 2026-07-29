import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import { applyEntitlementEvents } from "./events.js";
import { getEntitlement, getPaymentCustomerRef, hasPageAccess } from "./db.js";
import type { EntitlementEvent } from "./provider.js";

const TENANT = "t1";
const bob = { issuer: "platform", subject: "bob", displayName: "Bob" };
const tierScope = { kind: "tier", tierId: "tier1" } as const;

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

function grant(overrides: Partial<EntitlementEvent> = {}): EntitlementEvent {
  return {
    eventId: "evt_1",
    occurredAt: 100,
    provider: "stripe",
    kind: "invoice.paid",
    tenantId: TENANT,
    member: bob,
    scope: tierScope,
    action: "grant",
    expiresAt: 9999,
    externalRef: "sub_1",
    ...overrides,
  };
}

function revoke(overrides: Partial<EntitlementEvent> = {}): EntitlementEvent {
  return grant({
    eventId: "evt_2",
    kind: "customer.subscription.deleted",
    action: "revoke",
    expiresAt: null,
    ...overrides,
  });
}

// ---------- idempotency ----------

describe("replay", () => {
  it("applies the same event id only once", async () => {
    const first = await applyEntitlementEvents(t.db, [grant()]);
    const second = await applyEntitlementEvents(t.db, [grant()]);

    expect(first).toMatchObject({ applied: 1, skipped: 0 });
    expect(second).toMatchObject({ applied: 0, skipped: 1 });

    const rows = await t.client.execute("SELECT COUNT(*) AS n FROM entitlement");
    expect(rows.rows[0].n).toBe(1);
  });

  it("records one payment_event row per event id", async () => {
    await applyEntitlementEvents(t.db, [grant()]);
    await applyEntitlementEvents(t.db, [grant()]);

    const rows = await t.client.execute("SELECT COUNT(*) AS n FROM payment_event");
    expect(rows.rows[0].n).toBe(1);
  });

  it("still grants access after a replay", async () => {
    await applyEntitlementEvents(t.db, [grant()]);
    await applyEntitlementEvents(t.db, [grant()]);
    expect(await hasPageAccess(t.db, TENANT, bob, "p1", 500)).toBe(true);
  });
});

// ---------- ordering ----------

describe("out-of-order delivery", () => {
  it("delete@100 then a straggling update@90 stays revoked", async () => {
    await applyEntitlementEvents(t.db, [
      revoke({ eventId: "evt_del", occurredAt: 100 }),
    ]);
    // A different event id, so id-dedupe alone would happily let this through.
    await applyEntitlementEvents(t.db, [
      grant({ eventId: "evt_upd", occurredAt: 90, expiresAt: 99999 }),
    ]);

    expect((await getEntitlement(t.db, TENANT, bob, tierScope))?.status).toBe("revoked");
  });

  it("reaches the same final state in the reverse order", async () => {
    await applyEntitlementEvents(t.db, [
      grant({ eventId: "evt_upd", occurredAt: 90, expiresAt: 99999 }),
    ]);
    await applyEntitlementEvents(t.db, [
      revoke({ eventId: "evt_del", occurredAt: 100 }),
    ]);

    expect((await getEntitlement(t.db, TENANT, bob, tierScope))?.status).toBe("revoked");
  });

  it("a renewal after a cancellation does re-grant — it is genuinely newer", async () => {
    await applyEntitlementEvents(t.db, [revoke({ eventId: "evt_del", occurredAt: 100 })]);
    await applyEntitlementEvents(t.db, [
      grant({ eventId: "evt_new", occurredAt: 200, expiresAt: 99999 }),
    ]);

    expect((await getEntitlement(t.db, TENANT, bob, tierScope))?.status).toBe("active");
  });
});

// ---------- batch resilience ----------

describe("a malformed event in a batch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not stop the other events being applied", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const good1 = grant({ eventId: "evt_a", scope: { kind: "page", pageId: "p1" } });
    // `scope` is missing its ref, so `scopeColumns` produces an undefined
    // scope_ref and the insert violates NOT NULL.
    const bad = grant({
      eventId: "evt_b",
      scope: { kind: "page" } as unknown as EntitlementEvent["scope"],
    });
    const good2 = grant({ eventId: "evt_c", scope: { kind: "page", pageId: "p2" } });

    const result = await applyEntitlementEvents(t.db, [good1, bad, good2]);

    expect(result.applied).toBe(2);
    expect(result.failed).toBe(1);
    expect(await hasPageAccess(t.db, TENANT, bob, "p1", 500)).toBe(true);
    expect(await hasPageAccess(t.db, TENANT, bob, "p2", 500)).toBe(true);
  });

  it("does not record a payment_event for the failed one, so a retry can fix it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    await applyEntitlementEvents(t.db, [
      grant({
        eventId: "evt_bad",
        scope: { kind: "page" } as unknown as EntitlementEvent["scope"],
      }),
    ]);

    const rows = await t.client.execute(
      "SELECT COUNT(*) AS n FROM payment_event WHERE event_id = 'evt_bad'",
    );
    expect(rows.rows[0].n).toBe(0);
  });
});

// ---------- customers ----------

describe("customer mapping", () => {
  it("is recorded when the event carries one", async () => {
    await applyEntitlementEvents(t.db, [grant({ customerRef: "cus_123" })]);
    expect(await getPaymentCustomerRef(t.db, TENANT, bob, "stripe")).toBe("cus_123");
  });

  it("is skipped when the event has none", async () => {
    await applyEntitlementEvents(t.db, [grant()]);
    expect(await getPaymentCustomerRef(t.db, TENANT, bob, "stripe")).toBeNull();
  });
});
