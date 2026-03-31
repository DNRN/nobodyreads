import type { SiteTemplateDefinition } from "./types.js";
import { generateTokenCss } from "./tokens.js";
import {
  baseCss,
  wordmarkCss,
  headerCss,
  navCss,
  heroCss,
  postPreviewCss,
  postBodyCss,
  pageBodyCss,
  footerCss,
  platformCss,
  responsiveCss,
} from "./components/index.js";
import { generateSectionHtml } from "./sections.js";

export function generateCss(def: SiteTemplateDefinition): string {
  const parts: string[] = [
    generateTokenCss(def.tokens.light, def.tokens.dark),
    baseCss(),
    wordmarkCss(),
    headerCss(),
    navCss(),
    heroCss(),
    postPreviewCss(),
    postBodyCss(),
    pageBodyCss(),
    footerCss(),
    platformCss(),
    responsiveCss(),
  ];

  if (def.customCss) {
    parts.push(def.customCss);
  }

  return parts.join("\n\n");
}

export function generateHtml(def: SiteTemplateDefinition): string {
  return def.sections
    .filter((s) => s.enabled)
    .map((section) => generateSectionHtml(section))
    .join("\n\n");
}
