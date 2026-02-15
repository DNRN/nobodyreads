import type { Client } from "@libsql/client";
import { Marked } from "marked";
import { resolvePageLinks, getContentViewBySlug, listPostsForView, executeCustomViewQuery } from "./db.js";
import { renderPostListView } from "./templates.js";
import { escapeHtml } from "../shared/http.js";
import type { LinkTarget, CustomViewConfig } from "./types.js";

const marked = new Marked({
  gfm: true,
  breaks: false,
});

// --- [[id]] link resolution ---

/** Regex for wiki-style internal links: [[id]] or [[id|display text]] */
const LINK_PATTERN = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;
const VIEW_PATTERN = /\{\{view:([a-z0-9-]+)\}\}/g;

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

// --- {{view:slug}} resolution ---

export interface ResolveViewsOptions {
  includeDrafts?: boolean;
  showMissingPlaceholders?: boolean;
}

/**
 * Resolve all {{view:slug}} tokens in markdown content.
 * Replacements are HTML snippets inserted before markdown rendering.
 */
export async function resolveViews(
  db: Client,
  markdown: string,
  tenantId: string,
  urlPrefix: string = "",
  options: ResolveViewsOptions = {}
): Promise<string> {
  const matches = [...markdown.matchAll(VIEW_PATTERN)];
  if (matches.length === 0) return markdown;

  const slugs = [...new Set(matches.map((m) => m[1]))];
  const lookup = new Map<string, string>();

  for (const slug of slugs) {
    const view = await getContentViewBySlug(db, slug, tenantId, {
      publishedOnly: !options.includeDrafts,
    });

    if (!view) {
      const fallback = options.showMissingPlaceholders
        ? `<div class="content-view content-view-missing"><p>Missing view: ${slug}</p></div>`
        : "";
      lookup.set(slug, fallback);
      continue;
    }

    if (view.kind === "post_list") {
      const config = view.config as { limit?: number };
      const posts = await listPostsForView(db, tenantId, {
        limit: config.limit,
      });
      lookup.set(slug, renderPostListView(posts, urlPrefix));
      continue;
    }

    if (view.kind === "custom") {
      const html = await renderCustomView(db, view.config as CustomViewConfig, tenantId, urlPrefix);
      lookup.set(slug, html);
      continue;
    }

    lookup.set(slug, "");
  }

  return markdown.replace(VIEW_PATTERN, (_match, slug: string) => lookup.get(slug) ?? "");
}

// --- Custom view rendering ---

/**
 * Execute a custom view's SQL query and render the results through its template.
 *
 * The template is a JavaScript function body that receives:
 *   - rows: Record<string, unknown>[] — the query result rows
 *   - urlPrefix: string — URL prefix for building links
 *   - escapeHtml: (s: string) => string — HTML escaping utility
 *
 * Example template:
 *   return rows.map(row =>
 *     `<article><a href="${urlPrefix}/posts/${row.slug}">${escapeHtml(String(row.title))}</a></article>`
 *   ).join('\n');
 */
async function renderCustomView(
  db: Client,
  config: CustomViewConfig,
  tenantId: string,
  urlPrefix: string
): Promise<string> {
  if (!config.query || !config.template) {
    return `<div class="content-view content-view-custom content-view-error"><p>Custom view is missing query or template.</p></div>`;
  }

  try {
    const rows = await executeCustomViewQuery(db, config.query, tenantId);

    // Build the template function: (rows, urlPrefix, escapeHtml) => string
    const templateFn = new Function("rows", "urlPrefix", "escapeHtml", config.template) as (
      rows: Record<string, unknown>[],
      urlPrefix: string,
      escapeHtml: (s: string) => string
    ) => string;

    const html = templateFn(rows, urlPrefix, escapeHtml);
    return `<section class="content-view content-view-custom">\n${html}\n</section>`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[custom view] render error: ${message}`);
    return `<div class="content-view content-view-custom content-view-error"><p>View error: ${escapeHtml(message)}</p></div>`;
  }
}

// --- Markdown rendering ---

export function renderMarkdown(content: string): string {
  const html = marked.parse(content);
  if (typeof html !== "string") {
    throw new Error("Unexpected async markdown rendering");
  }
  return html;
}
