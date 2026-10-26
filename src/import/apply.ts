// --- Import agent: apply ---
//
// Turns accepted proposal items into real pages — as **drafts**: the agent
// never publishes, and the owner's explicit act in the posts list is what
// makes anything public. Defaults follow the editor's own for a new item
// (comments on, posts in the feed, public tier), so an imported draft is
// indistinguishable from one the owner just wrote.

import { randomUUID } from "node:crypto";
import type { Database } from "../db/index.js";
import { upsertPage } from "../content/db.js";
import type { Page } from "../content/types.js";
import type { ImportItem } from "./proposal.js";

export interface AppliedPage {
  id: string;
  slug: string;
  title: string;
  kind: "page" | "post";
}

export function itemToDraftPage(item: ImportItem, date: string): Page {
  return {
    id: randomUUID(),
    slug: item.slug,
    title: item.title,
    content: item.bodyMarkdown,
    excerpt: item.excerpt,
    tags: item.tags,
    date,
    published: false,
    kind: item.kind,
    // Discussion is opt-out on this platform, and an imported draft is just
    // a draft the owner has not pressed publish on yet.
    commentsEnabled: true,
    inFeed: item.kind === "post",
    accessTier: "public",
    priceAmount: null,
    nav: item.nav ?? undefined,
    // No dedicated cover column: the SEO image is the cover readers see in
    // previews and listings.
    seo: item.coverImageKey ? { ogImage: `/media/${item.coverImageKey}` } : undefined,
  };
}

export async function applyImportItems(
  db: Database,
  items: readonly ImportItem[],
  tenantId: string,
  options: { now?: () => string } = {},
): Promise<AppliedPage[]> {
  const date = (options.now ?? (() => new Date().toISOString()))();
  const created: AppliedPage[] = [];
  for (const item of items) {
    const page = itemToDraftPage(item, date);
    await upsertPage(db, page, tenantId);
    created.push({ id: page.id, slug: page.slug, title: page.title, kind: item.kind });
  }
  return created;
}
