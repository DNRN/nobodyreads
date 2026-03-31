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
  return `<span class="wordmark wordmark--${size}">${logoText}<span class="dot" aria-hidden="true">.</span><span class="me">${dotText}</span></span>`;
}

function headerSectionHtml(config: HeaderSectionConfig): string {
  const wm = wordmarkHtml("md", config.logoText, config.logoDotText);

  let html = `<header class="site-header">
  <div class="container">
    <div class="nav-bar">
      <a class="site-logo" href="{{homeHref}}">${wm}</a>
      <nav class="site-nav-inline" aria-label="Main">{{nav}}</nav>
      {{authLinksBlock}}
      <div class="nav-actions">{{navToggle}}</div>
    </div>`;

  if (config.showHero) {
    const wmXl = wordmarkHtml("xl", config.logoText, config.logoDotText);
    html += `\n    <div class="site-hero">
      <h1 class="hero-title">${wmXl}</h1>`;
    if (config.showTagline) {
      html += `\n      <p class="hero-tagline">{{siteTagline}}</p>`;
    }
    html += `\n    </div>`;
  }

  html += `\n  </div>\n</header>`;
  return html;
}

function contentSectionHtml(): string {
  return `<main class="container">\n  {{content}}\n</main>`;
}

function footerSectionHtml(config: FooterSectionConfig): string {
  let inner = `&copy; {{year}}`;
  if (config.showWordmark) {
    inner += ` <span class="wordmark wordmark--md">nobody_reads<span class="dot" aria-hidden="true">.</span><span class="me">me</span></span>`;
  }

  return `<footer class="site-footer">
  <div class="container">
    <p>${inner}</p>
  </div>
</footer>`;
}

export function generateSectionHtml(section: SectionConfig): string {
  switch (section.type) {
    case "header":
      return headerSectionHtml(section);
    case "content":
      return contentSectionHtml();
    case "footer":
      return footerSectionHtml(section);
  }
}
