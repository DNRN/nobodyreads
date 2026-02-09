import { readFile } from "node:fs/promises";
import matter from "gray-matter";
import { initDb, getDb } from "../src/shared/db.js";
import { upsertPage } from "../src/content/db.js";
import type { Page, PageMeta, PageKind, PageNav } from "../src/content/types.js";
import { DEFAULT_TENANT_ID } from "../src/shared/types.js";

const TENANT_ID = process.env.TENANT_ID ?? DEFAULT_TENANT_ID;

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error("Usage: npm run post -- <file.md> [file2.md ...]");
  process.exit(1);
}

// --- Frontmatter parsers ---

const VALID_KINDS = new Set<PageKind>(["home", "page", "post"]);

/** Parse the `kind` field, defaulting to "post". */
function parseKind(raw: unknown): PageKind {
  if (typeof raw === "string" && VALID_KINDS.has(raw as PageKind)) {
    return raw as PageKind;
  }
  return "post";
}

/** Parse the optional `nav` frontmatter block. */
function parseNav(raw: unknown): PageNav | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.label !== "string" || typeof obj.order !== "number") return undefined;
  return { label: obj.label, order: obj.order };
}

/** Parse the optional `seo` frontmatter block into a PageMeta object. */
function parseSeoFrontmatter(raw: Record<string, unknown>): PageMeta | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const seo: PageMeta = {};
  let hasValue = false;

  // SEO fields
  if (typeof raw.metaDescription === "string") { seo.metaDescription = raw.metaDescription; hasValue = true; }
  if (typeof raw.canonicalUrl === "string") { seo.canonicalUrl = raw.canonicalUrl; hasValue = true; }
  if (typeof raw.ogImage === "string") { seo.ogImage = raw.ogImage; hasValue = true; }
  if (typeof raw.ogType === "string") { seo.ogType = raw.ogType; hasValue = true; }
  if (raw.twitterCard === "summary" || raw.twitterCard === "summary_large_image") {
    seo.twitterCard = raw.twitterCard; hasValue = true;
  }
  if (typeof raw.noIndex === "boolean") { seo.noIndex = raw.noIndex; hasValue = true; }
  if (typeof raw.noFollow === "boolean") { seo.noFollow = raw.noFollow; hasValue = true; }

  // GEO fields
  if (typeof raw.authorName === "string") { seo.authorName = raw.authorName; hasValue = true; }
  if (typeof raw.authorExpertise === "string") { seo.authorExpertise = raw.authorExpertise; hasValue = true; }
  if (Array.isArray(raw.citations)) {
    seo.citations = raw.citations.filter((c): c is string => typeof c === "string");
    if (seo.citations.length > 0) hasValue = true;
  }

  // AEO fields
  if (Array.isArray(raw.faq)) {
    seo.faq = raw.faq
      .filter((f): f is { question: string; answer: string } =>
        typeof f === "object" && f !== null &&
        typeof (f as Record<string, unknown>).question === "string" &&
        typeof (f as Record<string, unknown>).answer === "string"
      );
    if (seo.faq.length > 0) hasValue = true;
  }
  if (typeof raw.tldr === "string") { seo.tldr = raw.tldr; hasValue = true; }

  // AI training control
  if (typeof raw.noAiTraining === "boolean") { seo.noAiTraining = raw.noAiTraining; hasValue = true; }

  return hasValue ? seo : undefined;
}

// --- Main ---

await initDb();
const db = getDb();

for (const file of files) {
  const raw = await readFile(file, "utf-8");
  const { data, content } = matter(raw);

  // Validate required fields
  const required = ["title", "slug", "date", "excerpt"] as const;
  for (const field of required) {
    if (!data[field]) {
      console.error(`${file}: missing required field "${field}"`);
      process.exit(1);
    }
  }

  const kind = parseKind(data.kind);

  // Default `id` to `slug` if not set (backward compatible)
  const id: string = data.id || data.slug;

  const page: Page = {
    id,
    slug: data.slug,
    title: data.title,
    content: content.trim(),
    excerpt: data.excerpt,
    tags: data.tags ?? [],
    date: String(data.date instanceof Date ? data.date.toISOString().split("T")[0] : data.date),
    updated: data.updated
      ? String(data.updated instanceof Date ? data.updated.toISOString().split("T")[0] : data.updated)
      : undefined,
    published: data.published ?? false,
    scripts: data.scripts,
    seo: parseSeoFrontmatter(data.seo as Record<string, unknown>),
    kind,
    nav: parseNav(data.nav),
  };

  await upsertPage(db, page, TENANT_ID);

  const flags: string[] = [];
  flags.push(page.published ? "published" : "draft");
  flags.push(page.kind);
  if (page.nav) flags.push(`nav:${page.nav.label}(${page.nav.order})`);
  if (page.seo?.noAiTraining) flags.push("no-ai-training");
  if (page.seo?.noIndex) flags.push("noindex");
  console.log(`[${flags.join(", ")}] ${page.id} \u2014 ${page.title} (tenant: ${TENANT_ID})`);
}

// Close the DB connection
db.close();
console.log("done");
