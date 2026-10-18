// --- Import agent: admin routes ---
//
// Job-style by design: the model call runs 1.5–4.5 minutes on the configured
// provider, which no honest sync request survives (Node caps fetch
// response-header waits at 300 s). `start` launches the pipeline and returns
// immediately; the UI polls `job/:id`. Job state is in-memory — a restart
// loses the run but never the staged media, which the owner can still clean
// up through `discard` with the manifest they hold. A multi-instance host
// that needs durable jobs should promote this to a DB table, exactly like
// chunked upload sessions did.
//
// Everything the client sends back (proposal, manifest) is re-parsed and
// re-validated server-side before a single draft is written: the browser is
// a transport, not a trust boundary.

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { marked } from "marked";
import { isAiConfigured } from "../../../api/ai/config.js";
import type { AiProviderConfig, AdminModuleContext } from "./types.js";
import { generateImportProposal } from "../../../import/agent.js";
import { applyImportItems } from "../../../import/apply.js";
import { extractOutline } from "../../../import/extract.js";
import { IngestError, ingestHtml, ingestZip } from "../../../import/ingest.js";
import { parseManifest, stageMedia, type ManifestEntry } from "../../../import/manifest.js";
import { parsePublicProposal, type ImportProposal } from "../../../import/proposal.js";
import { validateProposal, type ProposalValidation } from "../../../import/validate.js";
import { deleteMediaRecord, listAllPages } from "../../../content/db.js";

/** Uploads above this are refused before buffering the whole multipart body. */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
/** Finished jobs are dropped from memory after this long. */
const JOB_TTL_MS = 2 * 60 * 60 * 1000;

interface ImportJobResult {
  proposal: ImportProposal;
  manifest: ManifestEntry[];
  unstaged: string[];
  validation: ProposalValidation;
}

interface ImportJob {
  id: string;
  tenantId: string;
  status: "running" | "done" | "error";
  startedAt: number;
  result?: ImportJobResult;
  error?: string;
}

