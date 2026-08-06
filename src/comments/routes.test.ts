import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import { createCommentRoutes } from "./routes.js";
import { upsertPage } from "../content/db.js";
import { joinPlot } from "../community/db.js";
import { grantEntitlement, upsertPaidTier, nowSeconds } from "../payments/db.js";
import type { Page } from "../content/types.js";
import type { MemberIdentity } from "../community/types.js";

/**
 * Comments inherit the post's access tier.
 *
 * The bug these tests exist to prevent: the comment router used to check only
 * `commentsEnabled` and "is anyone signed in", so a reader with no membership
 * and no entitlement could post on a members-only or paid post — and read the
 * whole thread, which is exactly where someone quotes the paid body.
 */

const TENANT = "t1";

const bob: MemberIdentity = { issuer: "platform", subject: "bob", displayName: "Bob" };
const alice: MemberIdentity = { issuer: "platform", subject: "alice", displayName: "Alice" };

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
  await upsertPaidTier(
    t.db,
    {
      id: "tier1",
      name: "Supporter",
      currency: "eur",
      amountMonthly: 300,
      amountYearly: null,
      active: true,
      createdAt: "2026-01-01",
    },
    TENANT,
  );
});

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: "p1",
    slug: "a-post",
    title: "A post",
    content: "Body.",
    excerpt: "Teaser.",
    tags: [],
    date: "2026-01-01",
    published: true,
    kind: "post",
    commentsEnabled: true,
    inFeed: true,
    accessTier: "public",
    priceAmount: null,
    ...overrides,
  };
}

/** A router whose viewer is `member`, and who owns the plot iff `owner`. */
function api(member: MemberIdentity | null, owner = false) {
  return createCommentRoutes({
    db: t.db,
    tenantId: TENANT,
    resolveMember: async () => member,
    isOwner: () => owner,
  });
}

async function post(member: MemberIdentity | null, owner = false) {
  return api(member, owner).request("/posts/a-post/comments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "Hello" }),
  });
}

async function thread(member: MemberIdentity | null, owner = false) {
  const res = await api(member, owner).request("/posts/a-post/comments");
  return (await res.json()) as { comments: unknown[]; gated?: boolean; accessTier?: string };
}

async function subscribe(member: MemberIdentity) {
  await grantEntitlement(t.db, TENANT, {
    member,
    scope: { kind: "tier", tierId: "tier1" },
    source: "stripe",
    expiresAt: nowSeconds() + 3600,
    eventAt: nowSeconds(),
  });
}

// ---------- public posts are unchanged ----------

describe("public posts", () => {
  beforeEach(async () => {
    await upsertPage(t.db, makePage(), TENANT);
  });

  it("let any signed-in reader comment", async () => {
    expect((await post(bob)).status).toBe(201);
  });

  it("still require a signed-in reader", async () => {
    expect((await post(null)).status).toBe(401);
  });

  it("still honour commentsEnabled", async () => {
    await upsertPage(t.db, makePage({ commentsEnabled: false }), TENANT);
    expect((await post(bob)).status).toBe(403);
  });
});

// ---------- members-only ----------

describe("members-only posts", () => {
  beforeEach(async () => {
    await upsertPage(t.db, makePage({ accessTier: "members" }), TENANT);
  });

  it("REJECT a comment from a signed-in reader who has not joined", async () => {
    // The reported bug.
    const res = await post(bob);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "access_required" });
  });

  it("accept a comment from a plot member", async () => {
    await joinPlot(t.db, TENANT, bob);
    expect((await post(bob)).status).toBe(201);
  });

  it("accept a comment from the owner", async () => {
    expect((await post(alice, true)).status).toBe(201);
  });

  it("prefer 401 over 403 for a signed-out reader", async () => {
    // They may well already be a member — send them to log in, not to join.
    expect((await post(null)).status).toBe(401);
  });

  it("hide the thread from a non-member", async () => {
    await joinPlot(t.db, TENANT, alice);
    await post(alice);

    const seen = await thread(bob);
    expect(seen.gated).toBe(true);
    expect(seen.comments).toEqual([]);
    expect(seen.accessTier).toBe("members");
  });

  it("show the thread to a member", async () => {
    await joinPlot(t.db, TENANT, alice);
    await post(alice);
    await joinPlot(t.db, TENANT, bob);

    const seen = await thread(bob);
    expect(seen.gated).toBeUndefined();
    expect(seen.comments).toHaveLength(1);
  });
});

// ---------- paid ----------

describe("paid posts", () => {
  beforeEach(async () => {
    await upsertPage(t.db, makePage({ accessTier: "paid" }), TENANT);
  });

  it("reject a comment from a signed-in reader with no entitlement", async () => {
    expect((await post(bob)).status).toBe(403);
  });

  it("reject a comment from a plot member who has not subscribed", async () => {
    // Joining a plot is free; it is not a subscription.
    await joinPlot(t.db, TENANT, bob);
    expect((await post(bob)).status).toBe(403);
  });

  it("accept a comment from a subscriber", async () => {
    await subscribe(bob);
    expect((await post(bob)).status).toBe(201);
  });

  it("accept a comment from the owner", async () => {
    expect((await post(alice, true)).status).toBe(201);
  });

  it("hide the thread from a non-subscriber, so the paid body cannot leak through a quote", async () => {
    await subscribe(alice);
    await post(alice);

    const seen = await thread(bob);
    expect(seen.gated).toBe(true);
    expect(seen.comments).toEqual([]);
  });

  it("show the thread to a subscriber", async () => {
    await subscribe(alice);
    await post(alice);
    await subscribe(bob);

    expect((await thread(bob)).comments).toHaveLength(1);
  });

  it("hide the thread again once the entitlement expires", async () => {
    await subscribe(alice);
    await post(alice);

    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: { kind: "tier", tierId: "tier1" },
      source: "stripe",
      expiresAt: nowSeconds() - 60,
      eventAt: nowSeconds(),
    });

    expect((await thread(bob)).gated).toBe(true);
  });
});

// ---------- ownership is host-supplied ----------

describe("isOwner", () => {
  it("does nothing for a reader the host does not call an owner", async () => {
    await upsertPage(t.db, makePage({ accessTier: "paid" }), TENANT);
    expect((await post(bob, false)).status).toBe(403);
  });

  it("falls back to canModerate when isOwner is not supplied", async () => {
    // Every host today means the same thing by both; the default keeps their
    // existing wiring working without a change.
    await upsertPage(t.db, makePage({ accessTier: "paid" }), TENANT);

    const app = createCommentRoutes({
      db: t.db,
      tenantId: TENANT,
      resolveMember: async () => alice,
      canModerate: () => true,
    });

    const res = await app.request("/posts/a-post/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Hello" }),
    });
    expect(res.status).toBe(201);
  });
});
