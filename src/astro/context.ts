import type { SiteContext } from "../render/context.js";
import { POST_FORMATS } from "../content/formats.js";

/**
 * Runtime context for the injected admin pages.
 *
 * The host Astro app is responsible for populating this on `Astro.locals` via
 * an Astro middleware. The admin pages only read from it — they never resolve
 * tenants or sessions themselves, which is what makes the admin UI reusable
 * across single-tenant (`/admin`) and multi-tenant (`/{nickname}/admin`) apps.
 */
export interface NobodyreadsAdminContext {
  /** Tenant id to operate on (e.g. DEFAULT_TENANT_ID for single-tenant). */
  tenantId: string;
  /** Absolute URL prefix for admin pages, no trailing slash. */
  adminBase: string;
  /** Absolute URL prefix for editor mutation endpoints. */
  editorBase: string;
  /** Absolute URL prefix for the public site ("View site" link). */
  siteBase: string;
  /** Where to send users to sign in when their session is missing/invalid. */
  loginHref: string;
  /**
   * Where the "Sign out" button should POST. Defaults to `${adminBase}/logout`,
   * the package's own `EDITOR_PASSWORD`-session endpoint. A host with its own
   * session mechanism (e.g. a platform-wide cookie) sets this to its real
   * logout route so the button actually signs the user out instead of clearing
   * a cookie the host never issued.
   */
  logoutHref?: string;
  /** Whether AI theming is configured for this host (shows/hides the AI panel). */
  aiEnabled?: boolean;
  /**
   * Whether payments are configured for this host (shows/hides the Payments
   * panel). Presentation only — never a gate. Access is decided server-side by
   * `resolvePageAccess` on every render.
   */
  paymentsEnabled?: boolean;
  /**
   * Where the host manages payouts and pricing, if it does so itself.
   *
   * A platform that is merchant of record has rules the package cannot know
   * about — a price floor, a Connect account that must exist first — so when
   * this is set the admin payments screen defers pricing to the host instead of
   * offering a second form with weaker validation. A self-hoster leaves it
   * unset and keeps the built-in form.
   */
  payoutSettingsHref?: string;
  /**
   * Human-readable site/plot name for branding (page titles etc.). Optional so
   * single-tenant hosts can fall back to a build-time default; multi-tenant
   * hosts pass the tenant's display name.
   */
  siteName?: string;
  /**
   * Where the admin header's wordmark links to. Defaults to `adminBase` (the
   * dashboard's own root) for a self-hosted, single-tenant deployment that has
   * no wider platform to point back to. A multi-tenant host sets this to its
   * own apex/home so the wordmark acts as a "back to the central hub" link
   * instead of duplicating the sidebar's Dashboard item.
   */
  homeUrl?: string;
  /**
   * Sidebar links the host contributes for pages it serves itself (a
   * platform's account settings, say). Each joins the named engine group,
   * after the engine's own items. The engine only links — the host renders
   * and authorizes those pages.
   */
  hostNav?: AdminHostNavItem[];
}

/** A sidebar link contributed by the host. See `hostNav`. */
export interface AdminHostNavItem {
  group: "audience" | "settings";
  label: string;
  href: string;
  /** Inner markup of a 24×24 stroke icon; a generic glyph when omitted. */
  icon?: string;
}

export const ADMIN_CONTEXT_LOCALS_KEY = "nobodyreadsAdmin" as const;

/**
 * Read the admin context from an Astro locals bag. Returns `undefined` if the
 * host app hasn't registered the populating middleware.
 */
export function getAdminContext(
  locals: Record<string, unknown> | undefined | null
): NobodyreadsAdminContext | undefined {
  if (!locals) return undefined;
  const value = (locals as Record<string, unknown>)[ADMIN_CONTEXT_LOCALS_KEY];
  return (value ?? undefined) as NobodyreadsAdminContext | undefined;
}

/**
 * Read the admin context or throw if missing. Pages should call this to fail
 * fast during development if the host app forgot to install the middleware.
 */
