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

  if (def.customCss) {
    parts.push(def.customCss);
  }

  return parts.join("\n\n");
}

export function generateHtml(def: SiteTemplateDefinition): string {
  if (def.layoutHtml) {
    return def.layoutHtml;
  }
  return def.sections
    .filter((s) => s.enabled)
    .map((section) => generateSectionHtml(section))
    .join("\n\n");
}
