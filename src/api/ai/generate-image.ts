import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import type { Database } from "../../db/index.js";
import type { MediaStorage } from "../../media/storage.js";
import { insertMedia } from "../../content/db.js";
import type { ComfyProviderConfig } from "./comfy/config.js";
import { buildZImageWorkflow } from "./comfy/z-image-workflow.js";
import { runWorkflow, downloadOutput } from "./comfy/client.js";

export interface GenerateImageInput {
  db: Database;
  storage: MediaStorage;
  tenantId: string;
  comfy: ComfyProviderConfig;
  keyPrefix?: string;
  prompt: string;
  width?: number;
  height?: number;
  /**
   * Prefixed onto the stored media's display name (e.g. "cover" so a post's
   * generated cover images read as `cover-a-foggy-harbour.png` rather than an
   * indistinguishable pile). Omit for a plain prompt slug.
   */
  filenamePrefix?: string;
}

export interface GenerateImageResult {
  mediaId: string;
  url: string;
}

function promptSlug(prompt: string, prefix?: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .slice(0, 6)
    .join("-");
  const name = [prefix, slug].filter(Boolean).join("-");
  return name || prefix || "generated-image";
}

/**
 * Run a prompt through Comfy Cloud and land the result in the tenant's
 * ordinary media library — the same door an uploaded file goes through
 * (`admin/server/modules/media.ts`), so a generated image is browsable,
 * reusable and deletable exactly like any upload. Callers (cover-image
 * generation, the media library's own "Generate with AI" action, …) only
 * differ in the prompt and the optional `filenamePrefix`.
 */
export async function generateImage({
  db,
  storage,
  tenantId,
  comfy,
  keyPrefix = "",
  prompt,
  width,
  height,
  filenamePrefix,
}: GenerateImageInput): Promise<GenerateImageResult> {
  const workflow = buildZImageWorkflow({ prompt, width, height });
  const output = await runWorkflow(comfy, workflow);
  const { buffer, mimeType } = await downloadOutput(comfy, output);

  const mediaId = randomUUID();
  const ext = extname(output.filename).toLowerCase() || ".png";
  const storageKey = `${keyPrefix}${mediaId}${ext}`;
  const stored = await storage.put(storageKey, buffer, mimeType);

  await insertMedia(
    db,
    {
      id: mediaId,
      storageKey,
      originalName: `${promptSlug(prompt, filenamePrefix)}${ext}`,
      mimeType,
      size: buffer.length,
    },
    tenantId,
  );

  return { mediaId, url: stored.url };
}
