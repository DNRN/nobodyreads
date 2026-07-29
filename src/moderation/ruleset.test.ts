import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadRulesetFile, clearRulesetCache, fileRulesetSource } from "./ruleset.js";

let dir: string;
let path: string;
const originalEnv = process.env.MODERATION_RULESET;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ruleset-"));
  path = join(dir, "ruleset.md");
  process.env.MODERATION_RULESET = path;
  clearRulesetCache();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (originalEnv === undefined) delete process.env.MODERATION_RULESET;
  else process.env.MODERATION_RULESET = originalEnv;
  clearRulesetCache();
});

describe("loadRulesetFile", () => {
  it("returns null when no ruleset file exists — moderation is off by default", () => {
    expect(loadRulesetFile()).toBeNull();
  });

  it("returns null for a file that is empty or only whitespace", () => {
    writeFileSync(path, "   \n\n  ");
    expect(loadRulesetFile()).toBeNull();
  });

  it("reads the markdown verbatim", () => {
    writeFileSync(path, "# Rules\n\nBe kind.\n");
    expect(loadRulesetFile()).toBe("# Rules\n\nBe kind.");
  });

  it("picks up an edit without a restart", () => {
    writeFileSync(path, "first");
    expect(loadRulesetFile()).toBe("first");

    // Same path, new content and a bumped mtime — the cache must not win.
    writeFileSync(path, "second");
    const future = new Date(Date.now() + 5_000);
    utimesSync(path, future, future);

    expect(loadRulesetFile()).toBe("second");
  });

  it("goes back to null when the file is deleted", () => {
    writeFileSync(path, "rules");
    expect(loadRulesetFile()).toBe("rules");
    rmSync(path);
    expect(loadRulesetFile()).toBeNull();
  });
});

describe("fileRulesetSource", () => {
  it("ignores the tenant id — one ruleset per deployment", async () => {
    writeFileSync(path, "shared rules");
    expect(await fileRulesetSource("tenant-a")).toBe("shared rules");
    expect(await fileRulesetSource("tenant-b")).toBe("shared rules");
  });
});
