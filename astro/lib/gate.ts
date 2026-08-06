import type { Database } from "../../src/db/index.js";
import type { Page } from "../../src/content/types.js";
import type { AccessDecision, PageAccessOptions } from "../../src/payments/types.js";
import { getLocalMemberIdentity } from "../../src/community/auth.js";
import { getReadableContent, requiresPrivateCache } from "../../src/payments/access.js";
import { isAuthenticatedRequest } from "../../src/admin/server/auth.js";

/**
 * One-call paywall gate for the self-hosted Astro pages.
 *
 * Every render site does the same four things — resolve the member, run the
 * gate, render from the *redacted* page, and pass that same redacted page on to
 * `SiteLayout`. Doing it in one helper means there is a single place to get it
 * right, rather than three or seven places to get it wrong. `.me` has its own
 * equivalent because its member identity comes from a platform session.
 *
 * Also sets `Cache-Control: private, no-store` on an entitled reader's full
 * render. Without it a CDN or corporate proxy caches a subscriber's article and
 * serves it to the next anonymous visitor — a paywall bypass that never touches
 * the gate at all.
 */
export interface GateResult {
  /** Safe to render, safe to hand to SiteLayout, safe to serialise. */
  page: Page;
  decision: AccessDecision;
  gated: boolean;
  signedIn: boolean;
}

export async function gatePage(
  db: Database,
  rawPage: Page,
  tenantId: string,
  request: Request,
  response: Response,
  options: Omit<PageAccessOptions, "isOwner"> = {}
): Promise<GateResult> {
  const member = await getLocalMemberIdentity(db, request);

  // On a self-host the editor session *is* the owner. A multi-tenant host
  // decides ownership itself and passes `isOwner` in — the package never guesses.
  const isOwner = isAuthenticatedRequest(request);

  const previewAs = readPreviewParam(request);

  const result = await getReadableContent(db, rawPage, tenantId, member, {
    ...options,
    isOwner,
    previewAs,
  });

  if (requiresPrivateCache(rawPage, result.decision)) {
    response.headers.set("Cache-Control", "private, no-store");
  }

  return { ...result, signedIn: member !== null };
}

/**
 * The gate for the owner-only draft preview routes.
 *
 * Preview is owner-only by construction (the host guards the route), so this is
 * always `isOwner: true` and normally renders the full body. It still goes
 * through the same gate so `?preview=public` shows the owner exactly what a
 * non-paying reader sees — teaser, CTA and all.
 */
export async function gatePreviewPage(
  db: Database,
  rawPage: Page,
  tenantId: string,
  request: Request
): Promise<GateResult> {
  const result = await getReadableContent(db, rawPage, tenantId, null, {
    isOwner: true,
    previewAs: readPreviewParam(request),
  });
  return { ...result, signedIn: true };
}

/**
 * `?preview=public|member|owner`, honoured only when the viewer owns the plot —
 * `resolvePageAccess` drops it for everyone else, so a reader appending the
 * param to a URL changes nothing.
 */
function readPreviewParam(request: Request): "owner" | "member" | "public" | null {
  const value = new URL(request.url).searchParams.get("preview");
  return value === "public" || value === "member" || value === "owner" ? value : null;
}