export function requireAdminContext(
  locals: Record<string, unknown> | undefined | null
): NobodyreadsAdminContext {
  const ctx = getAdminContext(locals);
  if (!ctx) {
    throw new Error(
      "nobodyreads admin context is not set on Astro.locals. " +
        "Install a middleware that populates Astro.locals.nobodyreadsAdmin " +
        "before the request reaches any injected admin page."
    );
  }
  return ctx;
}

/**
 * Convenience factory for constructing a context object. Derives `editorBase`
 * from `adminBase` when not provided.
 */
export function makeAdminContext(
  input: Omit<NobodyreadsAdminContext, "editorBase"> & { editorBase?: string }
): NobodyreadsAdminContext {
  const adminBase = input.adminBase.replace(/\/$/, "");
  return {
    tenantId: input.tenantId,
    adminBase,
    editorBase: input.editorBase ?? `${adminBase}/editor`,
    siteBase: input.siteBase,
    loginHref: input.loginHref,
    logoutHref: input.logoutHref,
    aiEnabled: input.aiEnabled,
    paymentsEnabled: input.paymentsEnabled,
    payoutSettingsHref: input.payoutSettingsHref,
    siteName: input.siteName,
    homeUrl: input.homeUrl ?? adminBase,
    hostNav: input.hostNav,
  };
}

// --- Admin navigation -----------------------------------------------------

export interface AdminNavItem {
  /** Stable key; the layout picks an icon by it. Host items use `host:<label>`. */
  id: string;
  label: string;
  href: string;
  badge?: string;
  /** Host-supplied icon markup (see `AdminHostNavItem.icon`). */
  icon?: string;
  active: boolean;
}

export interface AdminNavGroup {
  id: "create" | "audience" | "settings";
  /** Section heading; the first group has none. */
  label: string | null;
  items: AdminNavItem[];
}

/** Where the request is, for highlighting the current nav item. */
export interface AdminNavLocation {
  pathname: string;
  search?: string;
  /**
   * The href of the item this page belongs to, overriding URL matching — for
   * pages whose URL does not say which section they are in (the editor's
   * `/editor/:id` holds a post or a page).
   */
  activeHref?: string;
}

/** The content list, optionally filtered to one kind. */
export function contentListHref(adminBase: string, kind?: "post" | "page"): string {
  return kind ? `${adminBase}/editor?kind=${kind}` : `${adminBase}/editor`;
}

/**
 * The admin sidebar: engine sections, then host items appended to their
 * group, with exactly one item marked active (the most specific match).
 */
export function buildAdminNav(
  ctx: Pick<NobodyreadsAdminContext, "adminBase" | "aiEnabled" | "paymentsEnabled" | "hostNav">,
  at: AdminNavLocation
): AdminNavGroup[] {
  const base = ctx.adminBase;
  const host = (group: AdminHostNavItem["group"]) =>
    (ctx.hostNav ?? [])
      .filter((h) => h.group === group)
      .map((h) => ({ id: `host:${h.label}`, label: h.label, href: h.href, icon: h.icon }));

  const groups: { id: AdminNavGroup["id"]; label: string | null; items: Omit<AdminNavItem, "active">[] }[] = [
    {
      id: "create",
      label: null,
      items: [
        { id: "dashboard", label: "Dashboard", href: base },
        { id: "posts", label: "Posts", href: contentListHref(base, "post") },
        { id: "pages", label: "Pages", href: contentListHref(base, "page") },
        { id: "media", label: "Media", href: `${base}/media` },
        { id: "collections", label: "Collections", href: `${base}/collections` },
      ],
    },
    {
      id: "audience",
      label: "Audience",
      items: [
        { id: "subscribers", label: "Subscribers", href: `${base}/community` },
        { id: "comments", label: "Comments", href: `${base}/moderation` },
        ...(ctx.paymentsEnabled ? [{ id: "earnings", label: "Earnings", href: `${base}/payments` }] : []),
        ...host("audience"),
      ],
    },
    {
      id: "settings",
      label: "Settings",
      items: [
        { id: "design", label: "Design", href: `${base}/layout`, badge: ctx.aiEnabled ? "AI" : undefined },
        { id: "site", label: "Site", href: `${base}/settings` },
        ...host("settings"),
      ],
    },
  ];

  const activeHref = at.activeHref ?? mostSpecificMatch(groups.flatMap((g) => g.items.map((i) => i.href)), base, at);
  return groups.map((g) => ({
    ...g,
    items: g.items.map((i) => ({ ...i, active: i.href === activeHref })),
  }));
}

