// --- Content types ---

export interface FaqItem {
  question: string;
  answer: string;
}

export interface PageMeta {
  // --- SEO: Search Engine Optimization ---
  metaDescription?: string; // Custom meta description (falls back to excerpt)
  canonicalUrl?: string; // Override canonical URL
  ogImage?: string; // Open Graph / social share image
  ogType?: string; // Open Graph type (default: "article")
  twitterCard?: "summary" | "summary_large_image"; // Twitter card style
  noIndex?: boolean; // Prevent search engine indexing
  noFollow?: boolean; // Prevent following links on this page

  // --- GEO: Generative Engine Optimization ---
  authorName?: string; // Author name for AI citation attribution
  authorExpertise?: string; // Author credentials / domain expertise
  citations?: string[]; // Authoritative sources referenced in content

  // --- AEO: Answer Engine Optimization ---
  faq?: FaqItem[]; // FAQ structured data (Question + Answer pairs)
  tldr?: string; // Concise summary for featured snippets / answer boxes

  // --- AI Training Control ---
  noAiTraining?: boolean; // Block AI training crawlers from this page
}

export type PageKind = "home" | "page" | "post";

/**
 * How comments on a post are AI-moderated: inherit the space ruleset, use
 * custom rules attached to this post, or skip moderation entirely.
 */

export interface PageNav {
  label: string; // Display text in the navigation bar
  order: number; // Sort position (0 = leftmost)
}

export type ContentViewKind = "post_list" | "custom";

export interface PostListViewConfig {
  order: "newest";
  limit?: number;
}

export interface CustomViewConfig {
  /** SQL SELECT query. Use :tenant_id as a named parameter for tenant scoping. */
  query: string;
  /**
   * Markup in the collection template language (`collection-template.ts`):
   * literal HTML plus `{{field}}`, `{{#each rows}}`, `{{#if field}}` and a
   * fixed helper set. Nothing in it executes.
   */
  template: string;
}

export type ContentViewConfig = PostListViewConfig | CustomViewConfig;

export interface ContentView {
  id: string;
  slug: string;
  title: string;
  kind: ContentViewKind;
  config: ContentViewConfig;
  published: boolean;
  updated?: string;
}

export interface Page {
  id: string; // Stable identifier — never changes, used for [[id]] links
  slug: string; // URL path segment — can be renamed
  title: string;
  content: string; // Markdown body
  excerpt: string;
  tags: string[];
  date: string;
  updated?: string;
  published: boolean;
  scripts?: string[];
  seo?: PageMeta;
  kind: PageKind; // "home" | "page" | "post"
  nav?: PageNav; // If present, page appears in the top bar
  commentsEnabled: boolean; // Whether readers can comment on this post
  inFeed: boolean; // Whether this post appears in the RSS feed
  /**
   * How this page is gated: "public" | "members" | "paid".
   *
   * Typed as a plain string here, not the `AccessTier` union, so `content/`
   * keeps zero imports from `payments/`. That one-way dependency is what
   * guarantees a page query can never gate itself — see `payments/access.ts`.
   */
  accessTier: string;
  /** One-off purchase price in minor units. NULL/undefined = not sold separately. */
  priceAmount?: number | null;
}

/** An uploaded media file (image, video, audio, etc.). */
export interface Media {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  /** Public URL to access the file (computed, not stored). */
  url: string;
}

/** Lightweight summary for post listings on the home page. */
export interface PageSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  date: string;
  /** Drives the lock badge on listings. Never carries the body. */
  accessTier: string;
  /**
   * Thumbnail for the card listing — the post's social image, as a stored
   * media key or an absolute URL. A post is free not to have one; the card
   * simply drops its cover region.
   */
  coverImage?: string;
}

/** A resolved nav item for the top bar. */
export interface NavItem {
  id: string;
  slug: string;
  kind: PageKind;
  label: string;
  order: number;
}

/** Minimal info returned by link resolution. */
export interface LinkTarget {
  id: string;
  slug: string;
  kind: PageKind;
  title: string;
}

// --- Layout types ---

/** An entry in the topbar account dropdown. */
export interface MenuItem {
  label: string;
  href?: string; // Renders as a GET link
  action?: string; // Renders as a POST form button (e.g. "/logout")
  variant?: "default" | "danger";
}

/** Options passed to a layout function when rendering a page. */
export interface LayoutOptions {
  title: string;
  navItems: NavItem[];
  activePageId?: string;
  scripts?: string[];

  // SEO / GEO / AEO context
  description?: string;
  pathname?: string;
  ogType?: string;
  seo?: PageMeta;
  page?: Page;

  // Multi-tenant support
  /** Tenant whose settings/template the layout should load. Defaults to the single-tenant id. */
  tenantId?: string;
  urlPrefix?: string;
  /**
   * Absolute origin the page's canonical, `og:url` and JSON-LD URLs are built
   * from, e.g. `https://example.com`. Defaults to `SITE_URL`. A host serving
   * several sites from one process must pass this per request — the
   * environment can only name one of them.
   */
  siteUrl?: string;
  /** Target for the topbar brand/wordmark link. Defaults to the per-context home (`urlPrefix || "/"`). */
  brandHref?: string;
  /** Login target for the community widget (e.g. join button). Defaults to `${urlPrefix}/login`. */
  loginHref?: string;
  /**
   * Base path for the JSON API the community widget calls. Defaults to
   * `${urlPrefix}/api`, which is only right where links and API share a prefix.
   */
  apiBase?: string;
  /**
   * Whether this page is the site's front page, which is the only place the
   * hero belongs. Stated rather than inferred from the URL: a host that
   * rewrites its routes makes the URL a lie.
   */
  isHome?: boolean;
  siteName?: string;
  siteTagline?: string;
  /** Site-wide default social image, used when a page has no `seo.ogImage`. */
  defaultOgImage?: string;

  // Hero
  /** Small line above the site name in the hero — typically the site's URL. */
  heroEyebrow?: string;
  /**
   * Meta line under the name, e.g. "24 posts · since 2024". Supplying one
   * switches the hero to its compact form, where the archive below leads and
   * the tagline steps aside.
   */
  heroMeta?: string;
  /** Show the avatar/monogram beside the name. */
  heroMonogram?: boolean;

  // Topbar account dropdown
  /** Items rendered in the topbar account dropdown. When non-empty, the menu trigger shows. */
  menuItems?: MenuItem[];
  /** Optional heading shown at the top of the dropdown (e.g. "@nickname"). */
  menuHeader?: string;
}

/**
 * A function that wraps page content in a full HTML document.
 * The blog provides a default; the platform can supply its own.
 */
export type LayoutFn = (options: LayoutOptions, content: string) => string;
