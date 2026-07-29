import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import type { Page } from "../content/types.js";
import type { AiProviderConfig } from "../admin/server/modules/types.js";
import type { ModerationVerdict } from "./types.js";

// The provider is the only thing standing between this test and a network
// call, so it is mocked; everything else (settings, thresholds) runs for real.
const generateVerdict = vi.fn<() => Promise<ModerationVerdict>>();
vi.mock("../api/ai/moderation-provider.js", () => ({
  createModerationProvider: () => ({ generateVerdict }),
}));

import { reviewComment } from "./pipeline.js";
import { setModerationAutoHide } from "./db.js";

const TENANT = "t1";
const AI: AiProviderConfig = { provider: "anthropic", apiKey: "k", model: "m" };

const post = {
  id: "p1",
  title: "A post",
  excerpt: "An excerpt",
} as Page;

let testDb: TestDb;

function review(overrides: Partial<Parameters<typeof reviewComment>[0]> = {}) {
  return reviewComment({
    db: testDb.db,
    tenantId: TENANT,
    ai: AI,
    rulesetSource: () => "Be kind.",
    post,
    parentChain: [],
    authorName: "Reader",
    body: "a comment",
    ...overrides,
  });
}

function verdict(over: Partial<ModerationVerdict> = {}): ModerationVerdict {
  return { verdict: "hold", reason: "r", rule: null, confidence: 0.9, ...over };
}

beforeEach(async () => {
  testDb = await createTestDb();
  generateVerdict.mockReset();
});

describe("reviewComment — when it declines to run", () => {
  it("publishes when no ruleset is configured", async () => {
    generateVerdict.mockResolvedValue(verdict({ verdict: "reject" }));
    const decision = await review({ rulesetSource: () => null });
    expect(decision).toEqual({ action: "publish" });
    expect(generateVerdict).not.toHaveBeenCalled();
  });

  it("publishes when the ruleset is only whitespace", async () => {
    const decision = await review({ rulesetSource: () => "   \n " });
    expect(decision).toEqual({ action: "publish" });
    expect(generateVerdict).not.toHaveBeenCalled();
  });

  it("publishes when no AI provider is configured", async () => {
    const decision = await review({ ai: undefined });
    expect(decision).toEqual({ action: "publish" });
    expect(generateVerdict).not.toHaveBeenCalled();
  });

  it("fails open when the provider throws", async () => {
    generateVerdict.mockRejectedValue(new Error("provider down"));
    expect(await review()).toEqual({ action: "publish" });
  });
});

describe("reviewComment — verdicts", () => {
  it("publishes an allow verdict without flagging", async () => {
    generateVerdict.mockResolvedValue(verdict({ verdict: "allow" }));
    expect(await review()).toEqual({ action: "publish" });
  });

  it("publishes a non-allow verdict below the confidence threshold", async () => {
    generateVerdict.mockResolvedValue(verdict({ confidence: 0.5 }));
    expect(await review()).toEqual({ action: "publish" });
  });

  it("respects a caller-supplied threshold", async () => {
    generateVerdict.mockResolvedValue(verdict({ confidence: 0.5 }));
    const decision = await review({ confidenceThreshold: 0.4 });
    expect(decision.action).toBe("hold");
  });
});

describe("reviewComment — severity split", () => {
  it("holds a hold verdict by default", async () => {
    generateVerdict.mockResolvedValue(verdict());
    const decision = await review();
    expect(decision.action).toBe("hold");
    expect(decision.flag).toMatchObject({ verdict: "hold", confidence: 0.9 });
  });

  it("publishes a hold verdict when the space turns auto-hide off, still flagging it", async () => {
    await setModerationAutoHide(testDb.db, TENANT, false);
    generateVerdict.mockResolvedValue(verdict());
    const decision = await review();
    expect(decision.action).toBe("publish");
    expect(decision.flag).toMatchObject({ verdict: "hold" });
  });

  it("holds a reject verdict even when auto-hide is off", async () => {
    await setModerationAutoHide(testDb.db, TENANT, false);
    generateVerdict.mockResolvedValue(verdict({ verdict: "reject" }));
    const decision = await review();
    expect(decision.action).toBe("hold");
    expect(decision.flag).toMatchObject({ verdict: "reject" });
  });

  it("keeps auto-hide per tenant", async () => {
    await setModerationAutoHide(testDb.db, "other", false);
    generateVerdict.mockResolvedValue(verdict());
    expect((await review()).action).toBe("hold");
  });
});

describe("reviewComment — ruleset source", () => {
  it("passes the ruleset text through to the provider", async () => {
    generateVerdict.mockResolvedValue(verdict({ verdict: "allow" }));
    await review({ rulesetSource: () => "# House rules\n\nStay on topic." });
    expect(generateVerdict).toHaveBeenCalledWith(
      expect.objectContaining({ ruleset: "# House rules\n\nStay on topic." })
    );
  });

  it("gives the source the tenant id so a host can vary rules per plot", async () => {
    const source = vi.fn(() => "rules");
    generateVerdict.mockResolvedValue(verdict({ verdict: "allow" }));
    await review({ rulesetSource: source });
    expect(source).toHaveBeenCalledWith(TENANT);
  });
});
