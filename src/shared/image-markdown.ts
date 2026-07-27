/**
 * Shared markdown image rendering with size and alignment hints.
 *
 * The hints live in the image alt text, pipe-separated:
 *
 *   ![alt](url)                  → default (centred block, full column width)
 *   ![alt|600px](url)            → max-width: 600px
 *   ![alt|50%](url)              → max-width: 50%
 *   ![alt|300x200](url)          → fixed 300×200 (object-fit: cover)
 *   ![alt|left](url)             → float left, text wraps on the right
 *   ![alt|400px|right](url)      → 400px wide, floated right
 *   ![alt|center](url)           → centred block (explicit)
 *
 * Hints can appear in any order and be combined. Anything that isn't a
 * recognised size/dimension/alignment hint is ignored, so plain alt text
 * containing a literal "|" still renders (the first segment is always the
 * alt text).
 *
 * Both the live editor preview and the server-side renderer use this single
 * function so what an author sees while writing matches the published page.
 */

/** Width pre-filled into the markdown when an image is inserted from the toolbar. */
export const DEFAULT_IMAGE_WIDTH = "600px";

/** Strip the file extension from a filename for use as alt text. */
export function altFromName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/**
 * Alt-text slot carrying the default width hint, e.g. `"sunset|600px"`.
 *
 * Used where an image node is built directly (the WYSIWYG editor) rather than
 * as a markdown string, so every insertion path agrees on the default size.
 */
export function altWithDefaultWidth(name: string): string {
  return `${altFromName(name)}|${DEFAULT_IMAGE_WIDTH}`;
}

/**
 * Build the markdown snippet inserted when an image is added. We pre-fill a
 * sensible default width so the author immediately sees the size syntax and
 * can tweak the number (or add `|left` / `|right` to wrap text) without
 * having to remember it.
 */
export function imageMarkdown(alt: string, url: string): string {
  return `![${alt}|${DEFAULT_IMAGE_WIDTH}](${url})`;
}

const FIRST_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/;

/**
 * Find the first image embedded in a post's Markdown body, used as the
 * fallback social share image when the author hasn't picked one explicitly.
 */
export function firstImageUrl(markdown: string): string | undefined {
  return markdown.match(FIRST_IMAGE_RE)?.[1];
}

const SIZE_RE = /^\d+(?:px|%|em|rem|vw)$/;
const DIM_RE = /^(\d+)x(\d+)$/;
const ALIGNMENTS = new Set(["left", "right", "center"]);

export interface ImageToken {
  href: string;
  title?: string | null;
  text: string;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render a markdown image token (as produced by `marked`) to an `<img>` tag,
 * applying any size/alignment hints found in the alt text.
 */
export function renderImage({ href, title, text }: ImageToken): string {
  const segments = text.split("|").map((s) => s.trim());
  const alt = segments[0] ?? "";

  const styles: string[] = [];
  const classes: string[] = [];

  for (const hint of segments.slice(1)) {
    const dim = hint.match(DIM_RE);
    if (dim) {
      styles.push(`width: ${dim[1]}px`, `height: ${dim[2]}px`, "object-fit: cover");
      continue;
    }
    if (SIZE_RE.test(hint)) {
      styles.push(`max-width: ${hint}`);
      continue;
    }
    const align = hint.toLowerCase();
    if (ALIGNMENTS.has(align)) {
      classes.push(`nbr-img-${align}`);
    }
  }

  const altAttr = ` alt="${escapeAttr(alt)}"`;
  const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
  const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
  const styleAttr = styles.length ? ` style="${styles.join("; ")}"` : "";

  return `<img src="${escapeAttr(href)}"${altAttr}${titleAttr}${classAttr}${styleAttr} />`;
}
