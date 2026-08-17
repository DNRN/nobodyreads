import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import type { Database } from "../../db/index.js";
import type { MediaStorage } from "../../media/storage.js";
import { insertMedia } from "../../content/db.js";
import type { ComfyProviderConfig } from "./comfy/config.js";
import { buildZImageWorkflow } from "./comfy/z-image-workflow.js";
import { runWorkflow, downloadOutput } from "./comfy/client.js";

export interface GenerateCoverImageInput {
  db: Database;
  storage: MediaStorage;
  tenantId: string;
  comfy: ComfyProviderConfig;
  keyPrefix?: string;
  prompt: string;
  width?: number;
  height?: number;
}

export interface GenerateCoverImageResult {
  mediaId: string;
  url: string;
}

/** Media-library label, so generated images aren't an indistinguishable pile. */
function promptSlug(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .slice(0, 6)
    .join("-");
  return slug ? `cover-${slug}` : "cover-image";
}

/**
 * Run the author-approved prompt through Comfy Cloud and land the result in
 * the tenant's ordinary media library — the same door an uploaded file goes
 * through (`admin/server/modules/media.ts`), so a generated cover image is
 * never lost even if the author later picks something else.
 */
export async function generateCoverImage({
  db,
  storage,
  tenantId,
  comfy,
  keyPrefix = "",
  prompt,
  width,
  height,
}: GenerateCoverImageInput): Promise<GenerateCoverImageResult> {
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
      originalName: `${promptSlug(prompt)}${ext}`,
      mimeType,
      size: buffer.length,
    },
    tenantId,
  );

  return { mediaId, url: stored.url };
}
