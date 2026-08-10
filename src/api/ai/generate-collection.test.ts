import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { generateCollection } from "./generate-collection.js";
import type { AICollectionProvider } from "./collection-provider.js";
import {
  COLLECTION_SYSTEM_PROMPT,
  READABLE_COLUMNS,
  buildCollectionRetryPrompt,
} from "../../content/ai-collection.js";
import { CUSTOM_VIEW_ALLOWED_TABLES } from "../../content/custom-view-sql.js";

const GOOD = {
  name: "Fishing posts",
  query:
    "SELECT slug, title, excerpt, date FROM page_public " +
    "WHERE published = 1 AND kind = 'post' AND tenant_id = :tenant_id ORDER BY date DESC LIMIT 10",
  template: "{{#each rows}}<p><a href=\"{{postUrl slug}}\">{{title}}</a></p>{{/each}}",
};

/** A provider that returns each scripted answer in turn. */
function scripted(...answers: unknown[]): AICollectionProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async generateCollection(input: string) {
      calls.push(input);
      return answers[calls.length - 1] ?? answers[answers.length - 1];
    },
  };
}

/**
 * The JSON Schema guides the model; it is not the boundary. Whatever comes back
 * goes through the same validators a hand-written collection faces, because an
 * AI collection is saved through the same route as any other.
 */
describe("a generated collection is held to the engine's rules", () => {
  it("accepts a valid draft", async () => {
    const result = await generateCollection(scripted(GOOD), "my posts");
    expect(result).toEqual({ ok: true, collection: GOOD });
  });

  it("refuses a query that reads outside the allowlist", async () => {
    const bad = { ...GOOD, query: "SELECT email FROM tenant WHERE tenant_id = :tenant_id" };
    const result = await generateCollection(scripted(bad, bad), "everything");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/not allowed/);
  });

  it("refuses a query with no tenant scope", async () => {
    const bad = { ...GOOD, query: "SELECT slug FROM page_public LIMIT 5" };
    const result = await generateCollection(scripted(bad, bad), "everything");
    expect(result.ok).toBe(false);
  });

  it("refuses a template that does not parse", async () => {
    const bad = { ...GOOD, template: "{{#each rows}}<p>{{title}}</p>" };
    const result = await generateCollection(scripted(bad, bad), "my posts");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/never closed/);
  });

  it("refuses a response that is not a collection at all", async () => {
    const result = await generateCollection(scripted({ nope: true }), "my posts");
    expect(result).toEqual({ ok: false, error: "The model did not return a usable collection." });
  });
});

describe("one retry, with the rejection fed back", () => {
  it("recovers when the second attempt is valid", async () => {
    const provider = scripted({ ...GOOD, query: "SELECT * FROM page WHERE tenant_id = :tenant_id" }, GOOD);
    const result = await generateCollection(provider, "my posts");

    expect(result.ok).toBe(true);
    expect(provider.calls).toHaveLength(2);
    // The second call has to carry what went wrong, or it is just a re-roll.
    expect(provider.calls[1]).toContain("was rejected:");
    expect(provider.calls[1]).toMatch(/not allowed/);
  });

  it("does not retry a draft that was already acceptable", async () => {
    const provider = scripted(GOOD);
    await generateCollection(provider, "my posts");
    expect(provider.calls).toHaveLength(1);
  });

  it("stops after the retry rather than looping", async () => {
    const bad = { ...GOOD, template: "{{/if}}" };
    const provider = scripted(bad, bad, GOOD);
    const result = await generateCollection(provider, "my posts");
    expect(result.ok).toBe(false);
    expect(provider.calls).toHaveLength(2);
  });

  it("reports the second failure, which describes what is on the table now", async () => {
    const first = { ...GOOD, query: "SELECT slug FROM page_public LIMIT 5" };
    const second = { ...GOOD, template: "{{#each rows}}" };
    const result = await generateCollection(scripted(first, second), "my posts");
    expect(result.ok === false && result.error).toMatch(/never closed/);
  });
});

describe("the prompt tells the model the rules it will be judged by", () => {
  it("names every readable table", () => {
    for (const table of CUSTOM_VIEW_ALLOWED_TABLES) {
      expect(COLLECTION_SYSTEM_PROMPT).toContain(table);
    }
  });

  it("states the tenant-scope requirement and the template helpers", () => {
    expect(COLLECTION_SYSTEM_PROMPT).toContain(":tenant_id");
    expect(COLLECTION_SYSTEM_PROMPT).toContain("{{#each rows}}");
    expect(COLLECTION_SYSTEM_PROMPT).toContain("{{postUrl x}}");
    // The model must not think it is writing a JS callback, as the old
    // templates were.
    expect(COLLECTION_SYSTEM_PROMPT).toContain("NOT JavaScript");
  });

  // The page_public view is maintained by hand in schema.sql with a comment
  // telling you to add new columns there. If one is added, the model should
  // learn about it too.
  it("lists the same page_public columns the schema defines", () => {
    const schema = readFileSync(new URL("../../../schema.sql", import.meta.url), "utf8");
    const view = schema.slice(schema.indexOf("CREATE VIEW page_public"));
    const columns = view
      .slice(view.indexOf("SELECT") + 6, view.indexOf("FROM page"))
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    expect([...columns].sort()).toEqual([...READABLE_COLUMNS.page_public!].sort());
  });
});

describe("the retry prompt", () => {
  it("carries the description, the error and the previous attempt", () => {
    const prompt = buildCollectionRetryPrompt("my posts", GOOD, "Query: nope");
    expect(prompt).toContain("my posts");
    expect(prompt).toContain("Query: nope");
    expect(prompt).toContain(GOOD.query);
    expect(prompt).toContain(GOOD.template);
  });
});
