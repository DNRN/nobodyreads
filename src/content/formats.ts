import type { PostFormat } from "./types.js";

/**
 * Every post format, in the order the create menu offers them. The one place
 * that says how a format is named, started, stored, and announced — the create
 * menu, the editor's format switch, and the subscriber email all read it, so a
 * new format (video) is one entry here plus its media pipeline.
 */
export interface PostFormatSpec {
  id: PostFormat;
  /** Name in the editor's format switch. */
  label: string;
  /** Entry in the "New post" menu. */
  createLabel: string;
  /** One line under `createLabel` on what this makes. */
  createHint: string;
  /** Stored `content_type`; NULL is text. */
  contentType: string | null;
  /** What the subscriber email calls it: "New episode: …". */
  noun: string;
  /** The email's call to action: "Listen" → "Listen · 45 min". */
  verb: string;
}

export const POST_FORMATS: readonly PostFormatSpec[] = [
  {
    id: "text",
    label: "Text",
    createLabel: "Text post",
    createHint: "Dated, in your feed, emailed to subscribers",
    contentType: null,
    noun: "post",
    verb: "Read post",
  },
  {
    id: "audio",
    label: "Audio",
    createLabel: "Audio episode",
    createHint: "A recording first, show notes below — joins your podcast feed",
    contentType: "audio",
    noun: "episode",
    verb: "Listen",
  },
];

/** The spec for a format; unknown values fall back to text. */
export function postFormat(id: string | null | undefined): PostFormatSpec {
  return POST_FORMATS.find((f) => f.id === id) ?? POST_FORMATS[0];
}

/** Reads a stored `content_type`. Unknown values read as text, never as a broken format. */
export function formatFromContentType(contentType: string | null | undefined): PostFormat {
  return POST_FORMATS.find((f) => f.contentType !== null && f.contentType === contentType)?.id ?? "text";
}
