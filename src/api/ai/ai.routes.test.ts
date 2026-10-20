import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../test/db.js";
import { createAiApiRoutes } from "./ai.routes.js";
import type { AiProviderConfig } from "../../admin/server/modules/types.js";

/**
 * The provider config is injected, not read from the environment here, and AI
 * is optional: with an absent or unusable config the routes answer 503. The
 * provider object is only ever built on a guarded request — `new OpenAI`
 * throws at construction on missing credentials, so eager construction used to
 * crash standalone boot.
 */

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

const hosted: AiProviderConfig = {
  provider: "openai-compatible",
  apiKey: "k",
  baseURL: "https://x/v1",
  model: "m",
};

const themeRequest = {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ input: "make it blue" }),
};

describe("createAiApiRoutes", () => {
  it("constructs without an AI config", () => {
    expect(() => createAiApiRoutes({ db: t.db })).not.toThrow();
  });

  it("answers 503 on /ai/theme when unconfigured", async () => {
    const app = createAiApiRoutes({ db: t.db });
    const res = await app.request("/ai/theme", themeRequest);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "AI features not configured" });
  });

  it("answers 503 when a hosted provider has no key", async () => {
    const app = createAiApiRoutes({
      db: t.db,
      ai: { ...hosted, apiKey: undefined },
    });
    const res = await app.request("/ai/theme", themeRequest);
    expect(res.status).toBe(503);
  });

  it("answers 503 when the config has no model", async () => {
    const app = createAiApiRoutes({ db: t.db, ai: { ...hosted, model: "" } });
    const res = await app.request("/ai/theme", themeRequest);
    expect(res.status).toBe(503);
  });

  it("serves the /ai probe for a hosted config", async () => {
    const app = createAiApiRoutes({ db: t.db, ai: hosted });
    expect((await app.request("/ai")).status).toBe(200);
  });

  it("serves the /ai probe for local (Ollama) without a key", async () => {
    const app = createAiApiRoutes({
      db: t.db,
      ai: { provider: "local", model: "qwen2.5" },
    });
    expect((await app.request("/ai")).status).toBe(200);
  });
});
