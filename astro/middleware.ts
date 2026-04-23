import { defineMiddleware } from "astro:middleware";
import { DEFAULT_TENANT_ID } from "../src/shared/types.js";
import {
  isAuthenticatedRequest,
  editorRequiresAuth,
} from "../src/admin/server/auth.js";
import {
  ADMIN_CONTEXT_LOCALS_KEY,
  makeAdminContext,
} from "../src/astro/context.js";

const LOGIN_PATH = "/admin/login";

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = new URL(context.request.url).pathname;
  if (!isAdminPath(pathname)) return next();

  // The login page must render even when the user isn't authenticated.
  if (pathname === LOGIN_PATH) return next();

  if (editorRequiresAuth() && !isAuthenticatedRequest(context.request)) {
    return context.redirect(LOGIN_PATH);
  }

  (context.locals as Record<string, unknown>)[ADMIN_CONTEXT_LOCALS_KEY] =
    makeAdminContext({
      tenantId: DEFAULT_TENANT_ID,
      adminBase: "/admin",
      siteBase: "/",
      loginHref: LOGIN_PATH,
    });
  return next();
});

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
