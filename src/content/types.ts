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

export interface PageNav {
  label: string; // Display text in the navigation bar
  order: number; // Sort position (0 = leftmost)
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
}

/** Lightweight summary for post listings on the home page. */
export interface PageSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  date: string;
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
  urlPrefix?: string;
  siteName?: string;
  siteTagline?: string;
}

/**
 * A function that wraps page content in a full HTML document.
 * The blog provides a default; the platform can supply its own.
 */
export type LayoutFn = (options: LayoutOptions, content: string) => string;
