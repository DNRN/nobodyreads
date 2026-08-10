import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import { DEFAULT_TEMPLATE } from "../template/defaults.js";
import type { SiteTemplateDefinition } from "../template/types.js";

vi.mock("./db.js", () => ({ getRawClient: () => testClient }));

import {
  listSiteTemplateTrials,
  getSiteTemplateTrial,
  saveSiteTemplateTrial,
  deleteSiteTemplateTrial,
  addSiteTemplateRevision,
  listSiteTemplateRevisions,
  getCurrentSiteTemplateRevisionId,
} from "./site-bundle.js";

const TENANT = "_default";
const OTHER = "other-tenant";

let t: TestDb;
let testClient: import("@libsql/client").Client;

beforeEach(async () => {
  t = await createTestDb();
  testClient = t.client;
});

function themed(accent: string): SiteTemplateDefinition {
  return {
    ...DEFAULT_TEMPLATE,
    tokens: {
      ...DEFAULT_TEMPLATE.tokens,
      light: { ...DEFAULT_TEMPLATE.tokens.light, accent },
    },
  };
}

describe("saved theme trials", () => {
  it("round-trips a banked look", async () => {
    await saveSiteTemplateTrial(
      t.db,
      { trialId: "t1", name: "Field Journal", template: themed("#5b8a6a") },
      TENANT,
    );

    const trial = await getSiteTemplateTrial(t.db, "t1", TENANT);
    expect(trial?.name).toBe("Field Journal");
    expect(trial?.template.tokens.light.accent).toBe("#5b8a6a");
  });

  it("lists newest first", async () => {
    await saveSiteTemplateTrial(t.db, { trialId: "a", name: "One", template: themed("#111111") }, TENANT);
    await new Promise((r) => setTimeout(r, 5));
    await saveSiteTemplateTrial(t.db, { trialId: "b", name: "Two", template: themed("#222222") }, TENANT);

    expect((await listSiteTemplateTrials(t.db, TENANT)).map((x) => x.name)).toEqual(["Two", "One"]);
  });

  it("replaces rather than duplicating when saving over an id", async () => {
    await saveSiteTemplateTrial(t.db, { trialId: "t1", name: "First", template: themed("#111111") }, TENANT);
    await saveSiteTemplateTrial(t.db, { trialId: "t1", name: "Renamed", template: themed("#222222") }, TENANT);

    const trials = await listSiteTemplateTrials(t.db, TENANT);
    expect(trials).toHaveLength(1);
    expect(trials[0]!.name).toBe("Renamed");
    expect(trials[0]!.template.tokens.light.accent).toBe("#222222");
  });

  it("deletes", async () => {
    await saveSiteTemplateTrial(t.db, { trialId: "t1", name: "One", template: themed("#111111") }, TENANT);
    await deleteSiteTemplateTrial(t.db, "t1", TENANT);
    expect(await listSiteTemplateTrials(t.db, TENANT)).toEqual([]);
    expect(await getSiteTemplateTrial(t.db, "t1", TENANT)).toBeNull();
  });

  it("is scoped per tenant", async () => {
    await saveSiteTemplateTrial(t.db, { trialId: "t1", name: "Mine", template: themed("#111111") }, TENANT);
    await saveSiteTemplateTrial(t.db, { trialId: "t1", name: "Theirs", template: themed("#222222") }, OTHER);

    expect((await listSiteTemplateTrials(t.db, TENANT)).map((x) => x.name)).toEqual(["Mine"]);
    expect(await getSiteTemplateTrial(t.db, "t1", OTHER)).toMatchObject({ name: "Theirs" });

    await deleteSiteTemplateTrial(t.db, "t1", OTHER);
    expect(await getSiteTemplateTrial(t.db, "t1", TENANT)).toMatchObject({ name: "Mine" });
  });
});

/**
 * Trials and revisions were kept apart on purpose: history is appended by every
 * save, a trial is banked deliberately. Neither may leak into the other, or the
 * strip fills with autosaves and publishing a look becomes accidental.
 */
describe("trials stay separate from revision history", () => {
  it("banking a trial adds no revision and publishes nothing", async () => {
    await saveSiteTemplateTrial(t.db, { trialId: "t1", name: "One", template: themed("#111111") }, TENANT);

    expect(await listSiteTemplateRevisions(t.db, TENANT)).toEqual([]);
    expect(await getCurrentSiteTemplateRevisionId(t.db, TENANT)).toBeNull();
  });

  it("saving a revision adds no trial", async () => {
    await addSiteTemplateRevision(t.db, themed("#111111"), TENANT);
    expect(await listSiteTemplateTrials(t.db, TENANT)).toEqual([]);
  });
});
