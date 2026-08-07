import type {
  HeaderSectionConfig,
  FooterSectionConfig,
  SectionConfig,
} from "./types.js";

function wordmarkHtml(
  size: "md" | "xl",
  logoText: string,
  dotText: string,
): string {
  // A blog called "Field Notes" has no second half — without a dot suffix the
  // dot itself is punctuation with nothing after it, so drop both.
  const suffix = dotText
    ? `<span class="dot" aria-hidden="true">.</span><span class="me">${dotText}</span>`
    : "";
  return `<span class="wordmark wordmark--${size}">${logoText}${suffix}</span>`;
}

function headerSectionHtml(config: HeaderSectionConfig): string {
  const wm = wordmarkHtml("md", config.logoText, config.logoDotText);

  let html = `<header class="site-header">
  <div class="container">
    <div class="nav-bar">
      <a class="site-logo" href="{{brandHref}}">${wm}</a>
      <nav class="site-nav-inline" aria-label="Main">{{nav}}</nav>
      {{communityBlock}}
      <div class="nav-actions">{{navToggle}}{{authLinksBlock}}</div>
    </div>`;

  html += `\n  </div>\n</header>`;

  // Outside the <header>, so the header's rule sits under the nav rather than
  // under the hero. Filled in by the layout, which is the only thing that knows
  // whether this request is for the site's front page — the hero identifies the
  // site and has nothing to add above an article with its own title.
  if (config.showHero) {
    html += `\n{{hero}}`;
  }

  return html;
}

function contentSectionHtml(): string {
  return `<main class="container">\n  {{content}}\n</main>`;
}

function footerSectionHtml(
  config: FooterSectionConfig,
  brand: WordmarkText,
): string {
  let inner = `&copy; {{year}}`;
  if (config.showWordmark) {
    inner += ` ${wordmarkHtml(
      "md",
      config.logoText ?? brand.logoText,
      config.logoDotText ?? brand.logoDotText,
    )}`;
  }

  return `<footer class="site-footer">
  <div class="container">
    <p>${inner}</p>
  </div>
</footer>`;
}

interface WordmarkText {
  logoText: string;
  logoDotText: string;
}

/**
 * What the footer falls back to when there is no header section to copy.
 * The site's own name — never this package's.
 */
const FALLBACK_WORDMARK: WordmarkText = {
  logoText: "{{siteName}}",
  logoDotText: "",
};

export function generateSectionHtml(
  section: SectionConfig,
  sections: SectionConfig[] = [],
): string {
  switch (section.type) {
    case "header":
      return headerSectionHtml(section);
    case "content":
      return contentSectionHtml();
    case "footer":
      return footerSectionHtml(section, headerWordmark(sections));
  }
}

/**
 * The site's wordmark, as configured on its header section.
 *
 * The footer takes its wordmark from the header rather than carrying a second
 * copy, so renaming a site in one place renames it everywhere.
 */
function headerWordmark(sections: SectionConfig[]): WordmarkText {
  const header = sections.find((s): s is HeaderSectionConfig => s.type === "header");
  return header
    ? { logoText: header.logoText, logoDotText: header.logoDotText }
    : FALLBACK_WORDMARK;
}
