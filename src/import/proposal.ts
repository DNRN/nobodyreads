// --- Import agent: the proposal schema ---
//
// The single source of truth for what the model may propose, in the same
// discipline as `themeDiffSchema` / `moderationVerdictSchema`: the JSON
// Schema handed to the provider is derived here so the two cannot drift, and
// the zod re-parse is the real boundary — the schema constraint is a guide
// for the model, not a safety guarantee.
//
// One transport decision worth knowing about: bodies travel as `bodyLines`,
// one Markdown line per array entry, with `""` for the blank lines between
// blocks. Real newline escapes inside long JSON strings turned out to be the
// thing models drop first (observed: whole articles flattened onto one line
// with double spaces). Making line breaks structural removes that failure
// mode for every provider.

import { z } from "zod";

/** One Markdown line per entry; an empty entry is a blank line. */
export const bodyLinesSchema = z
  .array(z.string().refine((line) => !line.includes("\n"), "one line per entry, no embedded newlines"))
  .min(1);

export const importItemSchema = z.object({
  kind: z.enum(["page", "post"]),
  // `.trim()` first: the model's leading/trailing whitespace is noise, and
  // a blank-after-trim title or body must be refused, not stored.
  title: z.string().trim().min(1),
  /** Lowercase kebab-case; validated for grammar and uniqueness separately. */
  slug: z.string().trim().min(1),
  excerpt: z.string(),
  tags: z.array(z.string()),
  bodyLines: bodyLinesSchema,
  /** Manifest key of a cover image, when the item should have one. */
  coverImageKey: z.string().nullable().optional(),
  /** Present when the item should appear in the site's top navigation. */
  nav: z.object({ label: z.string().min(1), order: z.number().int() }).nullable().optional(),
  /** One sentence on why this item exists — the owner reads it while deciding. */
  reason: z.string(),
});

/** What the model itself returns. */
export const importProposalSchema = z.object({
  items: z.array(importItemSchema).max(50),
  /** The agent's own explanation of the split, for the owner and for the
   * next run's steering loop (`previousNotes`). */
  notes: z.string(),
});

export type RawImportItem = z.infer<typeof importProposalSchema>["items"][number];
export type RawImportProposal = z.infer<typeof importProposalSchema>;

export const importProposalJsonSchema = z.toJSONSchema(importProposalSchema, {
  target: "draft-2020-12",
});

/**
 * Assemble the transport form into the Markdown body everything downstream
 * (validation, preview, apply) works with. Trailing spaces per line are
 * stripped: two of them would otherwise become accidental hard line breaks.
 */
export function assembleBody(lines: readonly string[]): string {
  return lines.map((line) => line.replace(/\s+$/, "")).join("\n").trim();
}

/** The public item: like the raw one, but with a single `bodyMarkdown`. */
export interface ImportItem extends Omit<RawImportItem, "bodyLines"> {
  bodyMarkdown: string;
}

export interface ImportProposal {
  items: ImportItem[];
  notes: string;
}

export function parseImportProposal(value: unknown): ImportProposal | null {
  const result = importProposalSchema.safeParse(value);
  if (!result.success) return null;
  return {
    items: result.data.items.map(({ bodyLines, ...item }) => ({
      ...item,
      bodyMarkdown: assembleBody(bodyLines),
    })),
    notes: result.data.notes,
  };
}
