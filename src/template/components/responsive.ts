import { defineComponent } from "../component-definition.js";

const BASE_CSS = `@media (max-width: 720px) {
  :root {
    --container-padding: 1.5rem;
  }

  .site-hero {
    padding-top: 1.75rem;
  }

  .hero-title {
    font-size: 1.85rem;
  }

  main {
    padding-block: 1.75rem 2.5rem;
  }

  .site-empty {
    padding-top: 1.75rem;
  }
}

@media (max-width: 480px) {
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
  .platform-steps ol {
    grid-template-columns: repeat(2, 1fr);
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

export const responsiveComponent = defineComponent({
  name: "responsive",
  label: "Responsive rules",
  defaultVariant: "default",
  tokens: [],
  variants: {
    default: { label: "Default", css: "" },
  },
  baseCss: BASE_CSS,
});

/** @deprecated Use responsiveComponent.css() via the registry */
export function responsiveCss(): string {
  return responsiveComponent.css("default");
}
