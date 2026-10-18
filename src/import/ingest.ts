// --- Import agent: ingest ---
//
// Turns what the author hands over — a zip (an HTML document plus its
// relative assets) or a pasted HTML string — into an IngestedDocument. This
// is the only stage that touches untrusted archive bytes, so the safety caps
// live here and nowhere else:
//
// - entry count and uncompressed size are checked against the central
//   directory *before* any entry is inflated, and against the actual bytes
//   after (a bomb may lie in its header);
// - entry names are normalized to posix and rejected when absolute or
//   containing `..`, so an asset can never claim a path outside the archive;
// - only HTML and image extensions are kept; everything else (CSS, JS,
//   fonts) is recorded in `skipped` and dropped — presentation never
//   survives import by design.

import JSZip from "jszip";

export interface ImportLimits {
  /** Max non-directory entries in the archive. */
  maxEntries: number;
  /** Max sum of uncompressed entry sizes. */
  maxTotalBytes: number;
  /** Max single uncompressed entry size. */
  maxFileBytes: number;
}

/** Defaults: a deck with a few hundred photos, with headroom. */
export const IMPORT_LIMITS: ImportLimits = {
  maxEntries: 200,
  maxTotalBytes: 200 * 1024 * 1024,
  maxFileBytes: 50 * 1024 * 1024,
};

export type IngestErrorCode =
  | "not-a-zip"
  | "too-many-entries"
  | "entry-too-large"
  | "archive-too-large"
  | "no-html"
  | "ambiguous-html";

export class IngestError extends Error {
  constructor(
    readonly code: IngestErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const HTML_EXTENSIONS: Record<string, true> = { ".html": true, ".htm": true };
const IMAGE_EXTENSIONS: Record<string, true> = {
  ".jpg": true,
  ".jpeg": true,
  ".png": true,
  ".webp": true,
  ".gif": true,
  ".avif": true,
};

export interface IngestedDocument {
  /** The HTML document, UTF-8 decoded. */
  html: string;
  /** The document's normalized path inside the archive (`index.html` for paste). */
  htmlName: string;
  /** Image path (as written in the archive) → bytes. */
  assets: Map<string, Buffer>;
  /** Entries dropped for being neither HTML nor an image, by name. */
  skipped: string[];
}

/** Normalize an archive entry name; `null` means "not a safe relative path". */
export function normalizeEntryName(raw: string): string | null {
  const name = raw.replaceAll("\\", "/").replace(/^\.\//, "");
  if (name.length === 0) return null;
  if (name.startsWith("/")) return null;
  if (/^[a-zA-Z]:/.test(name)) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(name)) return null;
  const segments = name.split("/");
  if (segments.some((segment) => segment === ".." || segment.length === 0)) return null;
  return segments.join("/");
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export async function ingestZip(
  data: Uint8Array,
  limits: ImportLimits = IMPORT_LIMITS,
): Promise<IngestedDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new IngestError("not-a-zip", "That file is not a readable zip archive.");
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length === 0) {
    throw new IngestError("no-html", "The archive is empty.");
  }
  if (entries.length > limits.maxEntries) {
    throw new IngestError(
      "too-many-entries",
      `The archive holds ${entries.length} files; the import cap is ${limits.maxEntries}.`,
    );
  }

  // Declared sizes from the central directory, before inflating anything.
  let declaredTotal = 0;
  for (const entry of entries) {
    // jszip keeps the central-directory size on the internal `_data` field,
    // absent from its public type — one isolated cast; the actual-length
    // re-check below catches archives whose header lies.
    const internals = entry as unknown as { _data?: { uncompressedSize?: number } };
    const declared = Number(internals._data?.uncompressedSize ?? 0);
    if (declared > limits.maxFileBytes) {
      throw new IngestError("entry-too-large", `"${entry.name}" is larger than the per-file import cap.`);
    }
    declaredTotal += declared;
  }
  if (declaredTotal > limits.maxTotalBytes) {
    throw new IngestError("archive-too-large", "The archive expands past the import size cap.");
  }

  const assets = new Map<string, Buffer>();
  const skipped: string[] = [];
  const htmlCandidates: { name: string; entry: JSZip.JSZipObject }[] = [];
  let actualTotal = 0;

  for (const entry of entries) {
    const name = normalizeEntryName(entry.name);
    if (name === null) {
      throw new IngestError("not-a-zip", `"${entry.name}" is not a safe archive path.`);
    }

    const bytes = Buffer.from(await entry.async("uint8array"));
    if (bytes.length > limits.maxFileBytes) {
      throw new IngestError("entry-too-large", `"${name}" is larger than the per-file import cap.`);
    }
    actualTotal += bytes.length;
    if (actualTotal > limits.maxTotalBytes) {
      throw new IngestError("archive-too-large", "The archive expands past the import size cap.");
    }

    const ext = extensionOf(name);
    if (HTML_EXTENSIONS[ext]) {
      htmlCandidates.push({ name, entry });
    } else if (IMAGE_EXTENSIONS[ext]) {
      assets.set(name, bytes);
    } else {
      skipped.push(name);
    }
  }

  if (htmlCandidates.length === 0) {
    throw new IngestError("no-html", "The archive contains no HTML document.");
  }

  // `index.html` wins when present; otherwise the document must be the only
  // one — with two candidates there is nothing to prefer and guessing wrong
  // silently imports the wrong half of somebody's site export.
  const document =
    htmlCandidates.find((candidate) => candidate.name.toLowerCase() === "index.html") ??
    (htmlCandidates.length === 1 ? htmlCandidates[0] : null);
  if (!document) {
    const names = htmlCandidates.map((candidate) => candidate.name).join(", ");
    throw new IngestError(
      "ambiguous-html",
      `The archive holds several HTML documents (${names}); import an archive with one document, or name it index.html.`,
    );
  }

  const html = await document.entry.async("string");
  return { html, htmlName: document.name, assets, skipped };
}

export function ingestHtml(html: string): IngestedDocument {
  return { html, htmlName: "index.html", assets: new Map(), skipped: [] };
}
