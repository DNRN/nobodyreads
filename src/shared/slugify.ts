/**
 * Title → URL slug.
 *
 * Shared because the same chain was written out in the page editor, the
 * collection editor and the collection picker, and a slug produced by one has
 * to match a slug produced by another. No imports on purpose — this is bundled
 * for the browser alongside `embed-token.ts`.
 *
 * The output satisfies the `[a-z0-9-]+` grammar that `viewFormSchema` and the
 * embed token both enforce, except that an input with nothing slug-worthy in it
 * (punctuation only, or empty) yields `""` — callers decide what to do with
 * that, since "required" is a form concern rather than a slug one.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
