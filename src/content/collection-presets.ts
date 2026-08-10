/**
 * Starting points for a new collection.
 *
 * Each is a real query and a real template — not a description the author then
 * has to translate. Picking one gives something that already renders, which is
 * the point: the create screen should never start from an empty SQL box.
 *
 * They are data rather than markup so the create screen, the tests and (later)
 * the AI prompt all work from the same list. Every preset is checked against
 * `validateCustomQuery` and `validateCollectionTemplate` in
 * `collection-presets.test.ts`, so a preset that could not be saved cannot ship.
 */
import { DEFAULT_COLLECTION_TEMPLATE } from "./collection-template.js";

export interface CollectionPreset {
  id: string;
  label: string;
  /** One line of plain language, shown under the preset row. */
  description: string;
  /** Prefilled into the "what do you want to show?" box. */
  prompt: string;
  query: string;
  template: string;
}

/**
 * Tags are stored as a JSON array in a text column, so a tag match is a LIKE
 * against the quoted form. Exact enough — `"fish"` does not match `"fishing"`
 * because the closing quote is part of the pattern.
 */
const TAG_PLACEHOLDER = "fishing";

const COMPACT_TEMPLATE = `{{#each rows}}
  <article class="post-preview">
    <time class="post-date">{{date date}}</time>
    <h2 class="post-title"><a href="{{postUrl slug}}">{{title}}</a></h2>
  </article>
{{/each}}`;

export const COLLECTION_PRESETS: CollectionPreset[] = [
  {
    id: "all-posts",
    label: "All posts",
    description: "Everything published, newest first.",
    prompt: "All my posts, newest first.",
    query: `SELECT slug, title, excerpt, date
FROM page_public
WHERE published = 1 AND kind = 'post' AND tenant_id = :tenant_id
ORDER BY date DESC
LIMIT 10`,
    template: DEFAULT_COLLECTION_TEMPLATE,
  },
  {
    id: "by-tag",
    label: "By tag",
    description: "Posts carrying one tag. Change the tag in the query.",
    prompt: `My posts tagged ${TAG_PLACEHOLDER}, newest first.`,
    query: `SELECT slug, title, excerpt, date
FROM page_public
WHERE published = 1 AND kind = 'post' AND tenant_id = :tenant_id
  AND tags LIKE '%"${TAG_PLACEHOLDER}"%'
ORDER BY date DESC
LIMIT 10`,
    template: DEFAULT_COLLECTION_TEMPLATE,
  },
  {
    id: "most-liked",
    label: "Most liked",
    description: "Ordered by how many readers liked them.",
    prompt: "My most liked posts.",
    query: `SELECT p.slug, p.title, p.excerpt, p.date, COUNT(l.page_id) AS likes
FROM page_public p
LEFT JOIN post_like l ON l.page_id = p.page_id AND l.tenant_id = p.tenant_id
WHERE p.published = 1 AND p.kind = 'post' AND p.tenant_id = :tenant_id
GROUP BY p.page_id
ORDER BY likes DESC, p.date DESC
LIMIT 5`,
    template: DEFAULT_COLLECTION_TEMPLATE,
  },
  {
    id: "a-series",
    label: "A series",
    description: "One tag in reading order, oldest first.",
    prompt: `The ${TAG_PLACEHOLDER} series, in reading order.`,
    query: `SELECT slug, title, excerpt, date
FROM page_public
WHERE published = 1 AND kind = 'post' AND tenant_id = :tenant_id
  AND tags LIKE '%"${TAG_PLACEHOLDER}"%'
ORDER BY date ASC
LIMIT 20`,
    template: COMPACT_TEMPLATE,
  },
];

export function getCollectionPreset(id: string): CollectionPreset | undefined {
  return COLLECTION_PRESETS.find((preset) => preset.id === id);
}
