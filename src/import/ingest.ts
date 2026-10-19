// --- Import agent: ingest ---
//
// Turns what the author hands over — a zip (an HTML document plus its
// relative assets), a pasted HTML string, or the URL of a single page —
// into an IngestedDocument. This is the only stage that touches untrusted
// archive bytes or untrusted hosts, so the safety caps live here and
// nowhere else:
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
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { posix as posixPath } from "node:path";
import { parseHTML } from "linkedom";

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
  | "ambiguous-html"
  | "bad-url"
  | "blocked-host"
  | "too-many-redirects"
  | "not-html"
  | "fetch-failed";

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

// --- URL ingest ---
//
// Fetches a single page (no crawling) and its same-origin images, turning
// the result into the same shape a zip import produces: the document's
// srcs are rewritten to document-relative paths and the images are keyed
// by their canonical path, so extraction and staging behave exactly as if
// the author had zipped the server's web root. Cross-origin images are
// left exactly as written — never fetched, never staged.
//
// The SSRF guard is the security boundary: the host is resolved and every
// address it yields is checked against non-routable ranges *before* any
// connection, on the initial URL, on every redirect hop, and on every
// image fetch. Loopback is exempt only when the host opted in
// (IMPORT_ALLOW_LOOPBACK=1) so local servers stay testable; private,
// link-local, and unique-local ranges are never exempt.

/** Ranges nobody should be made to fetch: refused regardless of opt-in. */
const ALWAYS_BLOCKED = (() => {
  const list = new BlockList();
  const blockV4 = (subnet: string, bits: number) => list.addSubnet(subnet, bits, "ipv4");
  blockV4("0.0.0.0", 8); // "this network" — connecting to it hits localhost on Linux
  blockV4("10.0.0.0", 8);
  blockV4("100.64.0.0", 10); // carrier-grade NAT
  blockV4("169.254.0.0", 16); // link-local incl. cloud metadata endpoints
  blockV4("172.16.0.0", 12);
  blockV4("192.0.0.0", 24);
  blockV4("192.168.0.0", 16);
  blockV4("198.18.0.0", 15); // benchmarking
  blockV4("240.0.0.0", 4); // reserved, incl. broadcast
  const blockV6 = (subnet: string, bits: number) => list.addSubnet(subnet, bits, "ipv6");
  blockV6("::", 128); // unspecified
  blockV6("fc00::", 7); // unique-local
  blockV6("fe80::", 10); // link-local
  blockV6("100::", 64); // discard-only
  blockV6("2001:db8::", 32); // documentation
  return list;
})();

/** Loopback: refused unless the host opted in for local testing. */
const LOOPBACK = (() => {
  const list = new BlockList();
  list.addSubnet("127.0.0.0", 8, "ipv4");
  list.addSubnet("::1", 128, "ipv6");
  return list;
})();

// IPv4-in-IPv6 forms are NOT added as subnets: BlockList compares in
// 128-bit form, where `::ffff:0:0/96` would match every IPv4 address.
// The embedded address is extracted and judged by the IPv4 rules instead.
const EMBEDDED_V4 = /^(::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/i;

/** True when the address is a fetch target this host must refuse. */
export function isBlockedAddress(address: string, allowLoopback: boolean): boolean {
  const embedded = EMBEDDED_V4.exec(address);
  const candidates = embedded ? [address, embedded[2]] : [address];
  return candidates.some((candidate) => {
    // check() ignores IPv6 addresses unless the family is passed — a Node
    // quirk that would otherwise silently disable every v6 rule.
    const family = isIP(candidate) === 6 ? "ipv6" : "ipv4";
    return (
      ALWAYS_BLOCKED.check(candidate, family) ||
      (!allowLoopback && LOOPBACK.check(candidate, family))
    );
  });
}

async function assertHostAllowed(url: URL, allowLoopback: boolean): Promise<void> {
  // URL.hostname keeps the brackets on IPv6 literals; the resolver and the
  // guard both want the bare address.
  const hostname = url.hostname.replace(/^\[/, "").replace(/\]$/, "");
  let addresses: { address: string }[];
  if (isIP(hostname) === 0) {
    try {
      addresses = await lookup(hostname, { all: true });
    } catch {
      throw new IngestError("fetch-failed", `"${hostname}" could not be resolved.`);
    }
    if (addresses.length === 0) {
      throw new IngestError("fetch-failed", `"${hostname}" could not be resolved.`);
    }
  } else {
    // A literal IP is its own answer — no resolver round-trip, and no
    // chance of the resolver rejecting "fe80::1" for lacking a scope.
    addresses = [{ address: hostname }];
  }
  // Any unsafe address in the answer is a refusal: a host that sometimes
  // points at a metadata endpoint is a host we do not talk to.
  if (addresses.some((entry) => isBlockedAddress(entry.address, allowLoopback))) {
    throw new IngestError(
      "blocked-host",
      `"${hostname}" resolves to a private, loopback, or link-local address the import agent refuses to fetch.`,
    );
  }
}

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 30_000;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

async function fetchGuarded(
  rawUrl: string,
  accept: string,
  allowLoopback: boolean,
): Promise<{ response: Response; finalUrl: URL }> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new IngestError("bad-url", `"${rawUrl}" is not a valid URL.`);
  }
  if (current.protocol !== "http:" && current.protocol !== "https:") {
    throw new IngestError("bad-url", "Only http and https URLs can be imported.");
  }

  for (let hop = 0; ; hop++) {
    await assertHostAllowed(current, allowLoopback);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: { accept },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      throw new IngestError(
        "fetch-failed",
        `Fetching "${current.href}" failed: ${err instanceof Error ? err.message : String(err)}.`,
      );
    }

    if (REDIRECT_STATUSES.includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (hop >= MAX_REDIRECTS) {
        throw new IngestError("too-many-redirects", "That URL redirects more than 3 times.");
      }
      if (!location) {
        throw new IngestError("fetch-failed", `"${current.href}" redirected without a target.`);
      }
      const next = new URL(location, current);
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new IngestError("bad-url", "That URL redirects to a non-http protocol.");
      }
      current = next;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new IngestError("fetch-failed", `"${current.href}" responded ${response.status}.`);
    }
    return { response, finalUrl: current };
  }
}

