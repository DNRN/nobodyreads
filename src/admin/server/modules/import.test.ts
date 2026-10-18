import { describe, expect, it, vi } from "vitest";
import type { ServerResponse } from "node:http";
import { Readable } from "node:stream";
import JSZip from "jszip";
import type { MediaStorage, StoredFile } from "../../../media/storage.js";
import { createTestDb, type TestDb } from "../../../test/db.js";
import { upsertPage, listAllPages, listMedia } from "../../../content/db.js";
import type { Page } from "../../../content/types.js";

/**
 * The import module is a job runner around the pipeline: what matters at the
 * route level is that nothing the client says is trusted (the proposal is
 * re-validated at apply time against the DB as it stands), that drafts are
 * the only thing apply ever creates, and that a discard really deletes the
 * staged media. The agent itself is mocked — M1 already pinned its contract.
 */

const generateImportProposal = vi.fn();
vi.mock("../../../import/agent.js", () => ({
  generateImportProposal: (...args: unknown[]) => generateImportProposal(...args),
}));

import { createImportRoutes } from "./import.js";
import type { AdminModuleContext } from "./types.js";

const TENANT = "t1";

/** The mocked agent's return value, built from the manifest it was given.
 * This is the PUBLIC proposal shape (bodyMarkdown assembled), because the
 * real generateImportProposal parses before returning. */
function proposalFromCall() {
  const options = generateImportProposal.mock.calls.at(-1)![0] as {
    manifest: { key: string; url: string }[];
  };
  const image = options.manifest[0];
  return {
    items: [
      {
        kind: "post",
        title: "Imported post",
        slug: "imported-post",
        excerpt: "From a deck.",
        tags: ["import"],
        bodyMarkdown: `# Imported post\n\n![x](${image.url})`,
        coverImageKey: image.key,
        reason: "The deck's core.",
      },
    ],
    notes: "one post",
  };
}

function fakeStorage() {
  const deleted: string[] = [];
  const storage: MediaStorage = {
    maxParts: undefined,
    put: vi.fn(async (key: string, _data: Buffer, _mimeType: string): Promise<StoredFile> => ({
      key,
      url: `/media/${key}`,
    })),
    assemble: vi.fn(),
    openRead: vi.fn(async () => Readable.from([])),
    delete: vi.fn(async (key: string) => {
      deleted.push(key);
    }),
    url: (key: string) => `/media/${key}`,
    serve: vi.fn(async (_key: string, _res: ServerResponse) => false),
  };
  return { storage, deleted };
}

function pageFixture(slug: string): Page {
  return {
    id: `existing-${slug}`,
    slug,
    title: slug,
    content: "x",
    excerpt: "",
    tags: [],
    date: "2026-01-01T00:00:00.000Z",
    published: true,
    kind: "page",
    commentsEnabled: true,
    inFeed: false,
    accessTier: "public",
    priceAmount: null,
  };
}

async function setup(options: { ai?: boolean } = {}) {
  const t: TestDb = await createTestDb();
  const { storage, deleted } = fakeStorage();
  const ctx: AdminModuleContext = {
    db: t.db,
    storage,
    tenantId: TENANT,
    urlPrefix: "",
    adminBase: "/admin",
    editorBase: "/admin/editor",
    siteName: "Test",
    ai: options.ai === false ? undefined : { provider: "openai-compatible", apiKey: "k", model: "m" },
  };
  const app = createImportRoutes(ctx);
  return { t, deleted, app };
}

async function deckZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "index.html",
    "<html lang='da'><body><section><h2>Hej</h2><p>Tekst.</p><img src='billed.png' alt='Billede'></section></body></html>",
  );
  zip.file("billed.png", new Uint8Array([1, 2, 3]));
  return zip.generateAsync({ type: "uint8array" });
}

async function startDeck(app: ReturnType<typeof createImportRoutes>) {
  const form = new FormData();
  form.set("file", new File([await deckZip()], "deck.zip", { type: "application/zip" }));
  form.set("instructions", "keep it Danish");
  const res = await app.request("/import/start", { method: "POST", body: form });
  return { status: res.status, jobId: ((await res.json()) as { jobId?: string }).jobId };
}

/**
 * Poll the job until it leaves "running". The pipeline needs only event-loop
 * turns (in-memory DB, app.request fetch), so a setImmediate drain per
 * attempt replaces sleeps — no wall-clock timers, no flake under load.
 */
async function waitForJob(app: ReturnType<typeof createImportRoutes>, jobId: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const res = await app.request(`/import/job/${jobId}`);
    const job = await res.json();
    if (job.status !== "running") return job;
    const { promise, resolve } = Promise.withResolvers<void>();
    setImmediate(resolve);
    await promise;
  }
  throw new Error("job never finished");
}

