import { describe, it, expect } from "vitest";
import { parseRange } from "./range.js";

/**
 * Podcast apps seek by byte range, and some refuse to play a file whose server
 * ignores Range. What matters: exact byte bounds (an off-by-one corrupts
 * audio), 416 only where the spec calls for it, and a whole-file fallback for
 * anything else rather than an error.
 */

const SIZE = 1000;

describe("parseRange", () => {
  it("serves the whole file when no Range is sent", () => {
    expect(parseRange(undefined, SIZE)).toBeNull();
  });

  it("returns inclusive bounds for a closed range", () => {
    expect(parseRange("bytes=0-99", SIZE)).toEqual({ start: 0, end: 99 });
  });

  it("runs an open-ended range to the last byte", () => {
    expect(parseRange("bytes=900-", SIZE)).toEqual({ start: 900, end: 999 });
  });

  it("clamps an end past EOF to the last byte", () => {
    expect(parseRange("bytes=990-5000", SIZE)).toEqual({ start: 990, end: 999 });
  });

  it("reads a suffix range as the last N bytes", () => {
    expect(parseRange("bytes=-100", SIZE)).toEqual({ start: 900, end: 999 });
  });

  it("caps a suffix longer than the file at the whole file", () => {
    expect(parseRange("bytes=-5000", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("is unsatisfiable when the start is at or past EOF", () => {
    expect(parseRange("bytes=1000-", SIZE)).toBe("unsatisfiable");
  });

  it("is unsatisfiable for a zero-length suffix", () => {
    expect(parseRange("bytes=-0", SIZE)).toBe("unsatisfiable");
  });

  it("is unsatisfiable for any range on an empty file", () => {
    expect(parseRange("bytes=0-", 0)).toBe("unsatisfiable");
  });

  it("ignores multi-range requests instead of failing them", () => {
    expect(parseRange("bytes=0-9,20-29", SIZE)).toBeNull();
  });

  it("ignores a reversed range as malformed", () => {
    expect(parseRange("bytes=500-100", SIZE)).toBeNull();
  });

  it("ignores units other than bytes", () => {
    expect(parseRange("items=0-9", SIZE)).toBeNull();
  });
});
