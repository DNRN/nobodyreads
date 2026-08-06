import { describe, it, expect } from "vitest";
import { safeReturnPath } from "./routes.js";

const ORIGIN = "https://nobodyreads.me";

describe("safeReturnPath", () => {
  describe("with a plot prefix", () => {
    const prefix = "/alice";
    const ok = (raw: unknown) => safeReturnPath(raw, ORIGIN, prefix);

    it("keeps the post the reader was on", () => {
      expect(ok("/alice/posts/how-to-fish")).toBe("/alice/posts/how-to-fish");
    });

    it("preserves an existing query string", () => {
      expect(ok("/alice/posts/x?ref=newsletter")).toBe("/alice/posts/x?ref=newsletter");
    });

    it("accepts the plot root exactly", () => {
      expect(ok("/alice")).toBe("/alice");
    });

    // The open-redirect surface. `return_to` is reader-controlled, so a crafted
    // link must not be able to hand someone off to a lookalike payment page
    // once checkout finishes.
    it.each([
      ["an absolute URL", "https://evil.example/pay"],
      ["a protocol-relative URL", "//evil.example/pay"],
      ["a backslash browsers normalise to //", "/\\evil.example"],
      ["a scheme with no slash", "javascript:alert(1)"],
      ["a bare path with no leading slash", "evil.example"],
      ["another plot", "/bob/posts/x"],
      ["a prefix that only looks like ours", "/alicent-evil/x"],
      ["an empty string", ""],
      ["a non-string", 42],
      ["nothing at all", undefined],
    ])("rejects %s", (_label, raw) => {
      expect(ok(raw)).toBeNull();
    });

    it("never returns an absolute URL, even for a same-origin one", () => {
      // Callers build the final URL from the origin they control; returning a
      // path means a foreign origin cannot be smuggled back in.
      expect(ok(`${ORIGIN}/alice/posts/x`)).toBeNull();
    });
  });

  describe("without a prefix (self-hosted, single tenant)", () => {
    const ok = (raw: unknown) => safeReturnPath(raw, ORIGIN, "");

    it("accepts any same-origin path", () => {
      expect(ok("/posts/how-to-fish")).toBe("/posts/how-to-fish");
      expect(ok("/")).toBe("/");
    });

    it("still rejects off-origin targets", () => {
      expect(ok("//evil.example")).toBeNull();
      expect(ok("https://evil.example")).toBeNull();
    });
  });
});
