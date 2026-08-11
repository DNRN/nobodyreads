import type { Page, PageMeta, FaqItem, LayoutOptions } from "../content/types.js";
import { escapeHtml } from "./http.js";
import { firstImageUrl } from "./image-markdown.js";
import { resolveSiteUrl, resolveSiteName } from "./site-url.js";

/**
 * The social share image for a page: an explicit `seo.ogImage` always wins
 * (so authors can pick whatever they like), otherwise fall back to the first
 * image embedded in the post body, and finally the site-wide default.
 */
/**
 * Pick the social share image: an explicit `seo.ogImage`, else the first image
 * in the body, else the site default.
 *
 * **`options.page` must already be redacted.** This function deliberately knows
 * nothing about paywalls — it reads `page.content` at face value. That is safe
 * because every caller passes the page returned by `getReadableContent`, whose
 * `content` is the teaser for a gated reader. Hand it a raw page and an image
 * from below the paywall becomes the `og:image` of a post nobody has paid for.
 *
 * Teaching this function about access tiers was the alternative, and it would
 * have made every future consumer of `Page` one more place to remember. See
 * `payments/access.ts`.
 */
function resolveOgImage(options: LayoutOptions): string | undefined {
  return (
    options.seo?.ogImage ||
    (options.page?.content ? firstImageUrl(options.page.content) : undefined) ||
    options.defaultOgImage
  );
}

export function buildMetaTags(options: LayoutOptions): string {
  const lines: string[] = [];
  const seo = options.seo;
  const siteUrl = resolveSiteUrl(options.siteUrl);
  const description = seo?.metaDescription || options.description || "";
  const canonicalUrl =
    seo?.canonicalUrl || (options.pathname ? `${siteUrl}${options.pathname}` : "");

  // Meta description
  if (description) {
    lines.push(`  <meta name="description" content="${escapeHtml(description)}">`);
  }

  // Robots directives (SEO + AI training control)
  const robotsDirectives: string[] = [];
  if (seo?.noIndex) robotsDirectives.push("noindex");
  if (seo?.noFollow) robotsDirectives.push("nofollow");
  if (seo?.noAiTraining) {
    robotsDirectives.push("noai", "noimageai");
  }
  if (robotsDirectives.length > 0) {
    lines.push(
      `  <meta name="robots" content="${robotsDirectives.join(", ")}">`
    );
  }

  // Canonical URL
  if (canonicalUrl) {
    lines.push(`  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">`);
  }

  // Social image: page-level override, else first in-post image, else site-wide default.
  const ogImage = resolveOgImage(options);

  // Open Graph tags
  lines.push(`  <meta property="og:site_name" content="${escapeHtml(resolveSiteName(options.siteName))}">`);
  lines.push(
    `  <meta property="og:type" content="${escapeHtml(seo?.ogType || options.ogType || "website")}">`
  );
  lines.push(`  <meta property="og:title" content="${escapeHtml(options.title)}">`);
  if (description) {
    lines.push(
      `  <meta property="og:description" content="${escapeHtml(description)}">`
    );
  }
  if (canonicalUrl) {
    lines.push(`  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">`);
  }
  if (ogImage) {
    const imgUrl = ogImage.startsWith("http")
      ? ogImage
      : `${siteUrl}${ogImage}`;
    lines.push(`  <meta property="og:image" content="${escapeHtml(imgUrl)}">`);
  }

  // Twitter Card tags
  const twitterCard = seo?.twitterCard || "summary";
  lines.push(`  <meta name="twitter:card" content="${twitterCard}">`);
  lines.push(`  <meta name="twitter:title" content="${escapeHtml(options.title)}">`);
  if (description) {
    lines.push(
      `  <meta name="twitter:description" content="${escapeHtml(description)}">`
    );
  }
  if (ogImage) {
    const imgUrl = ogImage.startsWith("http")
      ? ogImage
      : `${siteUrl}${ogImage}`;
    lines.push(`  <meta name="twitter:image" content="${escapeHtml(imgUrl)}">`);
  }

  // GEO: Author attribution for generative AI citations
  if (seo?.authorName) {
    lines.push(`  <meta name="author" content="${escapeHtml(seo.authorName)}">`);
  }
  if (seo?.authorExpertise) {
    lines.push(
      `  <meta name="expertise" content="${escapeHtml(seo.authorExpertise)}">`
    );
  }

  // AEO: TLDR for answer engines / featured snippets
  if (seo?.tldr) {
    lines.push(
      `  <meta name="abstract" content="${escapeHtml(seo.tldr)}">`
    );
  }

  return lines.join("\n");
}

export function buildStructuredData(options: LayoutOptions): string {
  const chunks: string[] = [];
  const siteUrl = resolveSiteUrl(options.siteUrl);

  // Article / BlogPosting structured data (for posts)
  if (options.page && options.page.kind === "post") {
    const page = options.page;
    const seo = page.seo;
    const prefix = options.urlPrefix || "";
    const url = `${siteUrl}${prefix}/posts/${page.slug}`;

    const article: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: page.title,
      description: seo?.metaDescription || page.excerpt,
      datePublished: page.date,
      url,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      publisher: {
        "@type": "Organization",
        name: resolveSiteName(options.siteName),
        url: siteUrl,
      },
    };

    if (page.updated) article.dateModified = page.updated;
    if (page.tags.length > 0) article.keywords = page.tags.join(", ");
    const ogImage = resolveOgImage(options);
    if (ogImage) {
      article.image = ogImage.startsWith("http") ? ogImage : `${siteUrl}${ogImage}`;
    }

    // GEO: Author with expertise for AI citation quality
    if (seo?.authorName) {
      const author: Record<string, string> = {
        "@type": "Person",
        name: seo.authorName,
      };
      if (seo.authorExpertise) author.description = seo.authorExpertise;
      article.author = author;
    }

    // GEO: Citations as referenced sources
    if (seo?.citations && seo.citations.length > 0) {
      article.citation = seo.citations.map((c) => ({
        "@type": "CreativeWork",
        url: c,
      }));
    }

    // AEO: TLDR as article abstract
    if (seo?.tldr) {
      article.abstract = seo.tldr;
    }

    chunks.push(
      `  <script type="application/ld+json">${JSON.stringify(article)}</script>`
    );
  }

  // AEO: FAQ structured data (for any page kind)
  const faq = options.seo?.faq;
  if (faq && faq.length > 0) {
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item: FaqItem) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    };
    chunks.push(
      `  <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`
    );
  }

  return chunks.join("\n");
}

/** Build nav link hrefs from NavItem for use in both layouts. */
export function navHref(item: { kind: string; slug: string }, urlPrefix: string = ""): string {
  if (item.kind === "home") return urlPrefix || "/";
  if (item.kind === "post") return `${urlPrefix}/posts/${item.slug}`;
  return `${urlPrefix}/${item.slug}`;
}
