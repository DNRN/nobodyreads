import { z } from "zod";
import type { SiteTemplateDefinition, TokenSet } from "./types.js";
import { tokenSetSchema } from "./theme-io.js";
import { componentRegistry, getComponentByName } from "./registry.js";
import { normalizeComponents } from "./theme-io.js";

/**
 * AI theme-diff schema — the single source of truth for what an AI provider is
 * allowed to change about a site template. It is a *diff*: every field is
 * nullable, and `null` means "leave this unchanged". Keeping every field present
 * (required, but nullable) lets the OpenAI structured-output layer run in
 * `strict` mode while still expressing a partial update.
 *
 * The shape is derived from the real template vocabulary — token keys come from
 * `tokenSetSchema` and component variants come from `componentRegistry` — so the
 * model can only ever emit values the engine can actually render. The result is
 * merged onto the current template via `applyThemeDiff` and then re-validated
 * with `validateTheme`, so this schema is a guide for the model, not the safety
 * boundary.
 */

/** Every TokenSet key, but each value nullable (null = unchanged). */
const tokenDiffShape = Object.fromEntries(
  Object.keys(tokenSetSchema.shape).map((key) => [key, z.string().nullable()]),
) as { [K in keyof TokenSet]: z.ZodNullable<z.ZodString> };

const tokenDiffSchema = z.object(tokenDiffShape);

const sectionsDiffSchema = z.object({
  header: z
    .object({
      enabled: z.boolean().nullable(),
      showHero: z.boolean().nullable(),
      showTagline: z.boolean().nullable(),
    })
    .nullable(),
  content: z
    .object({
      enabled: z.boolean().nullable(),
    })
    .nullable(),
  footer: z
    .object({
      enabled: z.boolean().nullable(),
      showWordmark: z.boolean().nullable(),
    })
    .nullable(),
});

/** One `{ variant }` object per registered component, variant enum from the registry. */
const componentsDiffShape = Object.fromEntries(
  componentRegistry.map((component) => {
    const variantIds = Object.keys(component.variants) as [string, ...string[]];
    return [
      component.name,
      z.object({ variant: z.enum(variantIds).nullable() }).nullable(),
    ];
  }),
);

const componentsDiffSchema = z.object(componentsDiffShape);

export const themeDiffSchema = z.object({
  tokens: z.object({
    light: tokenDiffSchema.nullable(),
    dark: tokenDiffSchema.nullable(),
  }),
  sections: sectionsDiffSchema.nullable(),
  components: componentsDiffSchema.nullable(),
});

export type ThemeDiff = z.infer<typeof themeDiffSchema>;

/**
 * JSON Schema handed to the OpenAI-compatible `response_format.json_schema`.
 * Derived from `themeDiffSchema` so the two never drift.
 */
export const themeDiffJsonSchema = z.toJSONSchema(themeDiffSchema, {
  target: "draft-2020-12",
});

function mergeTokens(
  target: Record<string, string>,
  diff: Record<string, string | null> | null | undefined,
): void {
  if (!diff) return;
  for (const [key, value] of Object.entries(diff)) {
    if (value != null) target[key] = value;
  }
}

/**
 * Deep-merge a `ThemeDiff` onto a full template, skipping null/unchanged values.
 * The returned template still needs to pass `validateTheme` before it is saved.
 */
export function applyThemeDiff(
  current: SiteTemplateDefinition,
  diff: ThemeDiff,
): SiteTemplateDefinition {
  const next: SiteTemplateDefinition = structuredClone(current);

  if (diff.tokens?.light) {
    mergeTokens(next.tokens.light as unknown as Record<string, string>, diff.tokens.light);
  }
  if (diff.tokens?.dark) {
    mergeTokens(next.tokens.dark as Record<string, string>, diff.tokens.dark);
  }

  if (diff.sections) {
    for (const section of next.sections) {
      const sectionDiff = diff.sections[section.type];
      if (!sectionDiff) continue;
      for (const [key, value] of Object.entries(sectionDiff)) {
        if (value != null) {
          (section as unknown as Record<string, unknown>)[key] = value;
        }
      }
    }
  }

  if (diff.components) {
    const components = normalizeComponents(next.components);
    for (const [name, entry] of Object.entries(diff.components)) {
      if (!entry || entry.variant == null) continue;
      if (!getComponentByName(name)) continue;
      components[name] = { ...(components[name] ?? {}), variant: entry.variant };
    }
    next.components = components;
  }

  return next;
}
