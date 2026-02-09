export const DEFAULT_SITE_TEMPLATE = `
<header class="site-header">
  <div class="container">
    <div class="nav-bar">
      <a class="site-logo" href="{{homeHref}}">
        <span class="wordmark wordmark--md">
          nobody_reads<span class="dot" aria-hidden="true">.</span><span class="me">me</span>
        </span>
      </a>
      <nav class="site-nav-inline" aria-label="Main">
        {{nav}}
      </nav>
      {{authLinksBlock}}
      <div class="nav-actions">
        {{navToggle}}
      </div>
    </div>
    <div class="site-hero">
      <h1 class="hero-title">
        <span class="wordmark wordmark--xl">
          nobody_reads<span class="dot" aria-hidden="true">.</span><span class="me">me</span>
        </span>
      </h1>
      <p class="hero-tagline">{{siteTagline}}</p>
    </div>
  </div>
</header>

<main class="container">
  {{content}}
</main>

<footer class="site-footer">
  <div class="container">
    <p>
      &copy; {{year}}
      <span class="wordmark wordmark--md">
        nobody_reads<span class="dot" aria-hidden="true">.</span><span class="me">me</span>
      </span>
    </p>
  </div>
</footer>

<script src="/site.js" defer></script>
`;
