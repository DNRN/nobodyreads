// --- Import agent: HTML → DocumentOutline ---
//
// A deliberately dumb structural walk. It knows three things: what a section
// is (a top-level <section>, or — in a plain page — a run of content under
// an h1–h3), what a block is (prose, list, image, caption, footnote,
// sub-heading), and what is presentation (scripts, styles, canvases, inline
// SVG, buttons) and must never reach the model. Everything else is treated
// generically: a div that contains only inline elements is prose (gallery
// labels, kickers, eyebrows), a div that contains structure is a container
// to recurse into. No deck-specific classes are read, on purpose — the same
// walk must survive the next hand-made export format too.

import { parseHTML } from "linkedom";
import type { DocumentOutline, OutlineBlock, OutlineSection } from "./types.js";

/** Presentation and interactivity: dropped wholesale, never read. */
const SKIP_TAGS: Record<string, true> = {
  script: true,
  style: true,
  canvas: true,
  svg: true,
  noscript: true,
  template: true,
  audio: true,
  video: true,
  iframe: true,
  object: true,
  embed: true,
  button: true,
  select: true,
  input: true,
  form: true,
  nav: true,
};

/** Inline elements: transparent for text, never block boundaries. */
const INLINE_TAGS: Record<string, true> = {
  span: true,
  em: true,
  strong: true,
  a: true,
  small: true,
  b: true,
  i: true,
  u: true,
  s: true,
  code: true,
  br: true,
  abbr: true,
  sub: true,
  sup: true,
  mark: true,
  time: true,
};

const HEADING_LEVELS: Record<string, number> = { h1: 1, h2: 2, h3: 3 };

function normalize(text: string | null | undefined): string {
  return (text ?? "").replaceAll(/\s+/g, " ").trim();
}

interface NodeLike {
  nodeType: number;
  localName?: string;
  childNodes?: NodeLike[];
}

interface ElementLike extends NodeLike {
  localName: string;
  textContent: string | null;
  getAttribute(name: string): string | null;
  querySelectorAll(selector: string): ElementLike[];
}

/**
 * A div (or figure, article, …) whose element descendants are all inline is
 * one prose run — the gallery labels, kickers, eyebrows and verdict chips
 * that carry real text but no structure.
 */
function isProseLeaf(element: ElementLike): boolean {
  const descendants = element.querySelectorAll("*");
  for (const child of descendants) {
    if (!INLINE_TAGS[child.localName.toLowerCase()]) return false;
  }
  return normalize(element.textContent).length > 0;
}

function collectBlocks(node: NodeLike, blocks: OutlineBlock[]): void {
  for (const child of node.childNodes ?? []) {
    if (child.nodeType !== 1) continue;
    const element = child as ElementLike;
    const tag = element.localName.toLowerCase();

    if (SKIP_TAGS[tag]) continue;

    const headingLevel = HEADING_LEVELS[tag] ?? null;
    if (headingLevel !== null) {
      const text = normalize(element.textContent);
      if (text) blocks.push({ type: "heading", level: headingLevel, text });
      continue;
    }

    if (tag === "p") {
      const text = normalize(element.textContent);
      if (text) blocks.push({ type: "text", text });
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      const items = (element.childNodes ?? [])
        .filter((item) => item.nodeType === 1 && (item as ElementLike).localName.toLowerCase() === "li")
        .map((item) => normalize((item as ElementLike).textContent))
        .filter((text) => text.length > 0);
      if (items.length > 0) blocks.push({ type: "list", ordered: tag === "ol", items });
      continue;
    }

    if (tag === "img") {
      const src = (element.getAttribute("src") ?? "").trim();
      // data: URIs cannot become media assets; absent/empty src is nothing.
      if (src && !src.startsWith("data:")) {
        blocks.push({ type: "image", src, alt: normalize(element.getAttribute("alt")) });
      }
      continue;
    }

    if (tag === "figcaption") {
      const text = normalize(element.textContent);
      if (text) blocks.push({ type: "caption", text });
      continue;
    }

    if (tag === "aside") {
      // reveal.js keeps speaker notes in <aside class="notes">; any aside is
      // author-facing marginalia, never body copy.
      const text = normalize(element.textContent);
      if (text) blocks.push({ type: "footnote", text });
      continue;
    }

    if (isProseLeaf(element)) {
      blocks.push({ type: "text", text: normalize(element.textContent) });
      continue;
    }

    collectBlocks(element, blocks);
  }
}

/** Promote the first heading out of the blocks as the section's title. */
function toSection(blocks: OutlineBlock[]): OutlineSection {
  const headingIndex = blocks.findIndex((block) => block.type === "heading");
  if (headingIndex === -1) return { heading: null, blocks };
  const heading = blocks[headingIndex] as Extract<OutlineBlock, { type: "heading" }>;
  return {
    heading: heading.text,
    blocks: blocks.filter((_, index) => index !== headingIndex),
  };
}

function sectionElements(document: ElementLike): ElementLike[] {
  const all = Array.from(document.querySelectorAll("section")) as ElementLike[];
  const topLevel = all.filter(
    (element) =>
      !all.some((other) => other !== element && other.querySelectorAll("section").some((s) => s === element)),
  );
  return topLevel.length > 0 ? topLevel : [];
}

function headingSplitSections(body: NodeLike): OutlineSection[] {
  const blocks: OutlineBlock[] = [];
  collectBlocks(body, blocks);
  const sections: OutlineSection[] = [];
  let current: OutlineBlock[] = [];
  for (const block of blocks) {
    if (block.type === "heading") {
      if (current.length > 0) sections.push(toSection(current));
      current = [block];
    } else {
      current.push(block);
    }
  }
  if (current.length > 0) sections.push(toSection(current));
  return sections;
}

export function extractOutline(html: string): DocumentOutline {
  const { document } = parseHTML(html);
  const documentElement = document.documentElement as unknown as ElementLike;
  const body = (document.body ?? documentElement) as unknown as ElementLike;

  const title =
    normalize((document.querySelector("title") as unknown as ElementLike | null)?.textContent) ||
    normalize(
      (document.querySelector("h1") as unknown as ElementLike | null)?.textContent,
    ) ||
    null;
  const language = normalize(documentElement.getAttribute("lang")) || null;

  const sections = sectionElements(documentElement);
  const outlineSections: OutlineSection[] =
    sections.length > 0
      ? sections.map((section) => {
          const blocks: OutlineBlock[] = [];
          collectBlocks(section, blocks);
          return toSection(blocks);
        })
      : headingSplitSections(body);

  const seen = new Set<string>();
  const images: string[] = [];
  for (const section of outlineSections) {
    for (const block of section.blocks) {
      if (block.type === "image" && !seen.has(block.src)) {
        seen.add(block.src);
        images.push(block.src);
      }
    }
  }

  return { title, language, sections: outlineSections, images };
}
