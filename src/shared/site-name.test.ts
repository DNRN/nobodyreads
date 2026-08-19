import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../test/db.js";
import {
  resolveSiteName,
  setSiteSetting,
  SETTING_SITE_NAME,
} from "./site-settings.js";

/**
 * `SITE_NAME` is a default, not an override. These pin the precedence the
 * public pages depend on — before this, they read the env var directly and
 * handed it to SiteLayout as `options.siteName`, which outranks the layout's
 * own resolution and left the Brand field editable but inert.
 */

const TENANT = "_default";

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

afterEach(() => {
  delete process.env.SITE_NAME;
});

describe("resolveSiteName", () => {
  it("prefers the Brand setting over the environment", async () => {
    process.env.SITE_NAME = "From Env";
    await setSiteSetting(t.db, TENANT, SETTING_SITE_NAME, "Dennis's Corner");

    expect(await resolveSiteName(t.db, TENANT)).toBe("Dennis's Corner");
  });

  it("falls back to the environment when Brand is unset", async () => {
    process.env.SITE_NAME = "From Env";

    expect(await resolveSiteName(t.db, TENANT)).toBe("From Env");
  });

  it("falls back to the caller's default when neither is set", async () => {
    expect(await resolveSiteName(t.db, TENANT, "dnrn")).toBe("dnrn");
  });

  it("treats an empty Brand value as unset rather than as a name", async () => {
    process.env.SITE_NAME = "From Env";
    await setSiteSetting(t.db, TENANT, SETTING_SITE_NAME, "");

    expect(await resolveSiteName(t.db, TENANT)).toBe("From Env");
  });

  it("resolves per tenant", async () => {
    await setSiteSetting(t.db, TENANT, SETTING_SITE_NAME, "Mine");
    await setSiteSetting(t.db, "other", SETTING_SITE_NAME, "Theirs");

    expect(await resolveSiteName(t.db, TENANT)).toBe("Mine");
    expect(await resolveSiteName(t.db, "other")).toBe("Theirs");
  });
});
