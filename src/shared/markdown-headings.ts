import type { TokensList, Tokens } from "marked";

/**
 * Heading normalisation shared by the server renderer and the editor's
 * client-side live preview.
 *
 * Lives in `shared/` with no dependencies beyond `marked`'s types so the
 * browser bundle can import it without pulling in the DB layer.
 */

/** Collapse a heading to a comparable form: lowercase, no punctuation. */
export function titleKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Enforce "the page chrome's title is the document's only `<h1>`".
 *
 * A page renders its title as an `<h1>` above the body, so a body that also
 * opens with `# ` shows the title twice — a mistake authors make constantly,
 * because in plain markdown the title *is* the first heading. Rather than
 * failing the save, the body is reconciled with the chrome at render time:
 *
 *  - a leading `# ` whose text matches the title is dropped, and
 *  - any remaining body `# ` is demoted to `<h2>`.
 *
 * Nothing is ever lost: a leading `# ` that says something *other* than the
 * title survives as an `<h2>` section heading.
 *
 * Runs against lexed tokens rather than raw markdown so `# ` inside fenced
 * code blocks is left alone. Mutates `tokens` in place.
 */
export function normalizeHeadings(tokens: TokensList, pageTitle: string): void {
  const firstContentIndex = tokens.findIndex((t) => t.type !== "space");
  const first = firstContentIndex === -1 ? undefined : tokens[firstContentIndex];

  if (
    first?.type === "heading" &&
    (first as Tokens.Heading).depth === 1 &&
    titleKey((first as Tokens.Heading).text) === titleKey(pageTitle)
  ) {
    tokens.splice(firstContentIndex, 1);
  }

  for (const token of tokens) {
    if (token.type === "heading" && (token as Tokens.Heading).depth === 1) {
      (token as Tokens.Heading).depth = 2;
    }
  }
}
