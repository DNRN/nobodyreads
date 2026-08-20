import type { Database } from "../db/index.js";
import { Marked, type MarkedExtension } from "marked";
import { normalizeHeadings } from "../shared/markdown-headings.js";
import { resolvePageLinks, getContentViewBySlug, listPostsForView, executeCustomViewQuery } from "./db.js";
import { renderPostListView, type PostListRenderOptions, type PostListVariant } from "./templates.js";
import { escapeHtml } from "../shared/http.js";
import { renderImage } from "../shared/image-markdown.js";
import { embedTokenPattern } from "../shared/embed-token.js";
import { renderCollectionTemplate } from "./collection-template.js";
import { getSiteTemplate } from "../shared/site-bundle.js";
import { createMediaStorage } from "../media/storage.js";
import type { LinkTarget, CustomViewConfig } from "./types.js";
import type { SiteTemplateDefinition } from "../template/types.js";

/**
 * Custom image renderer that supports size and alignment hints in the alt
 * text (see `renderImage` for the full syntax). The same renderer powers the
 * live editor preview so authors get a faithful preview.
 */
const imageSizeExtension: MarkedExtension = {
  renderer: {
    image: ({ href, title, text }) => renderImage({ href, title, text }),
  },
};

const marked = new Marked(
  { gfm: true, breaks: false },
  imageSizeExtension
);

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
  db: Database,
  markdown: string,
  tenantId: string,
  urlPrefix: string = ""
): Promise<string> {
  const matches = [...markdown.matchAll(LINK_PATTERN)];
  if (matches.length === 0) return markdown;

  const ids = [...new Set(matches.map((m) => m[1]))];
  const targets = await resolvePageLinks(db, ids, tenantId);
  const lookup = new Map<string, LinkTarget>(targets.map((t) => [t.id, t]));

  return markdown.replace(LINK_PATTERN, (_match, id: string, customText?: string) => {
    const target = lookup.get(id);
    if (!target) return `[broken link: ${id}]`;
    const text = customText || target.title;
    return `[${text}](${pageUrl(target, urlPrefix)})`;
  });
}

// --- {{collection:slug}} resolution ---

export interface ResolveViewsOptions {
  includeDrafts?: boolean;
  showMissingPlaceholders?: boolean;
  /**
   * The theme this render is using, which a listing takes its layout from.
   *
   * Supplied by the caller because it is not always the published theme: the
   * design editor previews a *draft* revision, and a listing that reads the
   * database for itself would show that draft the published arrangement.
   * Omit it and the published theme is used, which is right for a live page.
   */
  template?: SiteTemplateDefinition | null;
  /**
   * Everything a post listing needs beyond the posts themselves — who is
   * looking, what the space is called, where an empty one points a reader.
   * The layout variant comes from `template` and does not belong here.
   */
  postList?: Omit<PostListRenderOptions, "urlPrefix" | "variant" | "mediaUrl">;
}

/**
 * Resolve all {{collection:slug}} tokens in markdown content.
 * Replacements are HTML snippets inserted before markdown rendering.
 */
export async function resolveViews(
  db: Database,
  markdown: string,
  tenantId: string,
  urlPrefix: string = "",
  options: ResolveViewsOptions = {}
): Promise<string> {
  const viewHtml = await resolveViewSlugs(db, markdown, tenantId, urlPrefix, options);
  if (viewHtml.size === 0) return markdown;
  return markdown.replace(embedTokenPattern(), (_match, slug: string) => viewHtml.get(slug) ?? "");
}

/**
 * The layout a post listing should use, as configured on the site's theme.
 *
 * `template` is the theme the caller is *rendering with*, and it is the answer
 * whenever there is one. Falling back to a database read looks harmless — the
 * two agree on a live page — but they part company on the design editor's
 * preview, which renders a draft revision: read the database there and the
 * author picks Grid, saves, and watches the preview stay a list until publish.
 */
async function postListVariant(
  db: Database,
  tenantId: string,
  template?: SiteTemplateDefinition | null,
): Promise<PostListVariant> {
  const resolved = template ?? (await getSiteTemplate(db, tenantId));
  const variant = resolved?.components?.postPreview?.variant;
  const known: PostListVariant[] = ["default", "compact", "grid", "card"];
  return known.includes(variant as PostListVariant) ? (variant as PostListVariant) : "auto";
}

/** Render each distinct {{collection:slug}} in `markdown` to its HTML. */
async function resolveViewSlugs(
  db: Database,
  markdown: string,
  tenantId: string,
  urlPrefix: string,
  options: ResolveViewsOptions
): Promise<Map<string, string>> {
  const matches = [...markdown.matchAll(embedTokenPattern())];
  const viewHtml = new Map<string, string>();
  if (matches.length === 0) return viewHtml;

  const slugs = [...new Set(matches.map((m) => m[1]))];
  let listDefaults: PostListRenderOptions | null = null;

  for (const slug of slugs) {
    const view = await getContentViewBySlug(db, slug, tenantId, {
      publishedOnly: !options.includeDrafts,
    });

    if (!view) {
      viewHtml.set(
        slug,
        options.showMissingPlaceholders
          ? `<div class="content-view content-view-missing"><p>Missing view: ${escapeHtml(slug)}</p></div>`
          : ""
      );
      continue;
    }

    if (view.kind === "post_list") {
      if (!listDefaults) {
        const storage = createMediaStorage();
        listDefaults = {
          urlPrefix,
          variant: await postListVariant(db, tenantId, options.template),
          mediaUrl: (key) => storage.url(key),
          ...options.postList,
        };
      }
      const config = view.config as { limit?: number };
      const posts = await listPostsForView(db, tenantId, { limit: config.limit });
      viewHtml.set(slug, renderPostListView(posts, listDefaults));
      continue;
    }

    if (view.kind === "custom") {
      viewHtml.set(
        slug,
        await renderCustomView(db, view.config as CustomViewConfig, tenantId, urlPrefix)
      );
      continue;
    }

    viewHtml.set(slug, "");
  }

  return viewHtml;
}

