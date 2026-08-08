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

  it("matches the current spelling, capturing name then slug", () => {
    const m = embedTokenPattern().exec("before {{collection:latest-posts}} after");
    expect(m?.[1]).toBe("collection");
    expect(m?.[2]).toBe("latest-posts");
  });

  it("still matches the legacy {{view:slug}} spelling", () => {
    const m = embedTokenPattern().exec("before {{view:latest-posts}} after");
    expect(m?.[1]).toBe("view");
    expect(m?.[2]).toBe("latest-posts");
  });

  it("matches both spellings in one document", () => {
    const slugs = [
      ...("{{view:a}} and {{collection:b}}".matchAll(embedTokenPattern())),
    ].map((m) => m[2]);
    expect(slugs).toEqual(["a", "b"]);
  });

  it("rejects anything that is not a slug", () => {
    expect(hasEmbedToken("{{collection:Not A Slug}}")).toBe(false);
    expect(hasEmbedToken("{{collections:a}}")).toBe(false);
    expect(hasEmbedToken("{{views:a}}")).toBe(false);
    expect(hasEmbedToken("{{siteName}}")).toBe(false);
  });

  it("hands out a fresh regex each call", () => {
    // A shared global regex would carry lastIndex across callers, so the second
    // caller would start mid-string and miss the first token entirely.
    const text = "{{collection:a}}";
    expect(hasEmbedToken(text)).toBe(true);
    expect(hasEmbedToken(text)).toBe(true);
    expect(embedTokenPattern().exec(text)?.[2]).toBe("a");
    expect(embedTokenPattern().exec(text)?.[2]).toBe("a");
  });
});
