import type { PageSummary } from "./types.js";
import { escapeHtml } from "../shared/http.js";

/**
 * How a post listing is laid out.
 *
 * `auto` is the default and resolves by how much there is to show: a handful
 * of posts read best as full-width rows with their excerpts, an archive reads
 * best as a scannable grid. An owner who picks one explicitly in the theme
 * editor overrides the guess.
 */
export type PostListVariant = "auto" | "default" | "compact" | "card";

/** Above this many posts, `auto` switches from rows to a card grid. */
const ROWS_MAX_POSTS = 4;

/** Below this many posts there is nothing to filter — chips would be noise. */
const FILTER_MIN_POSTS = 6;

/** Posts revealed before the reader has to ask for more. */
const PAGE_SIZE = 12;

/** Most chips a filter row will show before it stops being wayfinding. */
const MAX_FILTER_CHIPS = 8;

/**
 * The hero's meta line, or nothing when there is too little published for one
 * to say anything.
 *
 * Supplying it is what switches the hero to its compact form, so this doubles
 * as the density rule — and shares `ROWS_MAX_POSTS` with the listing so a site
 * cannot end up with a compact hero over a sparse list, or the reverse.
 */
export function heroMetaLine(stats: { total: number; firstYear: number | null }): string | undefined {
  if (stats.total <= ROWS_MAX_POSTS) return undefined;
  const posts = `${stats.total} post${stats.total === 1 ? "" : "s"}`;
  return stats.firstYear ? `${posts} · since ${stats.firstYear}` : posts;
}

export interface PostListRenderOptions {
  urlPrefix?: string;
  /** Resolved from the site's theme. Defaults to `auto`. */
  variant?: PostListVariant;
  /** Whether the viewer owns this site. Only affects the empty state. */
  isOwner?: boolean;
  /** Site name, used in the visitor-facing empty state. */
  siteName?: string;
  /**
   * What this space is called in reader-facing copy. The engine is a blog
   * engine; a host that brands its spaces differently passes its own noun
   * rather than forking the copy.
   */
  spaceNoun?: string;
  /** Where an owner goes to write their first post. */
  composeHref?: string;
  /** Optional secondary link on the owner's empty state. */
  manifestoHref?: string;
  /** Feed URL offered to a visitor when there is nothing to read yet. */
  feedHref?: string;
  /** Resolves a stored media key to a URL, for post cover images. */
  mediaUrl?: (key: string) => string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function resolveVariant(variant: PostListVariant, count: number): Exclude<PostListVariant, "auto"> {
  if (variant !== "auto") return variant;
  return count > ROWS_MAX_POSTS ? "card" : "default";
}

function coverUrl(post: PageSummary, mediaUrl?: (key: string) => string): string | null {
  const raw = post.coverImage?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw;
  return mediaUrl ? mediaUrl(raw) : null;
}

function tagChipsHtml(tags: string[]): string {
  if (tags.length === 0) return "";
  const chips = tags.map((tag) => `<span class="post-tag">${escapeHtml(tag)}</span>`).join("");
  return `<p class="post-tags">${chips}</p>`;
}

/** `|a|b|` — the pipes let the filter match a whole tag, not a substring of one. */
function tagsAttr(tags: string[]): string {
  return tags.length > 0 ? `|${tags.join("|")}|` : "";
}

function rowHtml(post: PageSummary, urlPrefix: string): string {
  const href = `${urlPrefix}/posts/${escapeHtml(post.slug)}`;
  return `<article class="post-preview" data-post-item data-tags="${escapeHtml(tagsAttr(post.tags))}">
<time class="post-date" datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
<h2 class="post-title"><a href="${href}">${escapeHtml(post.title)}</a></h2>
<p class="post-excerpt">${escapeHtml(post.excerpt)}</p>
<a href="${href}" class="read-more">read more &rarr;</a>
</article>`;
}

function cardHtml(
  post: PageSummary,
  urlPrefix: string,
  mediaUrl?: (key: string) => string,
): string {
  const href = `${urlPrefix}/posts/${escapeHtml(post.slug)}`;
  const cover = coverUrl(post, mediaUrl);
  // A post without a cover drops the region entirely rather than showing an
  // empty frame — mixed card heights read as intentional, a grey box does not.
  const coverBlock = cover
    ? `<a class="post-card__cover" href="${href}" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(cover)}" alt="" loading="lazy"></a>`
    : "";
  return `<article class="post-preview post-card" data-post-item data-tags="${escapeHtml(tagsAttr(post.tags))}">
${coverBlock}
<div class="post-card__body">
${tagChipsHtml(post.tags)}
<h2 class="post-title"><a href="${href}">${escapeHtml(post.title)}</a></h2>
<time class="post-date" datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
<p class="post-excerpt">${escapeHtml(post.excerpt)}</p>
</div>
</article>`;
}

/** Tags worth offering as filters: most-used first, ties broken alphabetically. */
function filterTags(posts: PageSummary[]): string[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_FILTER_CHIPS)
    .map(([tag]) => tag);
}

