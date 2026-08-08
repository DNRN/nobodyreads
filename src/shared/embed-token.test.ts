import { describe, it, expect } from "vitest";
import {
  EMBED_TOKEN_NAME,
  embedToken,
  embedTokenPattern,
  hasEmbedToken,
} from "./embed-token.js";

describe("embed token", () => {
  it("writes the current spelling", () => {
    expect(embedToken("latest-posts")).toBe("{{collection:latest-posts}}");
    expect(EMBED_TOKEN_NAME).toBe("collection");
  });

  it("captures the slug", () => {
    expect(embedTokenPattern().exec("before {{collection:latest-posts}} after")?.[1]).toBe(
      "latest-posts",
    );
  });

  it("matches every token in a document", () => {
    const slugs = [
      ...("{{collection:a}} and {{collection:b}}".matchAll(embedTokenPattern())),
    ].map((m) => m[1]);
    expect(slugs).toEqual(["a", "b"]);
  });

  it("rejects anything that is not a slug", () => {
    expect(hasEmbedToken("{{collection:Not A Slug}}")).toBe(false);
    expect(hasEmbedToken("{{collections:a}}")).toBe(false);
    expect(hasEmbedToken("{{view:a}}")).toBe(false);
    expect(hasEmbedToken("{{siteName}}")).toBe(false);
  });

  it("hands out a fresh regex each call", () => {
    // A shared global regex would carry lastIndex across callers, so the second
    // caller would start mid-string and miss the first token entirely.
    const text = "{{collection:a}}";
    expect(hasEmbedToken(text)).toBe(true);
    expect(hasEmbedToken(text)).toBe(true);
    expect(embedTokenPattern().exec(text)?.[1]).toBe("a");
    expect(embedTokenPattern().exec(text)?.[1]).toBe("a");
  });
});
