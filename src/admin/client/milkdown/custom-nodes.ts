/**
 * Milkdown plugins for nobodyreads' custom Markdown constructs:
 *
 *   [[page-id]] / [[page-id|label]]  → wiki links   (atom inline node)
 *   {{collection:slug}}              → collection embeds (atom inline node)
 *   {{view:slug}}                    → the same, legacy spelling
 *
 * Each construct is modelled as a dedicated atom node (never plain text) so the
 * Markdown serializer can never escape it — the round-trip fidelity proven in
 * `prototype/milkdown-roundtrip.ts`. Image size/align hints (`![alt|400px|right]`)
 * need no special handling: they live inside standard image alt text, which
 * Milkdown preserves verbatim.
 *
 * Wiring per construct:
 *   - one shared `$remark` plugin   → parse-side transform (text → mdast nodes)
 *                                      + serialize-side mdast→string handlers
 *   - a `$node` schema per construct → mdast ↔ ProseMirror mapping + rendering
 *   - an `$inputRule` per construct  → type the raw syntax, get a live node
 */
import { $remark, $node, $inputRule } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { visit, SKIP } from "unist-util-visit";
import {
  EMBED_TOKEN_NAME,
  EMBED_TOKEN_SOURCE,
  type EmbedTokenName,
} from "../../../shared/embed-token.js";

// Matches a wiki link OR a collection embed in a single pass. Built rather than
// written out so the accepted token spellings live in exactly one module.
// Groups: 1 wiki target, 2 wiki label, 3 token name, 4 slug.
const TOKEN_SOURCE = `\\[\\[([a-z0-9-]+)(?:\\|([^\\]]+))?\\]\\]|${EMBED_TOKEN_SOURCE}`;
const TOKEN = new RegExp(TOKEN_SOURCE, "g");

// --- remark: parse-side transform + serialize-side handlers -----------------
const remarkNbrTokens = $remark("nbrTokens", () =>
  function (this: any) {
    const data = this.data();
    const toMd = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
    toMd.push({
      handlers: {
        wikiLink: (node: any) =>
          node.label ? `[[${node.target}|${node.label}]]` : `[[${node.target}]]`,
        // Round-trips the spelling it was parsed from. Migrating legacy
        // tokens here would mean a silent rewrite of every embed in the
        // document the first time autosave fires after opening it.
        viewEmbed: (node: any) => `{{${node.name ?? EMBED_TOKEN_NAME}:${node.slug}}}`,
      },
    });

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
          else out.push({ type: "viewEmbed", name: m[3], slug: m[4] });
          last = m.index + m[0].length;
        }
        if (last < value.length) out.push({ type: "text", value: value.slice(last) });

        parent.children.splice(index, 1, ...out);
        return [SKIP, index + out.length];
      });
    };
  },
);

// --- wiki link node ---------------------------------------------------------
const wikiLinkNode = $node("wiki_link", () => ({
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  attrs: { target: { default: "" }, label: { default: null } },
  parseDOM: [
    {
      tag: "span[data-wiki-link]",
      getAttrs: (dom: any) => ({
        target: dom.getAttribute("data-wiki-link") ?? "",
        label: dom.getAttribute("data-label") || null,
      }),
    },
  ],
  toDOM: (node: any) => [
    "span",
    {
      "data-wiki-link": node.attrs.target,
      "data-label": node.attrs.label ?? "",
      class: "nbr-wiki-link",
      title: `Wiki link → ${node.attrs.target}`,
    },
    node.attrs.label || node.attrs.target,
  ],
  parseMarkdown: {
    match: (node: any) => node.type === "wikiLink",
    runner: (state: any, node: any, type: any) => {
      state.addNode(type, { target: node.target, label: node.label ?? null });
    },
  },
  toMarkdown: {
    match: (node: any) => node.type.name === "wiki_link",
    runner: (state: any, node: any) => {
      state.addNode("wikiLink", undefined, undefined, {
        target: node.attrs.target,
        label: node.attrs.label ?? undefined,
      });
    },
  },
}));

// --- view embed node --------------------------------------------------------
const viewEmbedNode = $node("view_embed", () => ({
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  attrs: { slug: { default: "" }, name: { default: EMBED_TOKEN_NAME } },
  parseDOM: [
    {
      tag: "span[data-view-embed]",
      getAttrs: (dom: any) => ({
        slug: dom.getAttribute("data-view-embed") ?? "",
        name: (dom.getAttribute("data-token-name") as EmbedTokenName) || EMBED_TOKEN_NAME,
      }),
    },
  ],
  toDOM: (node: any) => [
    "span",
    {
      "data-view-embed": node.attrs.slug,
      "data-token-name": node.attrs.name,
      class: "nbr-view-embed",
      title: `Collection → ${node.attrs.slug}`,
    },
    `{{${node.attrs.name}:${node.attrs.slug}}}`,
  ],
  parseMarkdown: {
    match: (node: any) => node.type === "viewEmbed",
    runner: (state: any, node: any, type: any) => {
      state.addNode(type, { slug: node.slug, name: node.name ?? EMBED_TOKEN_NAME });
    },
  },
  toMarkdown: {
    match: (node: any) => node.type.name === "view_embed",
    runner: (state: any, node: any) => {
      state.addNode("viewEmbed", undefined, undefined, {
        slug: node.attrs.slug,
        name: node.attrs.name,
      });
    },
  },
}));

// --- input rules: typing the raw syntax produces a live node ----------------
const wikiLinkInputRule = $inputRule((ctx) =>
  new InputRule(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]$/, (state, match, start, end) => {
    const [, target, label] = match;
    if (!target) return null;
    return state.tr.replaceRangeWith(
      start,
      end,
      wikiLinkNode.type(ctx).create({ target, label: label ?? null }),
    );
  }),
);

const viewEmbedInputRule = $inputRule((ctx) =>
  // Anchored to the caret, so typing either spelling yields a live node — and
  // keeps the one that was typed.
  new InputRule(new RegExp(`${EMBED_TOKEN_SOURCE}$`), (state, match, start, end) => {
    const [, name, slug] = match;
    if (!slug) return null;
    return state.tr.replaceRangeWith(
      start,
      end,
      viewEmbedNode.type(ctx).create({ slug, name: name ?? EMBED_TOKEN_NAME }),
    );
  }),
);

/**
 * All plugins required for the custom constructs, flattened for `editor.use()`.
 * (`$remark` returns a [ctx, plugin] tuple, hence the `.flat()`.)
 */
export const nobodyreadsMilkdownPlugins: MilkdownPlugin[] = [
  remarkNbrTokens,
  wikiLinkNode,
  viewEmbedNode,
  wikiLinkInputRule,
  viewEmbedInputRule,
].flat() as MilkdownPlugin[];
