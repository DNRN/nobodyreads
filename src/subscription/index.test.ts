import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import { addSubscriber, verifySubscriber } from "./db.js";

// `index.ts` resolves an email provider per-request and calls the template
// senders. We mock the whole email module so no real provider/network is hit
// and we can assert on what gets sent.
vi.mock("./email.js", () => ({
  resolveEmailProvider: vi.fn(() => ({ sendEmail: vi.fn() })),
  sendVerificationEmail: vi.fn(),
  sendNewPostNotification: vi.fn(),
}));

import * as email from "./email.js";
import { createSubscriptionApiRoutes, notifySubscribers } from "./index.js";
import type { Hono } from "hono";

const TENANT = "_default";

let t: TestDb;
let app: Hono;

beforeEach(async () => {
  t = await createTestDb();
  app = createSubscriptionApiRoutes({ db: t.db });
  vi.mocked(email.resolveEmailProvider).mockReturnValue({ sendEmail: vi.fn() });
  vi.mocked(email.sendVerificationEmail).mockReset();
  vi.mocked(email.sendNewPostNotification).mockReset();
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

  it("returns 403 when email is disabled", async () => {
    vi.mocked(email.resolveEmailProvider).mockReturnValueOnce(null);
    const res = await app.request("/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=alice@example.com",
    });
    expect(res.status).toBe(403);
    const html = await res.text();
    expect(html).toContain("Subscriptions disabled");
  });

  it("subscribes with a valid email and sends a verification email", async () => {
    const res = await app.request("/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=alice@example.com",
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Check your email");
    expect(email.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("tells an unconfirmed subscriber to validate their email", async () => {
    // First signup leaves the email pending confirmation.
    await addSubscriber(t.db, TENANT, "alice@example.com");

    const res = await app.request("/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=alice@example.com",
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Almost there");
    expect(html).toContain("validate your email");
    // The confirmation link is re-sent so the user can complete opt-in.
    expect(email.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("returns already-subscribed for a verified subscriber", async () => {
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
    // No verification email for an already-confirmed subscriber.
    expect(email.sendVerificationEmail).not.toHaveBeenCalled();
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

// ---------- notifySubscribers ----------

const post = { title: "Hello World", slug: "hello-world", excerpt: "An intro." };

describe("notifySubscribers", () => {
  it("notifies all verified subscribers", async () => {
    const r1 = await addSubscriber(t.db, TENANT, "alice@example.com");
    await verifySubscriber(t.db, TENANT, r1.token!);
    const r2 = await addSubscriber(t.db, TENANT, "bob@example.com");
    await verifySubscriber(t.db, TENANT, r2.token!);

    await notifySubscribers(t.db, TENANT, post);

    expect(email.sendNewPostNotification).toHaveBeenCalledTimes(1);
    const args = vi.mocked(email.sendNewPostNotification).mock.calls[0];
    // (provider, siteUrl, siteName, post, subscribers)
    expect(args[3]).toEqual(post);
    expect(args[4]).toHaveLength(2);
  });

  it("skips unverified and unsubscribed subscribers", async () => {
    // pending (never verified)
    await addSubscriber(t.db, TENANT, "pending@example.com");
    // verified then unsubscribed
    const r = await addSubscriber(t.db, TENANT, "left@example.com");
    await verifySubscriber(t.db, TENANT, r.token!);
    const { unsubscribeByEmail } = await import("./db.js");
    await unsubscribeByEmail(t.db, TENANT, "left@example.com");

    await notifySubscribers(t.db, TENANT, post);

    expect(email.sendNewPostNotification).not.toHaveBeenCalled();
  });

  it("does nothing when email is disabled", async () => {
    const r = await addSubscriber(t.db, TENANT, "alice@example.com");
    await verifySubscriber(t.db, TENANT, r.token!);
    vi.mocked(email.resolveEmailProvider).mockReturnValueOnce(null);

    await notifySubscribers(t.db, TENANT, post);

    expect(email.sendNewPostNotification).not.toHaveBeenCalled();
  });
});
