import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { visit, SKIP } from "unist-util-visit";
import { EMBED_TOKEN_SOURCE, SITE_TOKEN_SOURCE } from "../../../shared/embed-token.js";

/**
 * Markdown round-trip fidelity for the custom constructs.
 *
 * Milkdown's pipeline is markdown → remark → ProseMirror → remark → markdown.
 * These exercise the remark ends, which is where escaping happens and therefore
 * where corruption comes from; the ProseMirror middle is a faithful carrier once
 * a construct has a node of its own.
 *
 * The parse transform and the to-markdown handlers are the same shape and the
 * same regex `custom-nodes.ts` feeds to `$remark` — that file cannot be imported
 * here because `@milkdown/kit` is browser-bundled.
 */

const TOKEN = new RegExp(
  `\\[\\[([a-z0-9-]+)(?:\\|([^\\]]+))?\\]\\]|${EMBED_TOKEN_SOURCE}|${SITE_TOKEN_SOURCE}`,
  "g",
);

function remarkTokens() {
  return (tree: any) => {
    visit(tree, "text", (node: any, index: number | undefined, parent: any) => {
      if (parent == null || index == null) return;
      const value: string = node.value;
      TOKEN.lastIndex = 0;
      if (!TOKEN.test(value)) return;

      TOKEN.lastIndex = 0;
      const out: any[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = TOKEN.exec(value)) !== null) {
        if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index) });
        if (m[1] !== undefined) out.push({ type: "wikiLink", target: m[1], label: m[2] ?? null });
        else if (m[3] !== undefined) out.push({ type: "viewEmbed", slug: m[3] });
        else out.push({ type: "siteToken", tokenKey: m[4] });
        last = m.index + m[0].length;
      }
      if (last < value.length) out.push({ type: "text", value: value.slice(last) });

      parent.children.splice(index, 1, ...out);
      return [SKIP, index + out.length];
    });
  };
}

function remarkTokensStringify(this: any) {
  const data = this.data();
  const extensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
  extensions.push({
    handlers: {
      wikiLink: (node: any) =>
        node.label ? `[[${node.target}|${node.label}]]` : `[[${node.target}]]`,
      viewEmbed: (node: any) => `{{collection:${node.slug}}}`,
      siteToken: (node: any) => `{{${node.tokenKey}}}`,
    },
  });
}

/** The editor's pipeline: tokens become nodes and are written back verbatim. */
const editor = unified()
  .use(remarkParse)
  .use(remarkTokens)
  .use(remarkStringify, { bullet: "-" })
  .use(remarkTokensStringify);

/** No custom handling — what a bare serializer does. Used to prove the risk. */
const plain = unified().use(remarkParse).use(remarkStringify, { bullet: "-" });

const roundTrip = (p: typeof editor, md: string) => String(p.processSync(md));

describe("site tokens survive a Milkdown round-trip", () => {
  it.each([
    "{{siteName}}",
    "{{siteTagline}}",
    "{{siteLogo}}",
    "{{year}}",
    "{{my_token}}",
    "{{_leading_underscore}}",
    "{{token_with_many_under_scores}}",
    "{{mixedCase_99}}",
  ])("preserves %s", (token) => {
    const out = roundTrip(editor, `Welcome to ${token} today.\n`);
    expect(out).toContain(token);
    expect(out).not.toContain("\\");
  });

  /**
   * The reason these need a node at all. An underscore is emphasis syntax, so a
   * token key carrying one is escaped when it travels as plain text — and
   * `{{my\_token}}` matches nothing at render time, so it ships to the reader
   * as literal braces.
   */
  it("would be corrupted without a node of its own", () => {
    const out = roundTrip(plain, "Welcome to {{my_token}} today.\n");
    expect(out).toContain("{{my\\_token}}");
  });

  it("leaves a camelCase token intact even without a node", () => {
    // Why the bug hid: the built-in identity tokens have no underscore.
    expect(roundTrip(plain, "Hi {{siteName}}.\n")).toContain("{{siteName}}");
  });
});

describe("site tokens coexist with the other constructs", () => {
  it("keeps every construct through one pass", () => {
    const source = [
      "# About {{siteName}}",
      "",
      "A [[page-id]] link, a [[other|labelled]] one, and {{siteTagline}}.",
      "",
      "{{collection:latest-posts}}",
      "",
      "![A photo|400px|right](/media/photo.jpg)",
      "",
      "- {{my_token}} in a list",
      "",
      "> {{year}} in a quote",
      "",
    ].join("\n");

    const out = roundTrip(editor, source);

    for (const token of [
      "{{siteName}}",
      "{{siteTagline}}",
      "{{collection:latest-posts}}",
      "{{my_token}}",
      "{{year}}",
      "[[page-id]]",
      "[[other|labelled]]",
      "![A photo|400px|right](/media/photo.jpg)",
    ]) {
      expect(out).toContain(token);
    }
  });

  it("does not mistake a collection embed for a site token", () => {
    const out = roundTrip(editor, "{{collection:latest-posts}}\n");
    expect(out).toContain("{{collection:latest-posts}}");
  });

  it("is stable on re-save", () => {
    const source = "Hi {{siteName}}, see {{collection:posts}} and {{my_token}}.\n";
    const once = roundTrip(editor, source);
    expect(roundTrip(editor, once)).toBe(once);
  });

  it("leaves text that only looks like a token alone", () => {
    // A lone brace pair is not a token and must not become one.
    const out = roundTrip(editor, "Use {{ }} for tokens, or {{not a token}}.\n");
    expect(out).toContain("{{not a token}}");
  });
});
