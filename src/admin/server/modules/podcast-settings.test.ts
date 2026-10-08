import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { createTestDb, type TestDb } from "../../../test/db.js";
import { getSiteSettings } from "../../../shared/site-settings.js";
import { createThemeRoutes } from "./theme.js";
import type { AdminModuleContext } from "./types.js";

/**
 * Show-level podcast settings land in a public feed, and directories act on
 * two of them: the owner email (ownership verification) and the category (a
 * rejection reason). A bad value for either must leave nothing half-saved.
 */

const TENANT = "_default";
let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

function save(fields: Record<string, string>) {
  const ctx = {
    db: t.db,
    tenantId: TENANT,
    urlPrefix: "",
    adminBase: "/admin",
    editorBase: "/admin/editor",
  } satisfies AdminModuleContext;
  const app = new Hono();
  app.route("/", createThemeRoutes(ctx));
  return app.request("/settings/podcast/save", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(fields),
  });
}

const valid = {
  "podcast:artwork": "https://cdn.test/cover.png",
  "podcast:author": "Dennis",
  "podcast:owner_email": "dennis@example.com",
  "podcast:category": "Technology",
  "podcast:explicit": "on",
};

describe("POST /settings/podcast/save", () => {
  it("stores every field", async () => {
    expect((await save(valid)).status).toBe(200);

    expect(await getSiteSettings(t.db, TENANT)).toMatchObject({
      podcast_artwork: "https://cdn.test/cover.png",
      podcast_author: "Dennis",
      podcast_owner_email: "dennis@example.com",
      podcast_category: "Technology",
      podcast_explicit: "on",
    });
  });

  it("refuses a malformed owner email and saves nothing else either", async () => {
    const res = await save({ ...valid, "podcast:owner_email": "dennis-at-example" });

    expect(res.status).toBe(400);
    expect(await getSiteSettings(t.db, TENANT)).toEqual({});
  });

  it("refuses a category directories do not know", async () => {
    const res = await save({ ...valid, "podcast:category": "Underwater Basket Weaving" });

    expect(res.status).toBe(400);
    expect(await getSiteSettings(t.db, TENANT)).toEqual({});
  });

  it("clears a field saved empty, and the explicit flag when unchecked", async () => {
    await save(valid);

    // An unchecked box submits only its hidden "off" companion.
    await save({ ...valid, "podcast:owner_email": "", "podcast:explicit": "off" });

    const settings = await getSiteSettings(t.db, TENANT);
    expect(settings.podcast_owner_email).toBeUndefined();
    expect(settings.podcast_explicit).toBeUndefined();
    expect(settings.podcast_author).toBe("Dennis");
  });
});
