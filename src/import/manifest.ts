// --- Import agent: media staging ---
//
// Uploads every resolvable image of the outline into the tenant's media
// library (media row + MediaStorage object, exactly like the admin image
// upload route) and hands back the manifest: the mapping from the src as
// written in the HTML to the `/media/{key}` url the proposal's markdown must
// use. Staging happens at generate time, not apply time, because the review
// preview has to show real images; a discarded run cleans up through the
// returned keys.

import { randomUUID } from "node:crypto";
import { posix as posixPath } from "node:path";
import type { Database } from "../db/index.js";
import { insertMedia } from "../content/db.js";
import type { MediaStorage } from "../media/storage.js";
import type { DocumentOutline } from "./types.js";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

export interface ManifestEntry {
  /** The `src` exactly as written in the HTML document. */
  source: string;
  /** Storage key of the staged upload. */
  key: string;
  /** `/media/{key}` — the only image id a proposal may reference. */
  url: string;
  /** Best alt text seen for this image in the document, if any. */
  alt: string | null;
  /** `media.media_id`, for the discard cleanup. */
  mediaId: string;
}

export interface StagedMedia {
  manifest: ManifestEntry[];
  /**
   * Outline image srcs that could not be staged: remote URLs, or relative
   * paths with no matching file in the archive. The proposal cannot use
   * them, so they surface to the owner instead of silently vanishing.
   */
  unstaged: string[];
}

export interface StageMediaOptions {
  db: Database;
  storage: MediaStorage;
  tenantId: string;
  /** Key prefix for multi-tenant hosts, matching the admin upload route. */
  keyPrefix?: string;
  /** Image files from ingest, keyed by archive path. */
  assets: Map<string, Buffer>;
  outline: DocumentOutline;
  /** The document's path inside the archive, for resolving relative srcs. */
  htmlName: string;
}

/**
 * Resolve an HTML `src` to its archive-relative key, or `null` when it is
 * remote/embedded or escapes the archive root.
 */
export function resolveAssetKey(htmlName: string, src: string): string | null {
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return null;
  const dir = posixPath.dirname(htmlName);
  const joined = dir === "." ? src : `${dir}/${src}`;
  const normalized = posixPath.normalize(joined);
  if (normalized.startsWith("../") || posixPath.isAbsolute(normalized)) return null;
  return normalized;
}

export async function stageMedia(options: StageMediaOptions): Promise<StagedMedia> {
  const altBySrc = new Map<string, string>();
  for (const section of options.outline.sections) {
    for (const block of section.blocks) {
      if (block.type === "image" && block.alt && !altBySrc.has(block.src)) {
        altBySrc.set(block.src, block.alt);
      }
    }
  }

  const manifest: ManifestEntry[] = [];
  const unstaged: string[] = [];
  for (const src of options.outline.images) {
    const key = resolveAssetKey(options.htmlName, src);
    if (key === null) {
      unstaged.push(src);
      continue;
    }
    const bytes = options.assets.get(key);
    if (!bytes) {
      unstaged.push(src);
      continue;
    }
    const ext = posixPath.extname(key).toLowerCase();
    const mimeType = MIME_BY_EXTENSION[ext];
    if (!mimeType) {
      unstaged.push(src);
      continue;
    }

    const mediaId = randomUUID();
    const storageKey = `${options.keyPrefix ?? ""}${mediaId}${ext}`;
    await options.storage.put(storageKey, bytes, mimeType);
    await insertMedia(
      options.db,
      {
        id: mediaId,
        storageKey,
        originalName: posixPath.basename(key),
        mimeType,
        size: bytes.length,
      },
      options.tenantId,
    );
    manifest.push({
      source: src,
      key: storageKey,
      url: `/media/${storageKey}`,
      alt: altBySrc.get(src) ?? null,
      mediaId,
    });
  }

  return { manifest, unstaged };
}
