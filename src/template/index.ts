export type {
  TokenSet,
  SiteTemplateDefinition,
  SectionConfig,
  HeaderSectionConfig,
  ContentSectionConfig,
  FooterSectionConfig,
  ComponentConfig,
  ComponentMap,
  ComponentVariants,
  LegacyComponentVariants,
  CustomToken,
  ThemeMeta,
} from "./types.js";

export { generateTokenCss } from "./tokens.js";
export { generateCss, generateHtml } from "./generate.js";
export { DEFAULT_TEMPLATE } from "./defaults.js";
export {
  siteTemplateDefinitionSchema,
  tokenSetSchema,
  validateTheme,
  normalizeComponents,
  themeHasScripts,
} from "./theme-io.js";
export {
  themeDiffSchema,
  themeDiffJsonSchema,
  applyThemeDiff,
} from "./ai-theme.js";
export type { ThemeDiff } from "./ai-theme.js";
export {
  componentRegistry,
  getComponentByName,
  serializeRegistry,
  generateComponentTokenCss,
  validateComponentsAgainstRegistry,
  defineComponent,
} from "./registry.js";
export type {
  ComponentTokenDef,
  ComponentVariantDef,
  ComponentDefinition,
  SerializableComponentDefinition,
} from "./registry.js";
