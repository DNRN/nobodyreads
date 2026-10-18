/**
 * Single-range `Range: bytes=…` parsing for media serving (RFC 9110 §14).
 *
 * Podcast apps and browsers seek through audio by requesting byte ranges, and
 * several podcatchers refuse to play a file whose server answers every request
 * with the whole body. Only a single range is honoured: multi-range requests
 * would need a `multipart/byteranges` body, which no media client needs, and
 * the RFC lets a server ignore a Range header it does not want to satisfy — so
 * multi-range and malformed headers both fall back to a plain 200.
 */

export interface ByteRange {
  /** First byte, inclusive. */
  start: number;
  /** Last byte, inclusive. */
  end: number;
}

/**
 * - `ByteRange` — serve 206 with exactly these bytes.
 * - `"unsatisfiable"` — serve 416 (`Content-Range: bytes *\/size`).
 * - `null` — ignore the header and serve the whole file with 200.
 */
export type RangeResult = ByteRange | "unsatisfiable" | null;

export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header) return null;

  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  // Not a single well-formed byte range (includes every multi-range header,
  // which always contains a comma). Ignorable by spec.
  if (!match) return null;

  const [, startText, endText] = match;
  if (startText === "" && endText === "") return null;

  if (startText === "") {
    // Suffix range: the last N bytes.
    const suffix = Number(endText);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(startText);
  if (start >= size) return "unsatisfiable";

  const end = endText === "" ? size - 1 : Math.min(Number(endText), size - 1);
  // `bytes=500-100` is syntactically invalid, so it is ignored rather than 416.
  if (end < start) return null;

  return { start, end };
}
