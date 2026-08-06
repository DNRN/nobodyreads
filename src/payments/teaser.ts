import type { Page } from "../content/types.js";
import { DEFAULT_TEASER_WORDS } from "./types.js";

/**
 * Build the markdown shown above a paywall.
 *
 * Priority:
 *   1. everything above an explicit `<!--paywall-->` or `<!--more-->` marker
 *   2. the author-written `excerpt`
 *   3. the first ~75 words of the body, cut at a **block** boundary
 *
 * Two things that are easy to get wrong and expensive to get wrong:
 *
 * - The cut is at a block boundary, never mid-markdown. Cutting inside a fenced
 *   code block leaves an unbalanced ``` that swallows the rest of the page; a
 *   cut inside an HTML comment leaves a dangling `<!--` that hides the paywall
 *   CTA itself.
 * - `{{view:slug}}` tokens are stripped. A custom view resolves against the
 *   database at render time, so leaving one in a teaser runs a query for a
 *   reader who has not paid.
 *
 * This returns **markdown**, not HTML, because `redactPage` swaps markdown for
 * markdown — `resolveLinks` and `renderMarkdown` still run downstream exactly
 * as they do for an ungated page.
 *
 * Per the Phase 5a decision the stored `excerpt` is never written to. Derivation
 * happens in memory, only for a gated page; RSS, newsletters and meta
 * descriptions keep using the stored excerpt verbatim.
 */
export interface TeaserOptions {
  words?: number;
}

const PAYWALL_MARKER = /^[ \t]*<!--\s*(?:paywall|more)\s*-->[ \t]*$/im;
const VIEW_TOKEN = /\{\{view:[a-z0-9-]+\}\}/g;

export function buildTeaser(page: Page, options: TeaserOptions = {}): string {
  const words = options.words ?? DEFAULT_TEASER_WORDS;
  const body = stripViewTokens(page.content ?? "");

  const marker = PAYWALL_MARKER.exec(body);
  if (marker) {
    const above = body.slice(0, marker.index).trim();
    if (above) return above;
  }

  const excerpt = page.excerpt?.trim();
  if (excerpt) return excerpt;

  return truncateAtBlock(body, words);
}

function stripViewTokens(markdown: string): string {
  return markdown.replace(VIEW_TOKEN, "");
}

/**
 * Take whole blocks until the word budget is spent.
 *
 * Blocks are split on blank lines, which is markdown's own paragraph boundary,
 * so a fenced code block, table or HTML comment is always taken or skipped
 * whole. A block that would open a fence and not close it is dropped rather
 * than half-included.
 */
function truncateAtBlock(markdown: string, words: number): string {
  const blocks = markdown.split(/\n[ \t]*\n/).map((b) => b.trim()).filter(Boolean);

  const kept: string[] = [];
  let budget = words;
  let truncated = false;

  for (const block of blocks) {
    if (budget <= 0) {
      truncated = true;
      break;
    }
    if (isUnbalanced(block)) {
      truncated = true;
      break;
    }

    kept.push(block);
    budget -= countWords(block);
  }

  if (kept.length === 0) return "";
  if (blocks.length > kept.length) truncated = true;

  const teaser = kept.join("\n\n");
  return truncated ? `${teaser}\n\n…` : teaser;
}

/** A block that opens a fence or an HTML comment it does not close. */
function isUnbalanced(block: string): boolean {
  const fences = (block.match(/^[ \t]*(?:```|~~~)/gm) ?? []).length;
  if (fences % 2 !== 0) return true;

  const opens = (block.match(/<!--/g) ?? []).length;
  const closes = (block.match(/-->/g) ?? []).length;
  return opens !== closes;
}

function countWords(block: string): number {
  return block.split(/\s+/).filter(Boolean).length;
}
