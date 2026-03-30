import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import { addSubscriber, verifySubscriber } from "./db.js";

vi.mock("./email.js", () => ({
  isEmailEnabled: () => true,
  createEmailProvider: () => ({ sendEmail: vi.fn() }),
  sendVerificationEmail: vi.fn(),
  sendNewPostNotification: vi.fn(),
}));

import { createSubscriptionApiRoutes } from "./index.js";
import type { Hono } from "hono";

const TENANT = "_default";

let t: TestDb;
let app: Hono;

beforeEach(async () => {
  t = await createTestDb();
  app = createSubscriptionApiRoutes({ db: t.db });
});

// ---------- POST /subscribe ----------

describe("POST /subscribe", () => {
  it("returns 400 for invalid email", async () => {
    const res = await app.request("/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=not-an-email",
    });
    expect(res.status).toBe(400);
  });

  it("subscribes with a valid email", async () => {
    const res = await app.request("/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=alice@example.com",
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Check your email");
  });

  it("returns already-subscribed for verified subscriber", async () => {
    const { token } = await addSubscriber(t.db, TENANT, "alice@example.com");
    await verifySubscriber(t.db, TENANT, token!);

    const res = await app.request("/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=alice@example.com",
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Already subscribed");
  });
});

// ---------- GET /subscribe/verify ----------

describe("GET /subscribe/verify", () => {
  it("returns 400 without a token", async () => {
    const res = await app.request("/subscribe/verify");
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Invalid link");
  });

  it("verifies with a valid token", async () => {
    const { token } = await addSubscriber(t.db, TENANT, "alice@example.com");
    const res = await app.request(`/subscribe/verify?token=${token}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("confirmed");
  });

  it("returns 400 for invalid token", async () => {
    const res = await app.request("/subscribe/verify?token=bogus");
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("no longer valid");
  });
});

// ---------- GET /unsubscribe ----------

describe("GET /unsubscribe", () => {
  it("returns 400 without an id", async () => {
    const res = await app.request("/unsubscribe");
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Invalid link");
  });

  it("unsubscribes with a valid id", async () => {
    const { token } = await addSubscriber(t.db, TENANT, "alice@example.com");
    await verifySubscriber(t.db, TENANT, token!);

    const { listAllSubscribers } = await import("./db.js");
    const all = await listAllSubscribers(t.db, TENANT);
    const id = all[0].id;

    const res = await app.request(`/unsubscribe?id=${id}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Unsubscribed");
  });

  it("returns already-unsubscribed for unknown id", async () => {
    const res = await app.request("/unsubscribe?id=nonexistent");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Already unsubscribed");
  });
});