// --- Custom view rendering ---

/**
 * Execute a custom view's SQL query and render the results through its template.
 *
 * The query is validated against a table allowlist (see `custom-view-sql.ts`)
 * before it runs — these results are rendered into **public** pages.
 *
 * The template is written in the collection template language
 * (`collection-template.ts`) — literal HTML plus `{{field}}`, `{{#each}}`,
 * `{{#if}}` and a fixed helper set. It used to be a JavaScript function body
 * executed with `new Function(...)`, which is why custom collections shipped
 * disabled: that is arbitrary server-side code with `process.env` in scope.
 * Authors still write the markup; they just cannot run code, so there is
 * nothing left to gate.
 */
async function renderCustomView(
  db: Database,
  config: CustomViewConfig,
  tenantId: string,
  urlPrefix: string
): Promise<string> {
  if (!config.query || !config.template) {
    return `<div class="content-view content-view-custom content-view-error"><p>Custom view is missing query or template.</p></div>`;
  }

  try {
    const rows = await executeCustomViewQuery(db, config.query, tenantId);
    const html = renderCollectionTemplate(config.template, { rows, urlPrefix });
    return `<section class="content-view content-view-custom">\n${html}\n</section>`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[custom view] render error: ${message}`);
    return `<div class="content-view content-view-custom content-view-error"><p>View error: ${escapeHtml(message)}</p></div>`;
  }
}

// --- Markdown rendering ---

export interface RenderMarkdownOptions {
  /**
   * The title the page chrome renders as the document's `<h1>`.
   *
   * When set, the body is normalised so it cannot compete with that heading:
   * a leading `# ` whose text matches the title is dropped (authors habitually
   * repeat it), and any remaining body `# ` is demoted to `<h2>` so the page
   * keeps exactly one `<h1>`. Omit it for pages that render no chrome title
   * (the home page) — there the body owns its own heading levels.
   */
  pageTitle?: string;
}

export function renderMarkdown(content: string, options: RenderMarkdownOptions = {}): string {
  const { pageTitle } = options;

  if (pageTitle?.trim()) {
    const tokens = marked.lexer(content);
    normalizeHeadings(tokens, pageTitle);
    return marked.parser(tokens);
  }

  const html = marked.parse(content);
  if (typeof html !== "string") {
    throw new Error("Unexpected async markdown rendering");
  }
  return html;
}

// --- Full content rendering pipeline ---

export interface RenderContentOptions extends ResolveViewsOptions, RenderMarkdownOptions {}

/**
 * Render a page's markdown content to HTML, resolving [[id]] links and
 * {{collection:slug}} content views.
 *
 * Views are resolved *after* markdown rendering to prevent the markdown
 * parser from mangling view HTML (e.g. treating indented HTML as code blocks).
 * Internally, view tokens are replaced with HTML-comment placeholders before
 * markdown processing, then the placeholders are swapped for real view HTML
 * in the final output.
 */
export async function renderContent(
  db: Database,
  markdown: string,
  tenantId: string,
  urlPrefix: string = "",
  options: RenderContentOptions = {}
): Promise<string> {
  const withLinks = await resolveLinks(db, markdown, tenantId, urlPrefix);

  const { text: withPlaceholders, viewHtml } = await resolveViewPlaceholders(
    db,
    withLinks,
    tenantId,
    urlPrefix,
    options
  );

  let html = renderMarkdown(withPlaceholders, options);

  if (viewHtml.size > 0) {
    html = html.replace(VIEW_PLACEHOLDER_RE, (_match, slug: string) => viewHtml.get(slug) ?? "");
  }

  return html;
}

// --- View placeholder helpers (internal) ---

const VIEW_PLACEHOLDER_TAG = "nbr-view";
const VIEW_PLACEHOLDER_RE = new RegExp(
  `<!--${VIEW_PLACEHOLDER_TAG}:([a-z0-9-]+)-->`,
  "g"
);

async function resolveViewPlaceholders(
  db: Database,
  markdown: string,
  tenantId: string,
  urlPrefix: string,
  options: ResolveViewsOptions
): Promise<{ text: string; viewHtml: Map<string, string> }> {
  const viewHtml = await resolveViewSlugs(db, markdown, tenantId, urlPrefix, options);
  if (viewHtml.size === 0) return { text: markdown, viewHtml };

  const text = markdown.replace(
    embedTokenPattern(),
    (_match, slug: string) => `\n<!--${VIEW_PLACEHOLDER_TAG}:${slug}-->\n`
  );

  return { text, viewHtml };
}
