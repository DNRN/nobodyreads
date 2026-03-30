import type { PageSummary } from "./types.js";
import { escapeHtml } from "../shared/http.js";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function renderPostPreview(post: PageSummary, urlPrefix: string = ""): string {
  const href = `${urlPrefix}/posts/${escapeHtml(post.slug)}`;
  return `<article class="post-preview">
<time class="post-date" datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
<h2 class="post-title"><a href="${href}">${escapeHtml(post.title)}</a></h2>
<p class="post-excerpt">${escapeHtml(post.excerpt)}</p>
<a href="${href}" class="read-more">read more &rarr;</a>
</article>`;
}

/** Render a list of posts as HTML (used by {{view:slug}} content views). */
export function renderPostListView(posts: PageSummary[], urlPrefix: string = ""): string {
  if (posts.length === 0) return "";
  const items = posts.map((post) => renderPostPreview(post, urlPrefix)).join("\n");
  return `<section class="content-view content-view-post-list">
${items}
</section>`;
}
