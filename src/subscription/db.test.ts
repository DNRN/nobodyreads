import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import {
  addSubscriber,
  verifySubscriber,
  unsubscribeByEmail,
  unsubscribeById,
  listVerifiedSubscribers,
  listAllSubscribers,
  deleteSubscriber,
} from "./db.js";

const TENANT = "_default";

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

// ---------- addSubscriber ----------

describe("addSubscriber", () => {
  it("creates a new subscriber and returns a token", async () => {
    const { token, alreadySubscribed } = await addSubscriber(t.db, TENANT, "alice@example.com");
    expect(alreadySubscribed).toBe(false);
    expect(token).toBeTypeOf("string");
    expect(token!.length).toBeGreaterThan(0);
  });

  it("normalizes email to lowercase and trims whitespace", async () => {
    await addSubscriber(t.db, TENANT, "  Alice@Example.COM  ");
    const all = await listAllSubscribers(t.db, TENANT);
    expect(all).toHaveLength(1);
    expect(all[0].email).toBe("alice@example.com");
  });

  it("resets token for an existing unverified subscriber", async () => {
    const first = await addSubscriber(t.db, TENANT, "alice@example.com");
    const second = await addSubscriber(t.db, TENANT, "alice@example.com");

    expect(second.alreadySubscribed).toBe(false);
    expect(second.token).not.toBe(first.token);

    const all = await listAllSubscribers(t.db, TENANT);
    expect(all).toHaveLength(1);
  });

  it("returns alreadySubscribed for verified active subscriber", async () => {
    const { token } = await addSubscriber(t.db, TENANT, "alice@example.com");
    await verifySubscriber(t.db, TENANT, token!);

    const result = await addSubscriber(t.db, TENANT, "alice@example.com");
    expect(result.alreadySubscribed).toBe(true);
    expect(result.token).toBeNull();
  });

  it("re-subscribes after unsubscribe", async () => {
    const { token } = await addSubscriber(t.db, TENANT, "alice@example.com");
    await verifySubscriber(t.db, TENANT, token!);
    await unsubscribeByEmail(t.db, TENANT, "alice@example.com");

    const result = await addSubscriber(t.db, TENANT, "alice@example.com");
    expect(result.alreadySubscribed).toBe(false);
    expect(result.token).toBeTypeOf("string");
  });
});

// ---------- verifySubscriber ----------

describe("verifySubscriber", () => {
  it("verifies with a valid token", async () => {
    const { token } = await addSubscriber(t.db, TENANT, "alice@example.com");
    const ok = await verifySubscriber(t.db, TENANT, token!);
    expect(ok).toBe(true);

    const verified = await listVerifiedSubscribers(t.db, TENANT);
    expect(verified).toHaveLength(1);
    expect(verified[0].verified).toBe(true);
    expect(verified[0].verifiedAt).toBeTypeOf("string");
  });

  it("returns false for invalid token", async () => {
    const ok = await verifySubscriber(t.db, TENANT, "bogus-token");
    expect(ok).toBe(false);
  });

  it("returns false when token is already used", async () => {
    const { token } = await addSubscriber(t.db, TENANT, "alice@example.com");
    await verifySubscriber(t.db, TENANT, token!);
    const second = await verifySubscriber(t.db, TENANT, token!);
    expect(second).toBe(false);
  });
});

// ---------- unsubscribeByEmail ----------

describe("unsubscribeByEmail", () => {
  it("unsubscribes a verified subscriber", async () => {
    const { token } = await addSubscriber(t.db, TENANT, "alice@example.com");
    await verifySubscriber(t.db, TENANT, token!);

    const ok = await unsubscribeByEmail(t.db, TENANT, "alice@example.com");
    expect(ok).toBe(true);

    const verified = await listVerifiedSubscribers(t.db, TENANT);
    expect(verified).toHaveLength(0);
  });

  it("returns false if already unsubscribed", async () => {
    const { token } = await addSubscriber(t.db, TENANT, "alice@example.com");
    await verifySubscriber(t.db, TENANT, token!);
    await unsubscribeByEmail(t.db, TENANT, "alice@example.com");

    const second = await unsubscribeByEmail(t.db, TENANT, "alice@example.com");
    expect(second).toBe(false);
  });
});

// ---------- unsubscribeById ----------

describe("unsubscribeById", () => {
  it("unsubscribes by subscriber id", async () => {
    const { token } = await addSubscriber(t.db, TENANT, "alice@example.com");
    await verifySubscriber(t.db, TENANT, token!);

    const all = await listAllSubscribers(t.db, TENANT);
    const id = all[0].id;

    const ok = await unsubscribeById(t.db, TENANT, id);
    expect(ok).toBe(true);

    const verified = await listVerifiedSubscribers(t.db, TENANT);
    expect(verified).toHaveLength(0);
  });

  it("returns false if already unsubscribed", async () => {
    const { token } = await addSubscriber(t.db, TENANT, "alice@example.com");
    await verifySubscriber(t.db, TENANT, token!);

    const all = await listAllSubscribers(t.db, TENANT);
    const id = all[0].id;

    await unsubscribeById(t.db, TENANT, id);
    const second = await unsubscribeById(t.db, TENANT, id);
    expect(second).toBe(false);
  });
});

// ---------- listVerifiedSubscribers ----------

describe("listVerifiedSubscribers", () => {
  it("returns only verified and active subscribers", async () => {
    const r1 = await addSubscriber(t.db, TENANT, "verified@test.com");
    await verifySubscriber(t.db, TENANT, r1.token!);

    await addSubscriber(t.db, TENANT, "unverified@test.com");

    const r3 = await addSubscriber(t.db, TENANT, "unsub@test.com");
    await verifySubscriber(t.db, TENANT, r3.token!);
    await unsubscribeByEmail(t.db, TENANT, "unsub@test.com");

    const verified = await listVerifiedSubscribers(t.db, TENANT);
    expect(verified).toHaveLength(1);
    expect(verified[0].email).toBe("verified@test.com");
  });
});

// ---------- listAllSubscribers ----------

describe("listAllSubscribers", () => {
  it("returns all subscribers regardless of state", async () => {
    const r1 = await addSubscriber(t.db, TENANT, "a@test.com");
    await verifySubscriber(t.db, TENANT, r1.token!);

    await addSubscriber(t.db, TENANT, "b@test.com");

    const r3 = await addSubscriber(t.db, TENANT, "c@test.com");
    await verifySubscriber(t.db, TENANT, r3.token!);
    await unsubscribeByEmail(t.db, TENANT, "c@test.com");

    const all = await listAllSubscribers(t.db, TENANT);
    expect(all).toHaveLength(3);
  });
});

// ---------- deleteSubscriber ----------

describe("deleteSubscriber", () => {
  it("hard-deletes a subscriber", async () => {
    await addSubscriber(t.db, TENANT, "alice@example.com");
    const all = await listAllSubscribers(t.db, TENANT);
    expect(all).toHaveLength(1);

    await deleteSubscriber(t.db, TENANT, all[0].id);
    const afterDelete = await listAllSubscribers(t.db, TENANT);
    expect(afterDelete).toHaveLength(0);
  });
});
