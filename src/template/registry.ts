import { baseComponent } from "./components/base.js";
import { wordmarkComponent } from "./components/wordmark.js";
import { headerComponent } from "./components/header.js";
import { navComponent } from "./components/nav.js";
import { heroComponent } from "./components/hero.js";
import { postPreviewComponent } from "./components/post-preview.js";
import { postBodyComponent } from "./components/post-body.js";
import { pageBodyComponent } from "./components/page-body.js";
import { footerComponent } from "./components/footer.js";
import { platformComponent } from "./components/platform.js";
import { responsiveComponent } from "./components/responsive.js";
import type { ComponentDefinition } from "./component-definition.js";

export type {
  ComponentTokenDef,
  ComponentVariantDef,
  ComponentDefinition,
  SerializableComponentDefinition,
} from "./component-definition.js";

export { defineComponent } from "./component-definition.js";

export const componentRegistry: ComponentDefinition[] = [
  baseComponent,
  wordmarkComponent,
  headerComponent,
  navComponent,
  heroComponent,
  postPreviewComponent,
  postBodyComponent,
  pageBodyComponent,
  footerComponent,
  platformComponent,
  responsiveComponent,
];

export function getComponentByName(name: string): ComponentDefinition | undefined {
  return componentRegistry.find((component) => component.name === name);
}

export function serializeRegistry(): import("./component-definition.js").SerializableComponentDefinition[] {
  return componentRegistry.map((component) => ({
    name: component.name,
    label: component.label,
    defaultVariant: component.defaultVariant,
    variants: Object.entries(component.variants).map(([id, variant]) => ({
      id,
      label: variant.label,
    })),
    tokens: component.tokens,
  }));
}

export function generateComponentTokenCss(
  component: ComponentDefinition,
  overrides: Record<string, string>,
): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(overrides)) {
    const tokenDef = component.tokens.find((token) => token.key === key);
    if (!tokenDef) continue;
    lines.push(`  ${tokenDef.cssVar}: ${value};`);
  }

  if (lines.length === 0) return "";
  return `:root {\n${lines.join("\n")}\n}`;
}

export function validateComponentsAgainstRegistry(
  components: Record<string, { variant?: string; tokens?: Record<string, string> }>,
): string | null {
  for (const [name, config] of Object.entries(components)) {
    const definition = getComponentByName(name);
    if (!definition) {
      return `components.${name}: unknown component`;
    }

    const variant = config.variant ?? definition.defaultVariant;
    if (!definition.variants[variant]) {
      return `components.${name}.variant: unknown variant "${variant}"`;
    }

    if (config.tokens) {
      for (const key of Object.keys(config.tokens)) {
        if (!definition.tokens.some((token) => token.key === key)) {
          return `components.${name}.tokens.${key}: unknown token`;
        }
      }
    }
  }

  return null;
}
