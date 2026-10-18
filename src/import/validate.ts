// --- Import agent: proposal validation ---
//
// The mechanical gate between the model and the owner. The zod parse has
// already run (schema shape); what is left are the rules the schema cannot
// express: slug grammar, uniqueness within the proposal and against the
// tenant's existing pages, image references that must resolve to staged
// media, and markup that has no business in a Markdown body. This module is
// pure — callers hand in the existing slugs — so it runs identically at
// generate time and again at apply time on the client's round-tripped copy.

import type { ManifestEntry } from "./manifest.js";
import type { ImportProposal } from "./proposal.js";

const MAX_ITEMS = 50;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FORBIDDEN_MARKUP = /<\s*(?:script|iframe)\b/gi;
const MEDIA_REF = /\/media\/[^\s)"']+/g;

export interface ProposalValidation {
  /** Problems with the proposal as a whole. */
  errors: string[];
  /** Problems with individual items, keyed by item index. */
  itemErrors: Record<number, string[]>;
}

function itemProblems(
  proposal: ImportProposal,
  manifest: ManifestEntry[],
  existingSlugs: ReadonlySet<string>,
  seenSlugs: Map<string, number>,
  index: number,
): string[] {
  const item = proposal.items[index];
  const problems: string[] = [];

  if (!SLUG_PATTERN.test(item.slug)) {
    problems.push(`Slug "${item.slug}" must be lowercase kebab-case (a-z, 0-9, single hyphens).`);
  }
  const claimedBy = seenSlugs.get(item.slug);
  if (claimedBy !== undefined && claimedBy !== index) {
    problems.push(`Slug "${item.slug}" is also proposed for item ${claimedBy + 1}.`);
  } else if (existingSlugs.has(item.slug)) {
    problems.push(`Slug "${item.slug}" is already used by an existing page or post.`);
  }
  seenSlugs.set(item.slug, index);

  const knownKeys = new Set(manifest.map((entry) => entry.url));
  const refs = item.bodyMarkdown.match(MEDIA_REF) ?? [];
  for (const ref of refs) {
    if (!knownKeys.has(ref)) {
      problems.push(`Body references "${ref}", which is not a staged image from this import.`);
    }
  }
  if (item.coverImageKey !== null && item.coverImageKey !== undefined) {
    if (!manifest.some((entry) => entry.key === item.coverImageKey)) {
      problems.push(`Cover image "${item.coverImageKey}" is not a staged image from this import.`);
    }
  }

  if (FORBIDDEN_MARKUP.test(item.bodyMarkdown)) {
    problems.push("Body contains script/iframe markup, which a Markdown body may not.");
  }
  FORBIDDEN_MARKUP.lastIndex = 0;

  return problems;
}

export function validateProposal(
  proposal: ImportProposal,
  manifest: ManifestEntry[],
  existingSlugs: ReadonlySet<string>,
): ProposalValidation {
  const errors: string[] = [];
  if (proposal.items.length === 0) {
    errors.push("The proposal contains no items.");
  }
  if (proposal.items.length > MAX_ITEMS) {
    errors.push(`The proposal holds ${proposal.items.length} items; the cap is ${MAX_ITEMS}.`);
  }

  const itemErrors: Record<number, string[]> = {};
  const seenSlugs = new Map<string, number>();
  proposal.items.forEach((_item, index) => {
    const problems = itemProblems(proposal, manifest, existingSlugs, seenSlugs, index);
    if (problems.length > 0) itemErrors[index] = problems;
  });

  return { errors, itemErrors };
}

export function proposalIsValid(validation: ProposalValidation): boolean {
  return validation.errors.length === 0 && Object.keys(validation.itemErrors).length === 0;
}
