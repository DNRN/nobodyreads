/**
 * What an AI is allowed to produce for a collection, and what it is told.
 *
 * A collection is a SQL query plus a template. Both halves already have a
 * validator — `validateCustomQuery` (allowlisted tables, tenant-scoped, single
 * SELECT) and `validateCollectionTemplate` (parses, no code) — and those remain
 * the safety boundary. The schema and prompt here exist to make a *usable*
 * answer likely, not to make an unsafe one impossible.
 */
import { z } from "zod";
import { CUSTOM_VIEW_ALLOWED_TABLES } from "./custom-view-sql.js";
import { TEMPLATE_HELPERS } from "./collection-template.js";

export const collectionDraftSchema = z.object({
  /** A short, human name for the collection. */
  name: z.string(),
  /** A single SELECT, tenant-scoped with `:tenant_id`. */
  query: z.string(),
  /** Markup in the collection template language. */
  template: z.string(),
});

export type CollectionDraft = z.infer<typeof collectionDraftSchema>;

export const collectionDraftJsonSchema = z.toJSONSchema(collectionDraftSchema, {
  target: "draft-2020-12",
});

/**
 * The columns each readable table exposes.
 *
 * Written out rather than introspected because it is prompt text, not a
 * runtime contract — but `ai-collection.test.ts` checks the `page_public` list
 * against `schema.sql`, since that view is explicitly maintained and a column
 * added there should reach the model too.
 */
export const READABLE_COLUMNS: Record<string, string[]> = {
  page_public: [
    "page_id", "tenant_id", "slug", "title", "excerpt", "tags", "date", "updated",
    "published", "seo", "kind", "nav_label", "nav_order", "comments_enabled",
    "in_feed", "access_tier", "price_amount",
  ],
  post_like: ["tenant_id", "page_id", "member_issuer", "member_subject", "created_at"],
  comment: [
    "comment_id", "tenant_id", "page_id", "parent_id", "author_name", "body",
    "created_at", "deleted_at", "pinned_at",
  ],
  content_view: ["content_view_id", "tenant_id", "slug", "title", "kind", "published", "updated"],
  media: ["media_id", "tenant_id", "storage_key", "original_name", "mime_type", "size", "created_at"],
};

function tableReference(): string {
  return CUSTOM_VIEW_ALLOWED_TABLES.map(
    (table) => `- ${table}(${(READABLE_COLUMNS[table] ?? []).join(", ")})`,
  ).join("\n");
}

export const COLLECTION_SYSTEM_PROMPT = [
  "You write a reusable list of posts for a personal blog. You produce two things:",
  "a SQL query that chooses the rows, and a template that renders them.",
  "",
  "THE QUERY must be:",
  "- a single SELECT statement, no semicolon-separated statements",
  "- scoped with the named parameter :tenant_id (this is required; the query is",
  "  rejected without it)",
  "- reading ONLY these tables and columns:",
  tableReference(),
  "- no SQL comments (-- or /* */); they are rejected",
  "- posts are rows in page_public where kind = 'post' and published = 1",
  "- tags are stored as a JSON array in a text column, so match a tag with",
  "  tags LIKE '%\"thetag\"%'",
  "",
  "THE TEMPLATE is HTML with a small syntax. It is NOT JavaScript and nothing in",
  "it executes:",
  "- {{field}} inserts a column from the current row, HTML-escaped for you",
  "- {{#each rows}} … {{/each}} repeats for every row; fields inside refer to it",
  "- {{#if field}} … {{else}} … {{/if}} branches on a value being present",
  `- helpers, each taking one value: ${TEMPLATE_HELPERS.map((h) => `{{${h} x}}`).join(", ")}`,
  "  postUrl builds a link to a post from its slug; url builds a site path;",
  "  date formats an ISO date for a reader",
  "- there is no raw-output form and no other syntax. Anything else is literal text.",
  "",
  "Use the site's own classes so it inherits the theme: post-preview, post-date,",
  "post-title, post-excerpt, read-more. Select only the columns the template uses.",
].join("\n");

export function buildCollectionUserPrompt(description: string): string {
  return [
    "Build a collection for this description:",
    "",
    description.trim(),
    "",
    "Return the collection's name, its SQL query, and its template.",
  ].join("\n");
}

/**
 * A follow-up turn after the engine rejected the model's first attempt.
 *
 * Cheaper and far more likely to succeed than failing the request outright:
 * the errors are specific ("reads tables that are not allowed: page") and the
 * model usually fixes them in one pass.
 */
export function buildCollectionRetryPrompt(
  description: string,
  previous: CollectionDraft,
  error: string,
): string {
  return [
    buildCollectionUserPrompt(description),
    "",
    "Your previous attempt was rejected:",
    error,
    "",
    "Previous query:",
    previous.query,
    "",
    "Previous template:",
    previous.template,
    "",
    "Fix the problem and return the whole collection again.",
  ].join("\n");
}
