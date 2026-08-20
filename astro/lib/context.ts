import type { Database } from "../../src/db/index.js";
import type { SiteContext, Viewer } from "../../src/render/context.js";
import { DEFAULT_TENANT_ID } from "../../src/shared/types.js";
import { getSiteSettings, resolveSiteIdentity } from "../../src/shared/site-settings.js";
import { getLocalMemberIdentity } from "../../src/community/auth.js";
import { isAuthenticatedRequest } from "../../src/admin/server/auth.js";

/**
 * This host's half of the render pipeline.
 *
 * `resolvePageView` needs to know the things the engine cannot work out for
 * itself — what this site is called, where its links go, who is looking. On a
 * self-host all of that comes from the environment and the settings table; the
 * multi-tenant platform builds its own equivalent from a plot's tenant row.
 */

/** Read per request rather than at import: a self-host may set it late. */
function tenantId(): string {
  return process.env.TENANT_ID || DEFAULT_TENANT_ID;
}

function basePrefix(): string {
  return process.env.URL_PREFIX || "";
}

/**
 * What a self-hosted install falls back to before an owner sets a brand.
 *
 * This is the engine describing *itself*, which is right here and wrong on a
 * platform — a hosted plot that inherits these introduces itself to its readers
 * as a blog engine, which is why `SiteContext.siteTagline` is required rather
 * than optional.
 */
const ENGINE_DEFAULTS = {
  siteName: "nobodyreads.me",
  siteTagline: "Another simple blog engine. For writing mostly to yourself.",
};

async function baseContext(db: Database): Promise<Omit<SiteContext, "urlPrefix" | "brandHref">> {
  const id = tenantId();
  const prefix = basePrefix();
  const identity = resolveSiteIdentity(await getSiteSettings(db, id), ENGINE_DEFAULTS);

  return {
    tenantId: id,
    siteName: identity.siteName,
    siteTagline: identity.siteTagline,
    siteUrl: process.env.SITE_URL || "",
    publicUrlPrefix: prefix,
    loginHref: `${prefix}/login`,
    spaceNoun: "blog",
    composeHref: `${prefix}/admin/editor/new`,
    feedHref: `${prefix}/feed.xml`,
    apiBase: `${prefix}/api`,
    // Readers can like and share a post here, but the engine's public pages
    // carry no comment thread — a block whose endpoints are not mounted would
    // render as a dead widget.
    features: { comments: false },
    buildMenu: (viewer) => ({
      // On a self-host the editor session *is* the owner, so one item covers
      // both cases: it offers the way in either way.
      menuItems: [
        viewer.isOwner
          ? { label: "Admin", href: `${prefix}/admin` }
          : { label: "Log in", href: `${prefix}/admin` },
      ],
    }),
  };
}

/** The public site. */
export async function siteContext(db: Database): Promise<SiteContext> {
  const prefix = basePrefix();
  return { ...(await baseContext(db)), urlPrefix: prefix, brandHref: prefix || "/" };
}

/**
 * The owner-only draft surface at `/preview`.
 *
 * Only two things move: in-site links are built under `/preview`, so following
 * one keeps you in the draft, and the wordmark returns to the draft's own home.
 * Everything else — the API the widgets call, the feed, the login target — still
 * points at the real site, because those are not part of the draft.
 *
 * Note what is *not* different: the name, the tagline, the menu, the features.
 * A preview that quietly dropped any of those would be a second renderer.
 */
export async function previewContext(db: Database): Promise<SiteContext> {
  const prefix = `${basePrefix()}/preview`;
  return { ...(await baseContext(db)), urlPrefix: prefix, brandHref: prefix };
}

/** Who is asking, on the public site. */
export async function siteViewer(db: Database, request: Request): Promise<Viewer> {
  return {
    // A self-host has one account and it owns the site; a multi-tenant host
    // decides ownership itself. The package never guesses.
    isOwner: isAuthenticatedRequest(request),
    member: await getLocalMemberIdentity(db, request),
    previewAs: readPreviewParam(request),
  };
}

/**
 * Who is asking, on `/preview`.
 *
 * Owner-only by construction — the route is guarded — so this is always the
 * owner, and `?preview=public` is how they look at their own page through a
 * non-paying reader's eyes.
 */
export function previewViewer(request: Request): Viewer {
  return { isOwner: true, member: null, previewAs: readPreviewParam(request) };
}

/**
 * `?preview=public|member|owner`, honoured only for an owner —
 * `resolvePageAccess` drops it for everyone else, so a reader appending the
 * param to a URL changes nothing.
 */
function readPreviewParam(request: Request): "owner" | "member" | "public" | null {
  const value = new URL(request.url).searchParams.get("preview");
  return value === "public" || value === "member" || value === "owner" ? value : null;
}
