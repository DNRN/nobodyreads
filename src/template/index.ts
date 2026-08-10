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
export { PALETTE, FONTS, alpha } from "./palette.js";
export {
  FONT_CATALOGUE,
  CATALOGUE_STACKS,
  familyForStack,
  fontFamilyById,
  fontLinkHref,
} from "./fonts.js";
export type { FontFamily, FontRole } from "./fonts.js";
export {
  TYPE_PAIRINGS,
  DENSITY_STEPS,
  CORNER_STEPS,
  COLOR_SLOTS,
  matchTypePairing,
  matchDensityStep,
  matchCornerStep,
} from "./presets.js";
export type { TypePairing, DensityStep, CornerStep, ColorSlot } from "./presets.js";
export type { Palette } from "./palette.js";
export {
  renderDeclarations,
  replaceGeneratedRegion,
  GENERATED_BEGIN,
  GENERATED_END,
} from "./palette-css.js";
export type { ThemeName } from "./palette-css.js";
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