/**
 * The href that best describes the current URL: an exact path whose query
 * params all match beats a path prefix, and a longer prefix beats a shorter
 * one. The dashboard root only ever matches exactly — it is a prefix of every
 * admin path.
 */
function mostSpecificMatch(hrefs: string[], adminBase: string, at: AdminNavLocation): string | undefined {
  const current = new URLSearchParams(at.search ?? "");
  const path = at.pathname.replace(/(.)\/$/, "$1");
  let best: string | undefined;
  let bestScore = -1;
  for (const href of hrefs) {
    const [hrefPath, query = ""] = href.split("?");
    let score = -1;
    if (query) {
      const wanted = new URLSearchParams(query);
      const all = [...wanted].every(([k, v]) => current.get(k) === v);
      if (path === hrefPath && all) score = Number.MAX_SAFE_INTEGER;
    } else if (path === hrefPath) {
      score = hrefPath.length + 1;
    } else if (hrefPath !== adminBase && path.startsWith(`${hrefPath}/`)) {
      score = hrefPath.length;
    }
    if (score > bestScore) {
      best = href;
      bestScore = score;
    }
  }
  return best;
}

// --- Create menu ----------------------------------------------------------

export interface AdminCreateItem {
  id: string;
  label: string;
  /** One line on what this makes, shown under the label. */
  hint: string;
  href: string;
  /** Draw a divider above this item (separates post formats from the rest). */
  separatorBefore?: boolean;
}

/**
 * The sidebar's "New post" split button: `primary` is the main click (a text
 * post); `items` fill its ▾ menu — every post format, then the rest.
 */
export function buildCreateMenu(
  ctx: Pick<NobodyreadsAdminContext, "adminBase" | "editorBase">
): { primary: AdminCreateItem; items: AdminCreateItem[] } {
  const formats: AdminCreateItem[] = POST_FORMATS.map((f) => ({
    id: f.id,
    label: f.createLabel,
    hint: f.createHint,
    href: f.id === "text" ? `${ctx.editorBase}/new` : `${ctx.editorBase}/new?format=${f.id}`,
  }));
  return {
    primary: formats[0],
    items: [
      ...formats,
      {
        id: "page",
        label: "Page",
        hint: "Standalone, like About — can sit in your menu",
        href: `${ctx.editorBase}/new?kind=page`,
        separatorBefore: true,
      },
      {
        id: "import",
        label: "Import…",
        hint: "Turn an existing site or document into drafts",
        href: `${ctx.adminBase}/import`,
      },
    ],
  };
}

// --- Site context ---------------------------------------------------------

/**
 * Where a host publishes the `SiteContext` for the site this request addresses.
 *
 * Same contract as the admin context above, for the render layer: the host
 * resolves which site is being served and what it is called, and the injected
 * pages only read. It is what lets the draft preview render a *hosted* site
 * faithfully — with that site's name, tagline, hero and account menu — from
 * pages that live inside this package and know nothing about tenants.
 *
 * Published for every request that addresses a site, not only owner-only ones:
 * a host's own public pages should read the same context the preview does, or
 * the two have already diverged.
 */
export const SITE_CONTEXT_LOCALS_KEY = "nobodyreadsSite" as const;

export function getSiteContext(
  locals: Record<string, unknown> | undefined | null
): SiteContext | undefined {
  if (!locals) return undefined;
  const value = (locals as Record<string, unknown>)[SITE_CONTEXT_LOCALS_KEY];
  return (value ?? undefined) as SiteContext | undefined;
}

/** Read the site context or throw, so a missing middleware fails loudly. */
export function requireSiteContext(
  locals: Record<string, unknown> | undefined | null
): SiteContext {
  const ctx = getSiteContext(locals);
  if (!ctx) {
    throw new Error(
      "nobodyreads site context is not set on Astro.locals. " +
        "Install a middleware that populates Astro.locals.nobodyreadsSite " +
        "before the request reaches any injected site page."
    );
  }
  return ctx;
}