export function createImportRoutes(ctx: AdminModuleContext): Hono {
  const { db, tenantId } = ctx;
  const app = new Hono();

  const jobs = new Map<string, ImportJob>();

  // Import gets its own model when the host configured one; otherwise it
  // runs on the theming config like every other AI feature.
  const importAi: AiProviderConfig | undefined =
    (isAiConfigured(ctx.importAi) && ctx.importAi) || ctx.ai;

  const existingSlugs = async (): Promise<Set<string>> =>
    new Set((await listAllPages(db, tenantId)).map((page) => page.slug));

  const startJob = async (input: {
    bytes?: Uint8Array;
    html?: string;
    instructions: string;
    previousNotes?: string;
  }): Promise<ImportJob> => {
    const job: ImportJob = { id: randomUUID(), tenantId, status: "running", startedAt: Date.now() };
    jobs.set(job.id, job);

    // Not awaited: this is the whole point of the job shape. Errors land on
    // the job, never on the process.
    void (async () => {
      try {
        const document = input.bytes
          ? await ingestZip(input.bytes)
          : input.html
            ? ingestHtml(input.html)
            : (() => {
                throw new IngestError("no-html", "Nothing to import: no file and no pasted HTML.");
              })();
        const outline = extractOutline(document.html);
        const { manifest, unstaged } = await stageMedia({
          db,
          storage: ctx.storage!,
          tenantId,
          keyPrefix: ctx.keyPrefix,
          assets: document.assets,
          outline,
          htmlName: document.htmlName,
        });
        const proposal = await generateImportProposal({
          ai: importAi!,
          tenantId,
          siteName: ctx.siteName ?? "Nobodyreads",
          outline,
          manifest,
          instructions: input.instructions,
          previousNotes: input.previousNotes,
        });
        job.result = {
          proposal,
          manifest,
          unstaged,
          validation: validateProposal(proposal, manifest, await existingSlugs()),
        };
        job.status = "done";
      } catch (err) {
        job.status = "error";
        job.error = err instanceof IngestError
          ? err.message
          : `Import failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    })();

    return job;
  };

  app.post("/import/start", async (c) => {
    if (!ctx.storage) return c.json({ error: "Media storage is not configured." }, 503);
    if (!isAiConfigured(importAi)) {
      return c.json(
        { error: "No AI provider configured — set AI_IMPORT_MODEL or the theming AI variables." },
        503,
      );
    }

    for (const job of jobs.values()) {
      if (job.tenantId === tenantId && job.status === "running") {
        return c.json({ error: "An import is already running for this site." }, 409);
      }
    }
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (now - job.startedAt > JOB_TTL_MS) jobs.delete(id);
    }

    // parseBody() returns a plain record, not a FormData.
    const form = await c.req.parseBody();
    const file = form.file;
    const pasted = form.html;
    const instructions = typeof form.instructions === "string" ? form.instructions : "";
    const previousNotes = typeof form.previousNotes === "string" ? form.previousNotes : undefined;

    let bytes: Uint8Array | undefined;
    if (file instanceof File) {
      if (file.size > MAX_UPLOAD_BYTES) {
        return c.json({ error: "That archive is larger than the 100 MB import cap." }, 413);
      }
      bytes = new Uint8Array(await file.arrayBuffer());
    } else if (typeof pasted !== "string" || !pasted.trim()) {
      return c.json({ error: "Upload a zip/html file or paste HTML." }, 400);
    }

    const job = await startJob({
      bytes,
      html: typeof pasted === "string" && pasted.trim() ? pasted : undefined,
      instructions,
      previousNotes,
    });
    return c.json({ jobId: job.id }, 202);
  });

  app.get("/import/job/:id", (c) => {
    const job = jobs.get(c.req.param("id"));
    if (!job || job.tenantId !== tenantId) return c.json({ error: "No such import job." }, 404);

    if (job.status === "running") return c.json({ status: "running" });
    if (job.status === "error") return c.json({ status: "error", error: job.error });
    return c.json({ status: "done", ...job.result });
  });

  app.post("/import/preview", async (c) => {
    const body = await c.req.json().catch(() => null);
    const markdown = (body as { bodyMarkdown?: unknown } | null)?.bodyMarkdown;
    if (typeof markdown !== "string" || !markdown.trim()) {
      return c.json({ error: "Nothing to preview." }, 400);
    }
    const html = await marked.parse(markdown, { async: false });
    return c.json({ html });
  });

  app.post("/import/apply", async (c) => {
    const body = await c.req.json().catch(() => null);
    const accepted = (body as { accepted?: unknown } | null)?.accepted;
    if (!body || !Array.isArray(accepted) || !accepted.every((index) => Number.isInteger(index) && index >= 0)) {
      return c.json({ error: "Which items to accept must be a list of item numbers." }, 400);
    }

    const proposal = parsePublicProposal((body as { proposal?: unknown }).proposal);
    const manifest = parseManifest((body as { manifest?: unknown }).manifest);
    if (!proposal || !manifest) {
      return c.json({ error: "The proposal or manifest did not survive the round-trip." }, 400);
    }
    if ((accepted as number[]).some((index) => index >= proposal.items.length)) {
      return c.json({ error: "Accepted list points past the proposal's items." }, 400);
    }

    // Re-validation is the server's own judgement, not a replay of the
    // client's: slugs are checked against the DB as it stands right now.
    const validation = validateProposal(proposal, manifest, await existingSlugs());
    const blocking = [
      ...validation.errors,
      ...(accepted as number[]).flatMap((index) => validation.itemErrors[index] ?? []),
    ];
    if (blocking.length > 0) {
      return c.json({ error: "The proposal no longer validates.", validation }, 400);
    }

    const items = (accepted as number[]).map((index) => proposal.items[index]);
    const created = await applyImportItems(db, items, tenantId);
    return c.json({ created }, 201);
  });

  app.post("/import/discard", async (c) => {
    const body = await c.req.json().catch(() => null);
    const manifest = parseManifest((body as { manifest?: unknown } | null)?.manifest);
    if (!manifest) return c.json({ error: "The manifest did not survive the round-trip." }, 400);

    for (const entry of manifest) {
      // Storage is best-effort: a missing object must not keep the media row
      // alive, and a half-deleted import must not fail the whole cleanup.
      await ctx.storage?.delete(entry.key).catch(() => undefined);
      await deleteMediaRecord(db, entry.mediaId, tenantId);
    }
    for (const [id, job] of jobs) {
      if (job.tenantId === tenantId) jobs.delete(id);
    }
    return c.json({ discarded: manifest.length });
  });

  return app;
}
