import type { MenuItem, Page } from "../content/types.js";
import type { MemberIdentity } from "../community/types.js";

/**
 * Everything about a site that the engine cannot work out for itself.
 *
 * A host builds one of these per request and hands it to `resolvePageView`.
 * It is deliberately a description of a *site*, not of a rendering mode: there
 * is no `isPreview` here, and there must never be one. A draft preview differs
 * from the live page in exactly two arguments — the template it is handed and
 * the viewer looking at it — and both of those are ordinary inputs that the
 * live page supplies too. Anything else that made preview and live diverge
 * would be a second renderer wearing the first one's name.
 */
export interface SiteContext {
  tenantId: string;

  /** The site's own name. Never the engine's — see `resolveSiteIdentity`. */
  siteName: string;
  /**
   * The site's one-line description.
   *
   * Empty string rather than `undefined` when a site has none: omitting it
   * lets `SiteLayout` fall back to the engine's own tagline, and every plot
   * then introduces itself as a blog engine.
   */
  siteTagline: string;

  /**
   * Absolute origin the canonical, `og:url` and JSON-LD URLs are built from,
   * e.g. `https://alice.nobodyreads.me`.
   *
   * Required, because the environment can only name one site and a host that
   * serves several from one process would otherwise stamp the platform's
   * origin onto every one of them.
   */
  siteUrl: string;

  /**
   * Path every in-site link is built under: `""` on a site that owns its host,
   * `"/preview"` on the owner-only draft surface. Following a link stays on
   * whichever surface you are already on.
   */
  urlPrefix: string;

  /**
   * Path the same content lives under *for a reader*.
   *
   * Equal to `urlPrefix` on the public site, and deliberately not equal on the
   * draft surface: a share link built from `/preview` hands someone an
   * owner-only URL they cannot open. Anything a visitor is meant to receive —
   * a share target above all — belongs under this one.
   */
  publicUrlPrefix: string;

  /** Where the header wordmark points. */
  brandHref: string;
  /** Where a reader is sent to sign in — may cross an origin. */
  loginHref: string;

  /**
   * What this site calls itself in prose: "plot" on the platform, "blog" in
   * the engine. Reaches reader-visible copy such as an empty archive.
   */
  spaceNoun: string;

  /** Small line above the site name in the hero, typically the site's host. */
  heroEyebrow?: string;

  /** Where an owner with an empty archive goes to write their first post. */
  composeHref: string;
  /** The site's feed, offered under a listing. */
  feedHref: string;
  /** Optional "what this place is for" link, shown to an owner with no posts. */
  manifestoHref?: string;

  /** Base path for the JSON API the community and comment widgets call. */
  apiBase: string;

  /**
   * Which reader-facing extras the host has actually mounted.
   *
   * A block whose endpoints are not routed renders as a dead widget, so this
   * says what exists rather than what looks nice. All default to enabled.
   */
  features?: SiteFeatures;

  /**
   * The topbar account dropdown, which only the host can build — it depends on
   * a session shape the engine knows nothing about. Returning no items hides
   * the menu and its toggle entirely.
   */
  buildMenu(viewer: Viewer): { menuHeader?: string; menuItems: MenuItem[] };
}

export interface SiteFeatures {
  /** Join/like widget in the topbar and under a post. */
  community?: boolean;
  /** Comment thread under a post. */
  comments?: boolean;
  /** Share links under a post. */
  sharing?: boolean;
}

/**
 * Who is looking at the page.
 *
 * The host decides all three — the engine has no idea what a session looks
 * like. This is one half of the pair that separates a draft preview from a
 * live page; the template is the other.
 */
export interface Viewer {
  /** Whether the viewer owns this site. Ownership is always the host's call. */
  isOwner: boolean;
  /** The viewer's paid-membership identity, or null when signed out. */
  member: MemberIdentity | null;
  /**
   * Render as if the viewer were someone else — the owner's "preview as"
   * control. `resolvePageAccess` ignores it for anyone who is not the owner,
   * so a reader appending `?preview=public` to a URL changes nothing.
   */
  previewAs: "owner" | "member" | "public" | null;
}

/**
 * The same site, addressed through its owner-only draft surface.
 *
 * Exactly two things move, and this is the one place that decides which: links
 * are built under `/preview`, so following one keeps you in the draft, and the
 * wordmark returns to the draft's own home. The name, the tagline, the menu,
 * the features, the API and the share target are all untouched — a preview that
 * quietly dropped any of them would be the second renderer all over again.
 */
export function previewSurface(ctx: SiteContext): SiteContext {
  const prefix = `${ctx.publicUrlPrefix}/preview`;
  return { ...ctx, urlPrefix: prefix, brandHref: prefix };
}

/** The in-site path of a page, under whichever prefix the context sets. */
export function pagePath(page: Pick<Page, "kind" | "slug">, urlPrefix: string): string {
  if (page.kind === "home") return urlPrefix || "/";
  if (page.kind === "post") return `${urlPrefix}/posts/${page.slug}`;
  return `${urlPrefix}/${page.slug}`;
}

/** Whether a feature is on, with "unset means on" applied once, here. */
export function hasFeature(ctx: SiteContext, name: keyof SiteFeatures): boolean {
  return ctx.features?.[name] !== false;
}
