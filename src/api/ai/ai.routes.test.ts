import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../test/db.js";
import { createAiApiRoutes } from "./ai.routes.js";

/**
 * Regression: the theme provider used to be constructed eagerly in this
 * factory, and `new OpenAI` throws on missing credentials — so the standalone
 * server crashed at boot whenever AI env vars were unset, even though AI is
 * optional. A missing key must surface as a 503 on the route, not kill
 * startup.
 */

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

describe("createAiApiRoutes", () => {
  it("constructs without AI credentials", () => {
    expect(() =>
      createAiApiRoutes({ db: t.db, openaiApiKey: "", openaiBaseRoute: "" }),
    ).not.toThrow();
  });

  it("returns 503 from /ai/theme when unconfigured", async () => {
    const app = createAiApiRoutes({ db: t.db, openaiApiKey: "", openaiBaseRoute: "" });
    const res = await app.request("/ai/theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "make it blue" }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "AI features not configured" });
  });

  it("returns 503 when only the key is set (no base URL)", async () => {
    const app = createAiApiRoutes({
      db: t.db,
      openaiApiKey: "k",
      openaiBaseRoute: "",
    });
    const res = await app.request("/ai/theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "make it blue" }),
    });
    expect(res.status).toBe(503);
  });
});
