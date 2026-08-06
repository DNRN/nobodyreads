import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import { upsertPage } from "../content/db.js";
import { joinPlot } from "../community/db.js";
import type { Page } from "../content/types.js";
import type { MemberIdentity } from "../community/types.js";
import { resolvePageAccess, redactPage, getReadableContent, requiresPrivateCache } from "./access.js";
import { grantEntitlement, revokeEntitlement, upsertPaidTier, nowSeconds } from "./db.js";

const TENANT = "t1";
const OTHER_TENANT = "t2";

const bob: MemberIdentity = { issuer: "platform", subject: "bob", displayName: "Bob" };
const carol: MemberIdentity = { issuer: "platform", subject: "carol", displayName: "Carol" };

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
      amountYearly: 3000,
      active: true,
      createdAt: "2026-01-01",
    },
    TENANT,
  );
});

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: "p1",
    slug: "paid-post",
    title: "Paid post",
    content: "# Paid post\n\nThe secret body.\n\n![below the cut](/media/secret.png)",
    excerpt: "A teaser.",
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

async function seed(page: Page, tenantId = TENANT): Promise<Page> {
  await upsertPage(t.db, page, tenantId);
  return page;
}

// ---------- public ----------

describe("public pages", () => {
  it("are readable by anyone, signed in or not", async () => {
    const page = await seed(makePage());

    expect(await resolvePageAccess(t.db, page, TENANT, null)).toEqual({
      visibility: "full",
      reason: "public",
    });
    expect(await resolvePageAccess(t.db, page, TENANT, bob)).toEqual({
      visibility: "full",
      reason: "public",
    });
  });

  it("need no private cache header", async () => {
    const page = makePage();
    const decision = await resolvePageAccess(t.db, page, TENANT, null);
    expect(requiresPrivateCache(page, decision)).toBe(false);
  });
});

// ---------- members ----------

describe("members-only pages", () => {
  const page = () => makePage({ accessTier: "members" });

  it("show a teaser to an anonymous reader", async () => {
    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, null);
    expect(decision.visibility).toBe("teaser");
    expect(decision).toMatchObject({ reason: "members_only" });
  });

  it("show a teaser to a signed-in reader who has not joined", async () => {
    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, bob);
    expect(decision.visibility).toBe("teaser");
  });

  it("show the full body to a plot member", async () => {
    await joinPlot(t.db, TENANT, bob);
    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, bob);
    expect(decision).toEqual({ visibility: "full", reason: "member" });
  });

  it("do not leak across plots — membership of one plot is not membership of another", async () => {
    await joinPlot(t.db, OTHER_TENANT, bob);
    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, bob);
    expect(decision.visibility).toBe("teaser");
  });

  it("offer no tier — members-only is free", async () => {
    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, null);
    if (decision.visibility !== "teaser") throw new Error("expected teaser");
    expect(decision.tier).toBeNull();
  });
});

// ---------- paid ----------

describe("paid pages", () => {
  const page = () => makePage({ accessTier: "paid", priceAmount: 200 });

  it("show a teaser to an anonymous reader, with the tier and price to offer", async () => {
    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, null);
    if (decision.visibility !== "teaser") throw new Error("expected teaser");
    expect(decision.reason).toBe("payment_required");
    expect(decision.tier?.id).toBe("tier1");
    expect(decision.priceAmount).toBe(200);
    expect(decision.currency).toBe("eur");
  });

  it("show a teaser to a signed-in reader with no entitlement", async () => {
    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, bob);
    expect(decision.visibility).toBe("teaser");
  });

  it("show the full body to a tier subscriber", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: { kind: "tier", tierId: "tier1" },
      source: "stripe",
      expiresAt: nowSeconds() + 3600,
      eventAt: nowSeconds(),
    });

    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, bob);
    expect(decision).toEqual({ visibility: "full", reason: "entitled" });
  });

  it("show the full body to someone who bought this exact page", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: { kind: "page", pageId: "p1" },
      source: "stripe",
      expiresAt: null,
      eventAt: nowSeconds(),
    });

    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, bob);
    expect(decision.visibility).toBe("full");
  });

  it("show a teaser to someone who bought a DIFFERENT page", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: { kind: "page", pageId: "some-other-page" },
      source: "stripe",
      expiresAt: null,
      eventAt: nowSeconds(),
    });

    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, bob);
    expect(decision.visibility).toBe("teaser");
  });

  it("do not leak across plots — an entitlement on one plot grants nothing on another", async () => {
    await grantEntitlement(t.db, OTHER_TENANT, {
      member: bob,
      scope: { kind: "tier", tierId: "tier1" },
      source: "stripe",
      expiresAt: nowSeconds() + 3600,
      eventAt: nowSeconds(),
    });

    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, bob);
    expect(decision.visibility).toBe("teaser");
  });

  it("do not leak across members", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: { kind: "tier", tierId: "tier1" },
      source: "stripe",
      expiresAt: nowSeconds() + 3600,
      eventAt: nowSeconds(),
    });

    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, carol);
    expect(decision.visibility).toBe("teaser");
  });

  it("treat an expired entitlement as no entitlement", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: { kind: "tier", tierId: "tier1" },
      source: "stripe",
      expiresAt: nowSeconds() - 60,
      eventAt: nowSeconds(),
    });

    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, bob);
    expect(decision.visibility).toBe("teaser");
  });

  it("treat a NULL expiry as never expiring", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: { kind: "tier", tierId: "tier1" },
      source: "stripe",
      expiresAt: null,
      eventAt: nowSeconds(),
    });

    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, bob);
    expect(decision.visibility).toBe("full");
  });

  it("treat a revoked entitlement as no entitlement", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: { kind: "tier", tierId: "tier1" },
      source: "stripe",
      expiresAt: null,
      eventAt: 100,
    });
    await revokeEntitlement(t.db, TENANT, {
      member: bob,
      scope: { kind: "tier", tierId: "tier1" },
      eventAt: 200,
    });

    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, bob);
    expect(decision.visibility).toBe("teaser");
  });

  it("require a private cache header for an entitled reader's full render", async () => {
    await grantEntitlement(t.db, TENANT, {
      member: bob,
      scope: { kind: "tier", tierId: "tier1" },
      source: "stripe",
      expiresAt: null,
      eventAt: nowSeconds(),
    });

    const p = await seed(page());
    const decision = await resolvePageAccess(t.db, p, TENANT, bob);
    expect(requiresPrivateCache(p, decision)).toBe(true);
  });
});

