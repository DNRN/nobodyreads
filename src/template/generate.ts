import type { ComponentMap, SiteTemplateDefinition } from "./types.js";
import { generateTokenCss } from "./tokens.js";
import {
  componentRegistry,
  generateComponentTokenCss,
} from "./registry.js";
import { generateSectionHtml } from "./sections.js";
import { normalizeComponents } from "./theme-io.js";

function resolveVariant(
  componentName: string,
  defaultVariant: string,
  components: ComponentMap,
): string {
  return components[componentName]?.variant ?? defaultVariant;
}

export function generateCss(def: SiteTemplateDefinition): string {
  const components = normalizeComponents(def.components);
  const parts: string[] = [
    generateTokenCss(def.tokens.light, def.tokens.dark),
  ];

  for (const component of componentRegistry) {
    const variant = resolveVariant(
      component.name,
      component.defaultVariant,
      components,
    );
    parts.push(component.css(variant));

    const tokenOverrides = components[component.name]?.tokens;
    if (tokenOverrides && Object.keys(tokenOverrides).length > 0) {
      const tokenCss = generateComponentTokenCss(component, tokenOverrides);
      if (tokenCss) {
        parts.push(tokenCss);
      }
    }
  }

  const postMetaCss = generatePostMetaCss(def.postMeta);
  if (postMetaCss) {
    parts.push(postMetaCss);
  }

  if (def.customCss) {
    parts.push(def.customCss);
  }

  return parts.join("\n\n");
}

/**
 * Hide the supporting details a listing has been told not to show.
 *
 * Expressed as CSS rather than threaded through the post-list renderer: the
 * markup is the same either way, and a theme that omits `postMeta` emits
 * nothing at all, so nothing changes for a site stored before this existed.
 */
function generatePostMetaCss(postMeta: SiteTemplateDefinition["postMeta"]): string {
  if (!postMeta) return "";

  const hidden: string[] = [];
  if (postMeta.date === false) hidden.push(".post-preview .post-date");
  if (postMeta.excerpt === false) hidden.push(".post-preview .post-excerpt");
  if (postMeta.readMore === false) hidden.push(".post-preview .read-more");
  if (postMeta.tags === false) hidden.push(".post-preview .post-tags");
  if (hidden.length === 0) return "";

  return `/* Post details switched off in Design → Layout. */\n${hidden.join(",\n")} {\n  display: none;\n}`;
}

export function generateHtml(def: SiteTemplateDefinition): string {
  if (def.layoutHtml) {
    return def.layoutHtml;
  }
  return def.sections
    .filter((s) => s.enabled)
    .map((section) => generateSectionHtml(section, def.sections))
    .join("\n\n");
}
