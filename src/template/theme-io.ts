import { z } from "zod";
import type { SiteTemplateDefinition } from "./types.js";

const tokenSetSchema = z.object({
  bg: z.string(),
  text: z.string(),
  muted: z.string(),
  border: z.string(),
  accent: z.string(),
  link: z.string(),
  linkHover: z.string(),
  brandInk: z.string(),
  brandAccent: z.string(),
  brandBg: z.string(),
  brandFont: z.string(),
  logoWeight: z.string(),
  logoTracking: z.string(),
  font: z.string(),
  fontMono: z.string(),
  fontSize: z.string(),
  lineHeight: z.string(),
  maxWidth: z.string(),
  containerPadding: z.string(),
});

const headerSectionSchema = z.object({
  type: z.literal("header"),
  enabled: z.boolean(),
  showHero: z.boolean(),
  showTagline: z.boolean(),
  logoText: z.string(),
  logoDotText: z.string(),
});

const contentSectionSchema = z.object({
  type: z.literal("content"),
  enabled: z.boolean(),
});

const footerSectionSchema = z.object({
  type: z.literal("footer"),
  enabled: z.boolean(),
  showWordmark: z.boolean(),
});

const sectionConfigSchema = z.discriminatedUnion("type", [
  headerSectionSchema,
  contentSectionSchema,
  footerSectionSchema,
]);

const componentVariantsSchema = z.object({
  postPreview: z.enum(["default", "compact", "card"]),
  nav: z.enum(["inline", "dropdown"]),
});

const customTokenSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Token key must be a valid identifier"),
  label: z.string().min(1),
  defaultValue: z.string(),
  type: z.enum(["text", "html", "url", "color"]),
});

const themeMetaSchema = z.object({
  name: z.string().min(1),
  author: z.string(),
  description: z.string(),
  version: z.string(),
});

export const siteTemplateDefinitionSchema = z.object({
  tokens: z.object({
    light: tokenSetSchema,
    dark: tokenSetSchema.partial(),
  }),
  sections: z.array(sectionConfigSchema),
  components: componentVariantsSchema,
  customCss: z.string().optional(),
  customJs: z.string().optional(),
  layoutHtml: z.string().optional(),
  customTokens: z.array(customTokenSchema).optional(),
  themeMeta: themeMetaSchema.optional(),
});

export function validateTheme(
  data: unknown,
): { ok: true; theme: SiteTemplateDefinition } | { ok: false; error: string } {
  const result = siteTemplateDefinitionSchema.safeParse(data);
  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { ok: false, error: messages };
  }
  return { ok: true, theme: result.data as SiteTemplateDefinition };
}

export function themeHasScripts(theme: SiteTemplateDefinition): boolean {
  return !!(theme.customJs?.trim());
}
