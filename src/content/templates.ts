import type { Page, PageSummary, NavItem, LayoutOptions, LayoutFn } from "./types.js";
import { escapeHtml } from "../shared/http.js";
import { buildMetaTags, buildStructuredData, navHref } from "../shared/seo.js";

const IS_DEV = process.env.NODE_ENV !== "production";
const SITE_NAME = process.env.SITE_NAME || "nobodyreads.me";

/** Wordmark HTML: "nobody_reads.me" with .me in accent (for logo/hero). */
function wordmarkHtml(size: "md" | "xl"): string {
  const sizeClass = size === "xl" ? "wordmark--xl" : "wordmark--md";
  return `<span class="wordmark ${sizeClass}">nobody_reads<span class="dot" aria-hidden="true">.</span><span class="me">me</span></span>`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Build the public URL path for a page, optionally prefixed. */
function pagePath(
  page: { kind: string; slug: string },
  urlPrefix: string = ""
): string {
  if (page.kind === "home") return urlPrefix || "/";
  if (page.kind === "post") return `${urlPrefix}/posts/${page.slug}`;
  return `${urlPrefix}/${page.slug}`;
}

// --- Default blog layout ---

/** Build nav-actions block (menu toggle only). Theme is set in Settings > Appearance. */
function buildNavActions(showMenu: boolean): string {
  if (!showMenu) return "";
  return `          <button
            class="nav-toggle"
            type="button"
            data-nav-toggle
            aria-label="Toggle menu"
            aria-controls="site-menu"
            aria-expanded="false"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>`;
}

/** The standard blog layout. Used by single-tenant and tenant blogs. */
export const defaultLayout: LayoutFn = (options, content) => {
  return buildBlogLayoutHtml(options, content, undefined);
};

/**
 * Blog layout with auth links in the nav (for when the viewer is the blog owner).
 * Use when session exists and session.id === tenant.id.
 */
export function createBlogLayoutWithAuth(authLinks: string): LayoutFn {
  return (options, content) => buildBlogLayoutHtml(options, content, authLinks);
}

function buildBlogLayoutHtml(
  options: LayoutOptions,
  content: string,
  authLinks?: string
): string {
  const { title, navItems, activePageId, scripts, urlPrefix = "" } = options;
  const siteName = options.siteName || SITE_NAME;
  const siteTagline =
    options.siteTagline ?? "Another simple blog engine. For writing mostly to yourself.";
  const homeHref = urlPrefix || "/";

  const scriptTags = (scripts ?? [])
    .map((s) => `  <script type="module" src="${escapeHtml(s)}"></script>`)
    .join("\n");

  const devReload = IS_DEV
    ? `  <script>new EventSource("/__reload").onmessage = e => { if (e.data === "reload") location.reload(); };</script>`
    : "";

  const metaTags = buildMetaTags(options);
  const structuredData = buildStructuredData(options);

  const navLinks = navItems
    .map((item) => {
      const href = navHref(item, urlPrefix);
      const active = item.id === activePageId ? ' class="active"' : "";
      return `        <a href="${escapeHtml(href)}"${active}>${escapeHtml(item.label)}</a>`;
    })
    .join("\n");

  const navActions = buildNavActions(Boolean(authLinks));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <script>
    (function () {
      try {
        const stored = localStorage.getItem("theme");
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const theme = (stored === "system" || !stored) ? (prefersDark ? "dark" : "light") : (stored === "dark" || stored === "light" ? stored : (prefersDark ? "dark" : "light"));
        document.documentElement.dataset.theme = theme;
      } catch {
        document.documentElement.dataset.theme = "light";
      }
    })();
  </script>
${metaTags}
${structuredData}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <link rel="stylesheet" href="/style.css">
${scriptTags}
${devReload}
</head>
<body>

  <header class="site-header">
    <div class="container">
      <div class="nav-bar">
        <a class="site-logo" href="${escapeHtml(homeHref)}">${wordmarkHtml("md")}</a>
        <nav class="site-nav-inline" aria-label="Main">
${navLinks}
        </nav>
        ${
          authLinks
            ? `<nav class="site-menu" id="site-menu" data-nav aria-label="Profile">
          <span class="nav-auth nav-auth--menu">${authLinks}</span>
        </nav>`
            : ""
        }
        <div class="nav-actions">
${navActions}
        </div>
      </div>
      <div class="site-hero">
        <h1 class="hero-title">${wordmarkHtml("xl")}</h1>
        <p class="hero-tagline">${siteTagline}</p>
      </div>
    </div>
  </header>

  <main class="container">
${content}
  </main>

  <footer class="site-footer">
    <div class="container">
      <p>&copy; ${new Date().getFullYear()} ${wordmarkHtml("md")}</p>
    </div>
  </footer>

  <script src="/site.js" defer></script>
</body>
</html>`;
}

// --- Blog page renderers ---

function renderPostPreview(post: PageSummary, urlPrefix: string = ""): string {
  const href = `${urlPrefix}/posts/${escapeHtml(post.slug)}`;
  return `
    <article class="post-preview">
      <time class="post-date" datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
      <h2 class="post-title"><a href="${href}">${escapeHtml(post.title)}</a></h2>
      <p class="post-excerpt">${escapeHtml(post.excerpt)}</p>
      <a href="${href}" class="read-more">read more &rarr;</a>
    </article>`;
}

/**
 * Home page: optional markdown content above the post listing.
 * The Page's content is rendered as HTML and placed before the list.
 */
export function homePage(
  layout: LayoutFn,
  page: Page,
  posts: PageSummary[],
  navItems: NavItem[],
  htmlBody?: string,
  urlPrefix: string = ""
): string {
  const intro = htmlBody
    ? `    <div class="home-intro">\n${htmlBody}\n    </div>\n`
    : "";

  const listing =
    posts.length > 0
      ? posts.map((p) => renderPostPreview(p, urlPrefix)).join("\n")
      : `<p>No posts yet.</p>`;

  const content = `${intro}${listing}`;

  return layout(
    {
      title: page.title || SITE_NAME,
      navItems,
      activePageId: page.id,
      description: page.seo?.metaDescription || page.excerpt,
      pathname: urlPrefix || "/",
      ogType: "website",
      seo: page.seo,
      page,
      urlPrefix,
    },
    content
  );
}

/**
 * Generic content page (about, uses, etc.) — renders markdown body.
 */
export function contentPage(
  layout: LayoutFn,
  page: Page,
  htmlBody: string,
  navItems: NavItem[],
  urlPrefix: string = ""
): string {
  const homeHref = urlPrefix || "/";
  const content = `
    <div class="post-header">
      <h2 class="post-title">${escapeHtml(page.title)}</h2>
    </div>
    <div class="page-body">
${htmlBody}
    </div>
    <a href="${escapeHtml(homeHref)}" class="back-link">&larr; back to home</a>`;

  const path = pagePath(page, urlPrefix);

  return layout(
    {
      title: `${page.title} \u2014 ${SITE_NAME}`,
      navItems,
      activePageId: page.id,
      scripts: page.scripts,
      description: page.seo?.metaDescription || page.excerpt,
      pathname: path,
      seo: page.seo,
      page,
      urlPrefix,
    },
    content
  );
}

/**
 * Blog post page — renders markdown body with date and back-link.
 */
export function postPage(
  layout: LayoutFn,
  page: Page,
  htmlBody: string,
  navItems: NavItem[],
  urlPrefix: string = ""
): string {
  const homeHref = urlPrefix || "/";
  const content = `
    <div class="post-header">
      <time class="post-date" datetime="${escapeHtml(page.date)}">${formatDate(page.date)}</time>
      <h2 class="post-title">${escapeHtml(page.title)}</h2>
    </div>
    <div class="post-body">
${htmlBody}
    </div>
    <a href="${escapeHtml(homeHref)}" class="back-link">&larr; back to all posts</a>`;

  return layout(
    {
      title: `${page.title} \u2014 ${SITE_NAME}`,
      navItems,
      activePageId: page.id,
      scripts: page.scripts,
      description: page.seo?.metaDescription || page.excerpt,
      pathname: `${urlPrefix}/posts/${page.slug}`,
      ogType: "article",
      seo: page.seo,
      page,
      urlPrefix,
    },
    content
  );
}

/** 404 page. */
export function notFoundPage(
  layout: LayoutFn,
  navItems: NavItem[],
  urlPrefix: string = ""
): string {
  const homeHref = urlPrefix || "/";
  const content = `
    <div class="post-header">
      <h2 class="post-title">Not found</h2>
    </div>
    <p>There's nothing here.</p>
    <a href="${escapeHtml(homeHref)}" class="back-link">&larr; back to home</a>`;

  return layout(
    {
      title: `404 \u2014 ${SITE_NAME}`,
      navItems,
      seo: { noIndex: true },
      urlPrefix,
    },
    content
  );
}
