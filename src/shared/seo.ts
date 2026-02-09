import type { Page, PageMeta, FaqItem, LayoutOptions } from "../content/types.js";
import { escapeHtml } from "./http.js";

const SITE_URL = process.env.SITE_URL || "http://localhost:3000";
const SITE_NAME = process.env.SITE_NAME || "nobodyreads.me";

export function buildMetaTags(options: LayoutOptions): string {
  const lines: string[] = [];
  const seo = options.seo;
  const description = seo?.metaDescription || options.description || "";
  const canonicalUrl =
    seo?.canonicalUrl || (options.pathname ? `${SITE_URL}${options.pathname}` : "");

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

  // Open Graph tags
  lines.push(`  <meta property="og:site_name" content="${escapeHtml(options.siteName || SITE_NAME)}">`);
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
  if (seo?.ogImage) {
    const imgUrl = seo.ogImage.startsWith("http")
      ? seo.ogImage
      : `${SITE_URL}${seo.ogImage}`;
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
  if (seo?.ogImage) {
    const imgUrl = seo.ogImage.startsWith("http")
      ? seo.ogImage
      : `${SITE_URL}${seo.ogImage}`;
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

  // Article / BlogPosting structured data (for posts)
  if (options.page && options.page.kind === "post") {
    const page = options.page;
    const seo = page.seo;
    const prefix = options.urlPrefix || "";
    const url = `${SITE_URL}${prefix}/posts/${page.slug}`;

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
        name: options.siteName || SITE_NAME,
        url: SITE_URL,
      },
    };

    if (page.updated) article.dateModified = page.updated;
    if (page.tags.length > 0) article.keywords = page.tags.join(", ");
    if (seo?.ogImage) {
      article.image = seo.ogImage.startsWith("http")
        ? seo.ogImage
        : `${SITE_URL}${seo.ogImage}`;
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
