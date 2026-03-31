export function responsiveCss(): string {
  return `@media (max-width: 480px) {
  html {
    font-size: 16px;
  }

  .site-header {
    padding: 1.5rem 0 1.75rem;
  }

  .hero-title {
    font-size: 2rem;
  }

  .post-header .post-title {
    font-size: 1.35rem;
  }

  .platform-features {
    grid-template-columns: 1fr;
  }

  .platform-hero h2 {
    font-size: 1.4rem;
  }

  .hero-cta {
    flex-direction: column;
    align-items: flex-start;
  }

  .platform-cta {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (min-width: 640px) {
  :root {
    --max-width: 820px;
  }

  .hero-title {
    font-size: 2.9rem;
  }

  .platform-steps ol {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 960px) {
  :root {
    --max-width: 980px;
  }

  .site-header {
    padding: 2.5rem 0 3rem;
  }

  .hero-title {
    font-size: 3.2rem;
  }
}

@media (max-width: 920px) {
  .hero-technical-inner {
    grid-template-columns: 1fr;
  }

  .manifesto-grid {
    grid-template-columns: 1fr;
  }

  .platform-features {
    grid-template-columns: repeat(2, 1fr);
  }
}`;
}