// ---------- ownership and preview ----------

describe("owner and preview", () => {
  const page = () => makePage({ accessTier: "paid" });

  it("shows the owner the full body without any entitlement", async () => {
    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, null, {
      isOwner: true,
    });
    expect(decision).toEqual({ visibility: "full", reason: "owner" });
  });

  it("honours previewAs=public for the owner", async () => {
    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, null, {
      isOwner: true,
      previewAs: "public",
    });
    expect(decision.visibility).toBe("teaser");
  });

  it("honours previewAs=member on a members-only page", async () => {
    const p = await seed(makePage({ accessTier: "members" }));
    const decision = await resolvePageAccess(t.db, p, TENANT, null, {
      isOwner: true,
      previewAs: "member",
    });
    expect(decision).toEqual({ visibility: "full", reason: "preview" });
  });

  it("still gates a paid page under previewAs=member", async () => {
    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, null, {
      isOwner: true,
      previewAs: "member",
    });
    expect(decision.visibility).toBe("teaser");
  });

  it("IGNORES previewAs for a non-owner — the query param must change nothing", async () => {
    // The mirror image of the bypass: a reader appending ?preview=owner.
    const decision = await resolvePageAccess(t.db, await seed(page()), TENANT, bob, {
      isOwner: false,
      previewAs: "owner",
    });
    expect(decision.visibility).toBe("teaser");
  });
});

// ---------- failing closed ----------

describe("unknown access tiers fail closed", () => {
  it("gates a page whose tier this build does not recognise", async () => {
    // Not reachable through upsertPage (which coerces), but reachable through a
    // direct write or a future tier this deploy has not shipped yet.
    const page = makePage({ accessTier: "subscribers-only-tier-9" });
    const decision = await resolvePageAccess(t.db, page, TENANT, bob);
    expect(decision.visibility).toBe("teaser");
  });

  it("coerces an unknown tier to public on the way into storage", async () => {
    await upsertPage(t.db, makePage({ accessTier: "nonsense" }), TENANT);
    const rows = await t.client.execute("SELECT access_tier FROM page WHERE page_id = 'p1'");
    expect(rows.rows[0].access_tier).toBe("public");
  });
});

// ---------- redaction ----------

describe("redactPage", () => {
  it("leaves a full decision untouched", async () => {
    const p = makePage();
    const decision = await resolvePageAccess(t.db, p, TENANT, null);
    expect(redactPage(p, decision).content).toBe(p.content);
  });

  it("replaces the body with the teaser on a gated decision", async () => {
    const p = makePage({ accessTier: "paid" });
    const decision = await resolvePageAccess(t.db, p, TENANT, null);
    const safe = redactPage(p, decision);

    expect(safe.content).toBe("A teaser.");
    expect(safe.content).not.toContain("The secret body.");
  });

  it("leaves no below-the-cut image reachable to firstImageUrl / og:image", async () => {
    const p = makePage({ accessTier: "paid" });
    const decision = await resolvePageAccess(t.db, p, TENANT, null);
    const safe = redactPage(p, decision);

    // resolveOgImage needs no paywall awareness *provided* every caller hands it
    // an already-redacted page. This is that guarantee, asserted.
    expect(safe.content).not.toContain("/media/secret.png");
  });

  it("does not mutate the page it was given", async () => {
    const p = makePage({ accessTier: "paid" });
    const decision = await resolvePageAccess(t.db, p, TENANT, null);
    redactPage(p, decision);
    expect(p.content).toContain("The secret body.");
  });
});

// ---------- getReadableContent ----------

describe("getReadableContent", () => {
  it("returns a safe page, the decision, and the gated flag together", async () => {
    const raw = await seed(makePage({ accessTier: "paid" }));
    const { page, decision, gated } = await getReadableContent(t.db, raw, TENANT, null);

    expect(gated).toBe(true);
    expect(decision.visibility).toBe("teaser");
    expect(page.content).not.toContain("The secret body.");
    // Everything else survives — the caller still needs title, slug, seo…
    expect(page.title).toBe("Paid post");
  });

  it("passes a public page straight through", async () => {
    const raw = await seed(makePage());
    const { page, gated } = await getReadableContent(t.db, raw, TENANT, null);
    expect(gated).toBe(false);
    expect(page.content).toBe(raw.content);
  });
});
