import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { createTestDb, type TestDb } from "../../../test/db.js";
import { DEFAULT_TEMPLATE } from "../../../template/defaults.js";
import type { AdminModuleContext } from "./types.js";

vi.mock("../../../shared/db.js", () => ({ getRawClient: () => testClient }));

import { createThemeRoutes } from "./theme.js";
import { listSiteTemplateTrials, listSiteTemplateRevisions } from "../../../shared/site-bundle.js";

const TENANT = "_default";

let t: TestDb;
let testClient: import("@libsql/client").Client;

beforeEach(async () => {
  t = await createTestDb();
  testClient = t.client;
});

function mount(): Hono {
  const ctx = {
    db: t.db,
    tenantId: TENANT,
    urlPrefix: "",
    adminBase: "/admin",
    editorBase: "/admin/editor",
  } satisfies AdminModuleContext;
  const app = new Hono();
  app.route("/", createThemeRoutes(ctx));
  return app;
}

function postJson(app: Hono, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const template = {
  ...DEFAULT_TEMPLATE,
  tokens: {
    ...DEFAULT_TEMPLATE.tokens,
    light: { ...DEFAULT_TEMPLATE.tokens.light, accent: "#5b8a6a" },
  },
};

describe("trial routes", () => {
  it("banks a trial and lists it with swatches", async () => {
    const app = mount();
    const saved = await postJson(app, "/design/trials", { name: "Field Journal", template });
    expect(saved.status).toBe(200);

    const listed = await (await app.request("/design/trials")).json();
    expect(listed.trials).toHaveLength(1);
    expect(listed.trials[0].name).toBe("Field Journal");
    // Swatches, not the whole stored template — the strip only needs to
    // identify each entry.
    expect(listed.trials[0].swatches).toContain("#5b8a6a");
    expect(listed.trials[0].template).toBeUndefined();
  });

  it("returns the full template only when a trial is fetched by id", async () => {
    const app = mount();
    const { trial } = await (await postJson(app, "/design/trials", { name: "One", template })).json();

    const fetched = await (await app.request(`/design/trials/${trial.trialId}`)).json();
    expect(fetched.trial.template.tokens.light.accent).toBe("#5b8a6a");
  });

  it("rejects a nameless trial", async () => {
    const res = await postJson(mount(), "/design/trials", { name: "  ", template });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid template", async () => {
    const res = await postJson(mount(), "/design/trials", { name: "Bad", template: { nope: true } });
    expect(res.status).toBe(400);
    expect(await listSiteTemplateTrials(t.db, TENANT)).toEqual([]);
  });

  it("404s an unknown trial", async () => {
    expect((await mount().request("/design/trials/nope")).status).toBe(404);
  });

  it("deletes", async () => {
    const app = mount();
    const { trial } = await (await postJson(app, "/design/trials", { name: "One", template })).json();
    expect((await app.request(`/design/trials/${trial.trialId}/delete`, { method: "POST" })).status).toBe(200);
    expect(await listSiteTemplateTrials(t.db, TENANT)).toEqual([]);
  });

  // Banking a look and publishing it are two decisions; the route must not
  // quietly make one imply the other.
  it("banking a trial writes no revision", async () => {
    await postJson(mount(), "/design/trials", { name: "One", template });
    expect(await listSiteTemplateRevisions(t.db, TENANT)).toEqual([]);
  });
});
