import type { Database } from "../db/index.js";
import type { LayoutOptions, Page } from "../content/types.js";
import type { AccessDecision } from "../payments/types.js";
import type { SiteTemplateDefinition } from "../template/types.js";
import { getPageByKind, getPageBySlug, getNavItems, getPostStats } from "../content/db.js";
import { renderContent } from "../content/render.js";
import { heroMetaLine } from "../content/templates.js";
import { getReadableContent, requiresPrivateCache } from "../payments/access.js";
import { type SiteContext, type Viewer, pagePath } from "./context.js";

/** Which page to render. Slugs are matched within the context's tenant. */
export type RenderTarget =
  | { kind: "home" }
  | { kind: "post"; slug: string }
  | { kind: "page"; slug: string };

/**
 * A page, resolved and ready to render.
 *
 * `layout` goes straight to `SiteLayout` and `bodyHtml` into `PlotPage`; a
 * caller that reaches past these to rebuild either of them by hand has
 * reintroduced the second renderer this module exists to remove.
 */
export interface PageView {
  /** The page to render, already redacted for this viewer. Null means 404. */
  page: Page | null;
  kind: "home" | "post" | "page";
  /** The theme this view was resolved against. Pass it to `SiteLayout`. */
  template: SiteTemplateDefinition | null;
  layout: LayoutOptions;
  bodyHtml: string;
  decision: AccessDecision | null;
  /** Whether the body was cut short for this viewer. */
  gated: boolean;
  /** `gated` and the page offers a way in — the case that renders a paywall. */
  teaser: boolean;
  /** Whether the viewer is signed in as some member. */
  signedIn: boolean;
  /**
   * Whether the viewer owns this site. Carried on the view because the body
   * needs it for owner-only affordances (moderating a comment thread) and
   * should not have to be handed the viewer separately to find out.
   */
  isOwner: boolean;
}

/**
 * Resolve a page into everything needed to render it.
 *
 * This is the whole top half of a render — the page query, the navigation, the
 * access gate, the content pass and the entire `LayoutOptions` object. It used
 * to be hand-written at every call site, which is why a plot's live page and
 * the design editor's preview of that same page disagreed about the hero, the
 * account menu, the post markup and the archive layout.
 *
 * A live page and a draft preview differ here in exactly two arguments:
 *
 * - `template` — the published theme, or the draft revision being edited.
 * - `viewer` — the real session, or the owner with a `previewAs` override.
 *
 * `response` is optional only so a caller can resolve a view without one (a
 * test, a feed). Omitting it on a real page response drops the private-cache
 * header that keeps a paywalled body out of a shared cache.
 */
export async function resolvePageView(
  db: Database,
  ctx: SiteContext,
  viewer: Viewer,
  target: RenderTarget,
  template: SiteTemplateDefinition | null,
  response?: Response,
): Promise<PageView> {
  const [rawPage, navItems] = await Promise.all([
    target.kind === "home"
      ? getPageByKind(db, "home", ctx.tenantId)
      : getPageBySlug(db, target.slug, target.kind, ctx.tenantId),
    getNavItems(db, ctx.tenantId),
  ]);

  const menu = ctx.buildMenu(viewer);

  if (!rawPage) {
    return {
      page: null,
      kind: target.kind,
      template,
      bodyHtml: "",
      decision: null,
      gated: false,
      teaser: false,
      signedIn: viewer.member !== null,
      isOwner: viewer.isOwner,
      layout: {
        title: `Not found — ${ctx.siteName}`,
        navItems,
        description: "This page doesn't exist.",
        seo: { noIndex: true },
        tenantId: ctx.tenantId,
        urlPrefix: ctx.urlPrefix,
        siteUrl: ctx.siteUrl,
        brandHref: ctx.brandHref,
        loginHref: ctx.loginHref,
        apiBase: ctx.apiBase,
        siteName: ctx.siteName,
        siteTagline: ctx.siteTagline,
        avatarColor: ctx.avatarColor,
        ...menu,
      },
    };
  }

  // The redacted page shadows the raw one from here on, so the rendered body,
  // `layout.page` (and through it og:image) and anything a caller reads off the
  // view are all safe without any of them knowing about paywalls.
  const gate = await getReadableContent(db, rawPage, ctx.tenantId, viewer.member, {
    isOwner: viewer.isOwner,
    previewAs: viewer.previewAs,
  });
  const page = gate.page;

  if (response && requiresPrivateCache(rawPage, gate.decision)) {
    response.headers.set("Cache-Control", "private, no-store");
  }

  // An author's opt-out travels with the page, so it is set here rather than in
  // each route that happens to render one. A surface that wants a broader rule
  // (the draft preview asks for `noindex` as well) sets its own header after
  // this call and overwrites it.
  if (response && rawPage.seo?.noAiTraining) {
    response.headers.set("X-Robots-Tag", "noai, noimageai");
  }

  // Post stats drive the hero's shape, and the hero is a front-page thing.
  const stats = target.kind === "home" ? await getPostStats(db, ctx.tenantId) : null;

  const bodyHtml = page.content.trim()
    ? await renderContent(db, page.content, ctx.tenantId, ctx.urlPrefix, {
        // The home page's title is chrome the layout draws, so its body owns
        // its own heading levels; every other page has an <h1> above it.
        pageTitle: target.kind === "home" ? undefined : page.title,
        template,
        postList: {
          isOwner: viewer.isOwner,
          siteName: ctx.siteName,
          spaceNoun: ctx.spaceNoun,
          composeHref: ctx.composeHref,
          manifestoHref: ctx.manifestoHref,
          feedHref: ctx.feedHref,
        },
      })
    : "";

  return {
    page,
    kind: target.kind,
    template,
    bodyHtml,
    decision: gate.decision,
    gated: gate.gated,
    teaser: gate.gated && gate.decision.visibility === "teaser",
    signedIn: viewer.member !== null,
    isOwner: viewer.isOwner,
    layout: {
      // A home page has no title of its own — the site's name is its name, and
      // taking it from the context keeps the browser tab agreeing with the
      // header even after the owner renames the site.
      title: target.kind === "home" ? ctx.siteName : `${page.title} — ${ctx.siteName}`,
      navItems,
      activePageId: page.id,
      scripts: page.scripts,
      description: page.seo?.metaDescription || page.excerpt,
      pathname: pagePath(page, ctx.urlPrefix),
      ogType: target.kind === "home" ? "website" : target.kind === "post" ? "article" : undefined,
      isHome: target.kind === "home",
      seo: page.seo,
      page,
      tenantId: ctx.tenantId,
      urlPrefix: ctx.urlPrefix,
      siteUrl: ctx.siteUrl,
      brandHref: ctx.brandHref,
      loginHref: ctx.loginHref,
      apiBase: ctx.apiBase,
      siteName: ctx.siteName,
      siteTagline: ctx.siteTagline,
      heroEyebrow: ctx.heroEyebrow,
      heroMonogram: stats ? stats.total > 0 : undefined,
      heroMeta: stats ? heroMetaLine(stats) : undefined,
      avatarColor: ctx.avatarColor,
      ...menu,
    },
  };
}