function filterHtml(posts: PageSummary[]): string {
  if (posts.length < FILTER_MIN_POSTS) return "";
  const tags = filterTags(posts);
  if (tags.length < 2) return "";

  const chips = tags
    .map(
      (tag) =>
        `<button type="button" class="post-chip" data-filter-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`,
    )
    .join("");

  return `<div class="post-filter" data-post-filter>
<span class="post-filter__label">Filter</span>
<button type="button" class="post-chip post-chip--active" data-filter-tag="">All</button>
${chips}
</div>`;
}

function loadMoreHtml(total: number): string {
  if (total <= PAGE_SIZE) return "";
  return `<div class="post-list__more" data-post-more>
<button type="button" class="site-button site-button--ghost" data-post-more-button>Load more</button>
<p class="post-list__count">Showing <span data-post-shown>${PAGE_SIZE}</span> of <span data-post-total>${total}</span></p>
</div>`;
}

/**
 * Without JavaScript nothing can reveal the posts the load-more control hides,
 * so a reader would silently lose everything past the first page. Undo both
 * halves rather than shipping a button that does nothing.
 */
const NOSCRIPT_FALLBACK = `<noscript><style>[data-post-item][hidden]{display:revert}[data-post-more]{display:none}</style></noscript>`;

function emptyStateHtml(options: PostListRenderOptions): string {
  const noun = options.spaceNoun ?? "blog";
  const name = options.siteName?.trim();

  if (options.isOwner) {
    const compose = options.composeHref
      ? `<a class="site-button" href="${escapeHtml(options.composeHref)}">Write your first post</a>`
      : "";
    const manifesto = options.manifestoHref
      ? `<a class="site-button site-button--ghost" href="${escapeHtml(options.manifestoHref)}">Read the manifesto</a>`
      : "";
    const actions = compose || manifesto ? `<div class="site-empty__actions">${compose}${manifesto}</div>` : "";

    return `<section class="content-view site-empty site-empty--owner">
<p class="site-empty__eyebrow">Nothing published yet</p>
<h2 class="site-empty__headline">A blank page, <em>entirely yours.</em></h2>
<p class="site-empty__body">Write something and it becomes a real page in seconds. No feed to feed, no algorithm to please &mdash; just your work, in your order.</p>
${actions}
<div class="site-empty__note">
<span class="site-empty__pill">Only you</span>
<p>Visitors see a short, tidy welcome until you publish &mdash; never a &ldquo;coming soon&rdquo; or an empty error.</p>
</div>
</section>`;
  }

  const who = name ? escapeHtml(name) : `This ${escapeHtml(noun)}`;
  const feed = options.feedHref
    ? `<a href="${escapeHtml(options.feedHref)}">Follow via RSS &rarr;</a>`
    : "";
  const affordance = `<p class="site-empty__affordance">${feed}<span>${feed ? "or check back later" : "Check back later"}</span></p>`;

  return `<section class="content-view site-empty site-empty--visitor">
<p class="site-empty__eyebrow">A quiet ${escapeHtml(noun)}</p>
<h2 class="site-empty__headline">Nothing here <em>yet.</em></h2>
<p class="site-empty__body">${who} hasn&rsquo;t published anything. When they do, it shows up here &mdash; in their order, with no feed and no algorithm deciding what you see.</p>
${affordance}
</section>`;
}

/** Render a list of posts as HTML (used by {{collection:slug}} embeds). */
export function renderPostListView(
  posts: PageSummary[],
  options: PostListRenderOptions = {},
): string {
  if (posts.length === 0) return emptyStateHtml(options);

  const urlPrefix = options.urlPrefix ?? "";
  const variant = resolveVariant(options.variant ?? "auto", posts.length);

  const items = posts
    .map((post, index) => {
      const html =
        variant === "card" ? cardHtml(post, urlPrefix, options.mediaUrl) : rowHtml(post, urlPrefix);
      return index < PAGE_SIZE ? html : html.replace("<article ", "<article hidden ");
    })
    .join("\n");

  const more = loadMoreHtml(posts.length);

  return `<section class="content-view content-view-post-list post-list post-list--${variant}" data-post-list>
${filterHtml(posts)}
<div class="post-list__items">
${items}
</div>
${more}
${more ? NOSCRIPT_FALLBACK : ""}
</section>`;
}