/** Start a deck with the default mocked proposal and wait it out. */
async function runDeck(app: ReturnType<typeof createImportRoutes>) {
  generateImportProposal.mockImplementation(async () => proposalFromCall());
  const { jobId } = await startDeck(app);
  return waitForJob(app, jobId);
}

describe("createImportRoutes", () => {
  it("refuses to start without an AI provider", async () => {
    const { app } = await setup({ ai: false });

    const { status } = await startDeck(app);

    expect(status).toBe(503);
  });

  it("runs a deck through the pipeline and returns a validated proposal", async () => {
    const { t, app } = await setup();

    const job = await runDeck(app);

    expect(job.status).toBe("done");
    expect(job.proposal.items[0].title).toBe("Imported post");
    expect(job.manifest).toHaveLength(1);
    expect(job.validation.itemErrors).toEqual({});

    // The agent got the steering fields through.
    const call = generateImportProposal.mock.calls.at(-1)![0] as { instructions: string };
    expect(call.instructions).toBe("keep it Danish");

    // Media was staged for real.
    expect(await listMedia(t.db, TENANT, (key) => key)).toHaveLength(1);
  });

  it("reports ingest failures on the job, not the process", async () => {
    const { app } = await setup();

    const form = new FormData();
    form.set("file", new File([new TextEncoder().encode("not a zip")], "bad.zip"));
    const start = await app.request("/import/start", { method: "POST", body: form });
    expect(start.status).toBe(202);
    const { jobId } = (await start.json()) as { jobId: string };
    const job = await waitForJob(app, jobId);

    expect(job.status).toBe("error");
    expect(job.error).toContain("zip");
  });

  it("applies accepted items as drafts and rejects proposals that no longer validate", async () => {
    const { t, app } = await setup();
    const job = await runDeck(app);

    const applied = await app.request("/import/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal: job.proposal, manifest: job.manifest, accepted: [0] }),
    });
    expect(applied.status).toBe(201);
    const { created } = await applied.json();

    const pages = await listAllPages(t.db, TENANT);
    expect(pages).toHaveLength(1);
    expect(pages[0].published).toBe(false);
    expect(pages[0].kind).toBe("post");
    expect(pages[0].inFeed).toBe(true);
    expect(pages[0].content).toContain(job.manifest[0].url);
    expect(pages[0].seo?.ogImage).toBe(`/media/${job.manifest[0].key}`);
    expect(created[0].slug).toBe("imported-post");

    // A slug that collides with the just-created draft must now be refused.
    const again = await app.request("/import/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal: job.proposal, manifest: job.manifest, accepted: [0] }),
    });
    expect(again.status).toBe(400);
  });

  it("refuses an apply whose media references were never staged", async () => {
    const { app } = await setup();
    const job = await runDeck(app);

    const tampered = {
      ...job.proposal,
      items: [{ ...job.proposal.items[0], bodyMarkdown: "![x](/media/fake.png)" }],
    };
    const res = await app.request("/import/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal: tampered, manifest: job.manifest, accepted: [0] }),
    });

    expect(res.status).toBe(400);
  });

  it("discards staged media and forgets the job", async () => {
    const { t, deleted, app } = await setup();
    generateImportProposal.mockImplementation(async () => proposalFromCall());
    const { jobId } = await startDeck(app);
    const job = await waitForJob(app, jobId);

    const res = await app.request("/import/discard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manifest: job.manifest }),
    });
    expect(res.status).toBe(200);

    expect(await listMedia(t.db, TENANT, (key) => key)).toHaveLength(0);
    expect(deleted).toEqual([job.manifest[0].key]);
    expect((await app.request(`/import/job/${jobId}`)).status).toBe(404);
  });

  it("marks a slug collision with existing pages in validation", async () => {
    const { t, app } = await setup();
    await upsertPage(t.db, pageFixture("imported-post"), TENANT);

    const job = await runDeck(app);

    expect(job.validation.itemErrors[0]).toContainEqual(expect.stringContaining("already used"));
  });

  it("renders a markdown preview", async () => {
    const { app } = await setup();

    const res = await app.request("/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bodyMarkdown: "# Hej\n\nTekst." }),
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { html: string }).html).toContain("<h1>");
  });

  it("refuses a second concurrent import for the same tenant", async () => {
    const { app } = await setup();
    generateImportProposal.mockImplementation(() => Promise.withResolvers<never>().promise);

    const first = await startDeck(app);
    expect(first.status).toBe(202);
    const second = await startDeck(app);

    expect(second.status).toBe(409);
  });
});
