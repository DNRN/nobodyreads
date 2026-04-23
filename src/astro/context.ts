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
  };
}
