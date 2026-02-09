import type { Client } from "@libsql/client";
import { Marked } from "marked";
import { resolvePageLinks } from "./db.js";
import type { LinkTarget } from "./types.js";

const marked = new Marked({
  gfm: true,
  breaks: false,
});

// --- [[id]] link resolution ---

/** Regex for wiki-style internal links: [[id]] or [[id|display text]] */
const LINK_PATTERN = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;

/** Build the URL for a page based on its kind and slug. */
function pageUrl(target: LinkTarget, urlPrefix: string = ""): string {
  if (target.kind === "home") return urlPrefix || "/";
  if (target.kind === "post") return `${urlPrefix}/posts/${target.slug}`;
  return `${urlPrefix}/${target.slug}`;
}

/**
 * Resolve all [[id]] and [[id|text]] tokens in markdown content.
 *
 * - [[mycelium-and-microservices]]      → [Mycelium networks and microservices](/posts/mycelium-and-microservices)
 * - [[mycelium-and-microservices|Wood wide web]] → [Wood wide web](/posts/mycelium-and-microservices)
 * - [[nonexistent]]                     → [broken link: nonexistent]
 *
 * Links are resolved against the database at render time, so they always
 * point to the current slug even if a page has been renamed.
 */
export async function resolveLinks(
  db: Client,
  markdown: string,
  tenantId: string,
  urlPrefix: string = ""
): Promise<string> {
  // Extract all referenced IDs
  const matches = [...markdown.matchAll(LINK_PATTERN)];
  if (matches.length === 0) return markdown;

  const ids = [...new Set(matches.map((m) => m[1]))];
  const targets = await resolvePageLinks(db, ids, tenantId);
  const lookup = new Map<string, LinkTarget>(targets.map((t) => [t.id, t]));

  // Replace tokens with standard markdown links
  return markdown.replace(LINK_PATTERN, (_match, id: string, customText?: string) => {
    const target = lookup.get(id);
    if (!target) return `[broken link: ${id}]`;
    const text = customText || target.title;
    return `[${text}](${pageUrl(target, urlPrefix)})`;
  });
}

// --- Markdown rendering ---

export function renderMarkdown(content: string): string {
  const html = marked.parse(content);
  if (typeof html !== "string") {
    throw new Error("Unexpected async markdown rendering");
  }
  return html;
}
