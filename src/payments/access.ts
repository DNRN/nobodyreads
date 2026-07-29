import type { Database } from "../db/index.js";
import type { Page } from "../content/types.js";
import type { MemberIdentity } from "../community/types.js";
import { isPlotMember } from "../community/db.js";
import { getActivePaidTier, hasPageAccess } from "./db.js";
import { buildTeaser } from "./teaser.js";
import type { AccessDecision, PageAccessOptions } from "./types.js";

/**
 * The paywall gate.
 *
 * This slice lives outside `src/content/` on purpose. The gate imports `Page`
 * as a **type-only** import and `content/` never imports `payments/`. That
 * direction is a structural guarantee that `getPageBySlug()` can never gate
 * itself — the gate is an input selector *upstream* of `renderContent`, not a
 * filter buried inside it, so there is exactly one place that decides.
 */

/**
 * Decide what a viewer may see of a page.
 *
 * Numbered early returns, like the Phase-4 moderation pipeline — but this
 * pipeline **fails closed**. Moderation failing open is right (a comment gets
 * published when the AI is down); a paywall failing open means giving away
 * paid work, so every unrecognised state lands on a teaser.
 */
export async function resolvePageAccess(
  db: Database,
  page: Page,
  tenantId: string,
  member: MemberIdentity | null,
  options: PageAccessOptions = {}
): Promise<AccessDecision> {
  // Deliberately NOT `toAccessTier(page.accessTier)`. That coercion sends
  // anything unrecognised to "public", which is the right default for *storage*
  // and exactly backwards for a gate: a page written by a newer build, or by a
  // direct SQL write, would be handed out for free. Here an unknown tier must
  // land on the teaser at step 6, so the value is compared as-is.
  const tier = page.accessTier;

  // 1. Public pages — the overwhelming majority. Short-circuits before any
  //    query, so gating costs nothing on an unpaywalled plot.
  if (tier === "public") {
    return { visibility: "full", reason: "public" };
  }

  // 2. The owner. `isOwner` is supplied by the host; the package never decides
  //    ownership itself. `previewAs` lets the owner look through a reader's
  //    eyes, and is ignored for everyone else — a non-owner appending
  //    ?preview=public to a URL must change nothing.
  if (options.isOwner) {
    const previewAs = options.previewAs ?? null;
    if (previewAs === null || previewAs === "owner") {
      return { visibility: "full", reason: "owner" };
    }
    if (previewAs === "member" && tier === "members") {
      return { visibility: "full", reason: "preview" };
    }
    return await denied(db, page, tenantId, tier);
  }

  // 3. Anonymous. Nothing to look up.
  if (!member) {
    return await denied(db, page, tenantId, tier);
  }

  // 4. Members-only: free, but you must have joined the plot.
  if (tier === "members") {
    return (await isPlotMember(db, tenantId, member))
      ? { visibility: "full", reason: "member" }
      : await denied(db, page, tenantId, tier);
  }

  // 5. Paid: a live tier subscription, or a purchase of this exact page.
  if (tier === "paid") {
    return (await hasPageAccess(db, tenantId, member, page.id))
      ? { visibility: "full", reason: "entitled" }
      : await denied(db, page, tenantId, tier);
  }

  // 6. Anything else is a tier this build does not understand. `toAccessTier`
  //    should make this unreachable; if it ever is reached, withhold the body.
  return await denied(db, page, tenantId, "paid");
}

/**
 * Build the teaser decision for a page the viewer may not read in full.
 *
 * `tier` is a plain string, not the `AccessTier` union, because an unrecognised
 * tier reaches here too — and falls through to `payment_required`, which offers
 * the reader a way in rather than a dead end.
 */
async function denied(
  db: Database,
  page: Page,
  tenantId: string,
  tier: string
): Promise<AccessDecision> {
  if (tier === "members") {
    return {
      visibility: "teaser",
      reason: "members_only",
      tier: null,
      priceAmount: null,
      currency: "eur",
    };
  }

  const paidTier = await getActivePaidTier(db, tenantId);
  return {
    visibility: "teaser",
    reason: "payment_required",
    tier: paidTier,
    priceAmount: page.priceAmount ?? null,
    currency: paidTier?.currency ?? "eur",
  };
}

/**
 * Return a copy of `page` safe to hand to anything downstream.
 *
 * For a `full` decision this is the page unchanged. For a `teaser` decision the
 * markdown body is replaced by the teaser — markdown for markdown, so
 * `resolveLinks` and `renderMarkdown` still work exactly as before.
 *
 * Replacing `content` rather than adding a flag is deliberate: a flag has to be
 * checked by every consumer forever, and one that forgets leaks the body. The
 * page object simply no longer *contains* the paid text.
 */
export function redactPage(
  page: Page,
  decision: AccessDecision,
  options: PageAccessOptions = {}
): Page {
  if (decision.visibility === "full") return page;
  return { ...page, content: buildTeaser(page, { words: options.teaserWords }) };
}

/**
 * Resolve access and hand back a page that is safe to render.
 *
 * **Returns a redacted `Page`, not a markdown string.** That is the load-bearing
 * choice in this whole slice: the caller shadows its own `page` variable with
 * the safe one, so `options.page` passed to `SiteLayout` — and from there to
 * `resolveOgImage` — is automatically safe, and so is `c.json(post)`. Redaction
 * happens once, at the boundary, instead of at every consumer. Teaching
 * `seo.ts` about paywalls would just be one more place to remember forever.
 *
 * Call-site shape, identical everywhere:
 *
 * ```ts
 * const { page, decision, gated } = await getReadableContent(db, rawPage, tenantId, member, { isOwner });
 * const htmlBody = await renderContent(db, page.content, tenantId, urlPrefix, { pageTitle: page.title });
 * ```
 */
export async function getReadableContent(
  db: Database,
  page: Page,
  tenantId: string,
  member: MemberIdentity | null,
  options: PageAccessOptions = {}
): Promise<{ page: Page; decision: AccessDecision; gated: boolean }> {
  const decision = await resolvePageAccess(db, page, tenantId, member, options);
  return {
    page: redactPage(page, decision, options),
    decision,
    gated: decision.visibility === "teaser",
  };
}

/**
 * Whether a response containing this page must not be cached by a shared cache.
 *
 * True for a full render of a non-public page: the body is correct for *this*
 * reader only. Without `Cache-Control: private, no-store`, a CDN or corporate
 * proxy caches a subscriber's article and serves it to the next anonymous
 * visitor — a paywall bypass that never touches this code.
 */
export function requiresPrivateCache(page: Page, decision: AccessDecision): boolean {
  return page.accessTier !== "public" && decision.visibility === "full";
}
