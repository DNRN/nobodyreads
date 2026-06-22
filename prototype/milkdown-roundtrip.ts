/**
 * Phase 3 de-risk prototype — Markdown round-trip fidelity for nobodyreads'
 * custom syntax through the remark (mdast) layer that Milkdown is built on.
 *
 * Run:  npx tsx prototype/milkdown-roundtrip.ts
 *
 * The gating question for the Milkdown WYSIWYG: can the editor read our stored
 * Markdown and write it back WITHOUT corrupting the three custom constructs?
 *
 *   1. [[page-id]] / [[page-id|label]]  — wiki links (NOT CommonMark)
 *   2. {{view:slug}}                    — content-view embeds (NOT CommonMark)
 *   3. ![alt|400px|right](url)          — image size/align hints in alt text
 *
 * Milkdown's pipeline is  markdown → remark (mdast) → ProseMirror → remark →
 * markdown. This prototype exercises the remark ends with the SAME plugin shape
 * Milkdown accepts via `$remark` (a transform + a to-markdown handler). If the
 * remark layer round-trips cleanly, the only remaining Phase 3 work is the
 * standard ProseMirror `$node` spec for each construct.
 *
 * It deliberately contrasts:
 *   - NAIVE  : plain remark with no custom handling (shows what breaks)
 *   - CUSTOM : dedicated mdast nodes so the text is never escaped (the fix)
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { visit, SKIP } from "unist-util-visit";

const SAMPLE = `# Heading

A paragraph with a [[page-id]] wiki link and a labelled [[other-page|custom label]] one.

An inline view embed {{view:latest-posts}} sits here.

![A photo|400px|right](/media/photo.jpg)

- list item one
- list item two

> a blockquote
`;

// The exact custom constructs that must survive a round-trip verbatim.
const REQUIRED = [
  "[[page-id]]",
  "[[other-page|custom label]]",
  "{{view:latest-posts}}",
  "![A photo|400px|right](/media/photo.jpg)",
];

// ---------------------------------------------------------------------------
// Custom remark plugin (transferable verbatim to Milkdown's `$remark`)
// ---------------------------------------------------------------------------

// One regex matching either a wiki link or a view embed.
const TOKEN = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]|\{\{view:([a-z0-9-]+)\}\}/g;

/** Parse side: split text nodes into dedicated `wikiLink` / `viewEmbed` nodes. */
function remarkNobodyreadsTokens() {
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
        if (m[1] !== undefined) {
          out.push({ type: "wikiLink", target: m[1], label: m[2] });
        } else {
          out.push({ type: "viewEmbed", slug: m[3] });
        }
        last = m.index + m[0].length;
      }
      if (last < value.length) out.push({ type: "text", value: value.slice(last) });

      parent.children.splice(index, 1, ...out);
      return [SKIP, index + out.length];
    });
  };
}

/** Serialize side: render the dedicated nodes back to the exact source syntax. */
function remarkNobodyreadsStringify(this: any) {
  const data = this.data();
  const extensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
  extensions.push({
    handlers: {
      wikiLink: (node: any) =>
        node.label ? `[[${node.target}|${node.label}]]` : `[[${node.target}]]`,
      viewEmbed: (node: any) => `{{view:${node.slug}}}`,
    },
  });
}

// ---------------------------------------------------------------------------
// Processors
// ---------------------------------------------------------------------------

const naive = unified().use(remarkParse).use(remarkStringify, { bullet: "-" });

const custom = unified()
  .use(remarkParse)
  .use(remarkNobodyreadsTokens)
  .use(remarkStringify, { bullet: "-" })
  .use(remarkNobodyreadsStringify);

function roundTrip(p: ReturnType<typeof unified>, md: string): string {
  return String(p.processSync(md));
}

function report(title: string, output: string) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
  console.log(output);
  console.log("-".repeat(72));
  let allOk = true;
  for (const token of REQUIRED) {
    const ok = output.includes(token);
    if (!ok) allOk = false;
    console.log(`  ${ok ? "PASS" : "FAIL"}  preserves  ${JSON.stringify(token)}`);
  }
  console.log(`  => ${allOk ? "ALL CUSTOM SYNTAX PRESERVED" : "CORRUPTION DETECTED"}`);
  return allOk;
}

console.log("SOURCE MARKDOWN:\n" + "-".repeat(72) + "\n" + SAMPLE);

const naiveOut = roundTrip(naive, SAMPLE);
report("NAIVE remark (no custom handling)", naiveOut);

const customOut = roundTrip(custom, SAMPLE);
const customOk = report("CUSTOM remark (dedicated nodes — the Milkdown plan)", customOut);

// Idempotence: a second pass must be a fixed point (editors save repeatedly).
const customOut2 = roundTrip(custom, customOut);
const idempotent = customOut === customOut2;
console.log(`\nIDEMPOTENCE (custom): ${idempotent ? "PASS — stable on re-save" : "FAIL — drifts on re-save"}`);

console.log(
  `\nRESULT: ${customOk && idempotent ? "GREEN — Milkdown round-trip is viable" : "RED — needs rework"}`,
);
process.exit(customOk && idempotent ? 0 : 1);
