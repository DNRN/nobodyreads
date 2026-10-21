// --- Import agent: the document outline ---
//
// The shape `extract.ts` produces from any HTML hand-off (a slide deck, an
// old site, a saved page). It is deliberately lossy in one direction: text,
// lists and images survive; all presentation (classes, styles, scripts,
// canvases, inline SVG) is dropped. This outline — not the HTML — is what
// the model ever sees, which is both a context-size measure and a prompt
// discipline: the agent cannot re-emit markup it was never given.

/** A run of prose. Inline emphasis has been flattened to plain text. */
export interface TextBlock {
  type: "text";
  text: string;
}

/** A bullet/numbered list, flattened to item strings. */
export interface ListBlock {
  type: "list";
  ordered: boolean;
  items: string[];
}

/** An image reference, exactly as written in the source (`src` untouched). */
export interface ImageBlock {
  type: "image";
  src: string;
  alt: string;
}

/** A caption bound to a nearby image (figcaption, or a labeled gallery). */
export interface CaptionBlock {
  type: "caption";
  text: string;
}

/** Speaker notes / presenter asides. Metadata for the author, not body copy. */
export interface FootnoteBlock {
  type: "footnote";
  text: string;
}

/** A sub-heading inside a section (the section's own heading is promoted). */
export interface HeadingBlock {
  type: "heading";
  level: number;
  text: string;
}

export type OutlineBlock =
  | TextBlock
  | ListBlock
  | ImageBlock
  | CaptionBlock
  | FootnoteBlock
  | HeadingBlock;

export interface OutlineSection {
  /** The section's first heading; a title slide may have none. */
  heading: string | null;
  blocks: OutlineBlock[];
}

export interface DocumentOutline {
  /** `<title>` text, falling back to the document's first `h1`. */
  title: string | null;
  /** The `lang` attribute, e.g. "da" — the agent must preserve the language. */
  language: string | null;
  sections: OutlineSection[];
  /** Every image `src` in document order, duplicates removed. */
  images: string[];
}
