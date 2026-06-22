/**
 * Milkdown plugins for nobodyreads' custom Markdown constructs:
 *
 *   [[page-id]] / [[page-id|label]]  → wiki links   (atom inline node)
 *   {{view:slug}}                    → view embeds   (atom inline node)
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

// Matches a wiki link OR a view embed in a single pass.
const TOKEN = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]|\{\{view:([a-z0-9-]+)\}\}/g;

// --- remark: parse-side transform + serialize-side handlers -----------------
const remarkNbrTokens = $remark("nbrTokens", () =>
  function (this: any) {
    const data = this.data();
    const toMd = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
    toMd.push({
      handlers: {
        wikiLink: (node: any) =>
          node.label ? `[[${node.target}|${node.label}]]` : `[[${node.target}]]`,
        viewEmbed: (node: any) => `{{view:${node.slug}}}`,
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
          else out.push({ type: "viewEmbed", slug: m[3] });
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
  attrs: { slug: { default: "" } },
  parseDOM: [
    {
      tag: "span[data-view-embed]",
      getAttrs: (dom: any) => ({ slug: dom.getAttribute("data-view-embed") ?? "" }),
    },
  ],
  toDOM: (node: any) => [
    "span",
    {
      "data-view-embed": node.attrs.slug,
      class: "nbr-view-embed",
      title: `Content view → ${node.attrs.slug}`,
    },
    `{{view:${node.attrs.slug}}}`,
  ],
  parseMarkdown: {
    match: (node: any) => node.type === "viewEmbed",
    runner: (state: any, node: any, type: any) => {
      state.addNode(type, { slug: node.slug });
    },
  },
  toMarkdown: {
    match: (node: any) => node.type.name === "view_embed",
    runner: (state: any, node: any) => {
      state.addNode("viewEmbed", undefined, undefined, { slug: node.attrs.slug });
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
  new InputRule(/\{\{view:([a-z0-9-]+)\}\}$/, (state, match, start, end) => {
    const [, slug] = match;
    if (!slug) return null;
    return state.tr.replaceRangeWith(start, end, viewEmbedNode.type(ctx).create({ slug }));
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