/** Read a body while enforcing the cap, so a huge stream never lands in memory. */
async function readCapped(response: Response, capBytes: number, what: string): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > capBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new IngestError("entry-too-large", `"${what}" is larger than the per-file import cap.`);
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > capBytes) {
      await reader.cancel().catch(() => undefined);
      throw new IngestError("entry-too-large", `"${what}" is larger than the per-file import cap.`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Pathname as an archive-style key: decoded, no leading slash; `null` when not a file path. */
function pathKeyOf(url: URL): string | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    pathname = url.pathname;
  }
  const key = pathname.replace(/^\/+/, "");
  return key.length > 0 && !key.endsWith("/") ? key : null;
}

export interface IngestUrlOptions {
  limits?: ImportLimits;
  /** Loopback targets are refused unless the host opted in (local testing). */
  allowLoopback?: boolean;
}

export async function ingestUrl(
  rawUrl: string,
  options: IngestUrlOptions = {},
): Promise<IngestedDocument> {
  const limits = options.limits ?? IMPORT_LIMITS;
  const allowLoopback = options.allowLoopback ?? false;

  const { response, finalUrl } = await fetchGuarded(rawUrl, "text/html", allowLoopback);
  const contentType = response.headers.get("content-type") ?? "";
  const essence = contentType.split(";", 1)[0].trim().toLowerCase();
  if (essence !== "text/html" && essence !== "application/xhtml+xml") {
    await response.body?.cancel().catch(() => undefined);
    throw new IngestError(
      "not-html",
      `That URL did not return an HTML page (content-type "${contentType || "unknown"}").`,
    );
  }

  const htmlBytes = await readCapped(response, limits.maxFileBytes, finalUrl.href);
  const declaredCharset = /charset=([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase();
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(declaredCharset ?? "utf-8");
  } catch {
    decoder = new TextDecoder("utf-8"); // unknown label: fall back rather than refuse
  }
  const html = decoder.decode(htmlBytes);

  const htmlKey = pathKeyOf(finalUrl) ?? "index.html";
  const htmlDir = posixPath.dirname(htmlKey);

  // Collect same-origin image srcs, rewrite each to the document-relative
  // form it would carry inside a zip, and fetch the bytes under the
  // canonical path key. The DOM is parsed once and serialized back —
  // structure and text are untouched; only image srcs change.
  const { document } = parseHTML(html);
  const assets = new Map<string, Buffer>();
  const skipped: string[] = [];
  // Path key → the exact URL to fetch (query string preserved) and the src
  // as written, for `skipped` reporting when the fetch fails.
  const wanted = new Map<string, { src: string; href: string }>();
  for (const img of Array.from(document.querySelectorAll("img"))) {
    const src = (img.getAttribute("src") ?? "").trim();
    if (!src || src.startsWith("data:")) continue;
    let resolved: URL;
    try {
      resolved = new URL(src, finalUrl);
    } catch {
      continue;
    }
    if (resolved.origin !== finalUrl.origin) continue; // cross-origin: left as written
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    const key = pathKeyOf(resolved);
    if (key === null || !IMAGE_EXTENSIONS[extensionOf(key)]) continue; // staging reports it
    if (!wanted.has(key)) wanted.set(key, { src, href: resolved.href });
    const relative = htmlDir === "." ? key : posixPath.relative(htmlDir, key);
    if (relative.length > 0) img.setAttribute("src", relative);
  }

  let total = htmlBytes.length;
  for (const [key, target] of wanted) {
    try {
      const fetched = await fetchGuarded(target.href, "image/*", allowLoopback);
      const bytes = await readCapped(fetched.response, limits.maxFileBytes, key);
      total += bytes.length;
      if (total > limits.maxTotalBytes) {
        throw new IngestError("archive-too-large", "The page and its images pass the import size cap.");
      }
      assets.set(key, bytes);
    } catch (err) {
      // A missing image must not sink the page: staging reports the src as
      // unstaged and the review UI shows exactly that. A total-cap breach,
      // however, is about the whole document — that one is fatal.
      if (err instanceof IngestError && err.code === "archive-too-large") throw err;
      skipped.push(target.src);
    }
  }

  return { html: document.toString(), htmlName: htmlKey, assets, skipped };
}
