import { Hono } from "hono";
import type { Context } from "hono";
import { getFederationConfig } from "./config.js";
import { buildAuthorizeUrl, exchangeCodeForIdentity } from "./client.js";
import {
  buildClearFederatedSessionCookie,
  buildClearStateCookie,
  buildFederatedSessionCookie,
  buildStateCookie,
  generateState,
  getStateData,
} from "./auth.js";

export interface FederatedAuthRouterOptions {
  /** URL prefix this host is mounted under (multi-tenant hosts). Default "". */
  urlPrefix?: string;
}

/** Only allow same-site redirect targets. */
function safeNext(next: string | undefined, fallback: string): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return fallback;
}

/**
 * Federation sign-in routes for an auxiliary space. Mount at /api so paths are
 * `/api/federation/{login,callback,logout}`. Delegates authentication to the
 * configured community hub via the OAuth2 authorization-code flow and stores
 * the result in a signed federated member session cookie.
 */
export function createFederatedAuthRoutes(
  options: FederatedAuthRouterOptions = {}
): Hono {
  const urlPrefix = options.urlPrefix ?? "";
  const home = urlPrefix || "/";
  const app = new Hono();

  // The redirect URI must exactly match what the space registered on the hub.
  function callbackUrl(c: Context): string {
    const url = new URL(c.req.url);
    return `${url.origin}${urlPrefix}/api/federation/callback`;
  }

  app.get("/federation/login", (c) => {
    const config = getFederationConfig();
    if (!config) return c.text("Federation not configured", 404);

    const state = generateState();
    const next = safeNext(c.req.query("next"), home);
    c.header("Set-Cookie", buildStateCookie({ state, next }));

    return c.redirect(
      buildAuthorizeUrl(config, { state, redirectUri: callbackUrl(c) })
    );
  });

  app.get("/federation/callback", async (c) => {
    const config = getFederationConfig();
    if (!config) return c.text("Federation not configured", 404);

    // Clear the state cookie regardless of outcome.
    c.header("Set-Cookie", buildClearStateCookie());

    if (c.req.query("error")) {
      return c.redirect(home);
    }

    const code = c.req.query("code");
    const returnedState = c.req.query("state");
    const stateData = getStateData(c.req.raw);

    if (
      !code ||
      !returnedState ||
      !stateData ||
      returnedState !== stateData.state
    ) {
      return c.text("Invalid federation callback", 400);
    }

    const identity = await exchangeCodeForIdentity(config, {
      code,
      redirectUri: callbackUrl(c),
    });
    if (!identity) return c.text("Federation sign-in failed", 401);

    c.header("Set-Cookie", buildFederatedSessionCookie(identity), {
      append: true,
    });
    return c.redirect(safeNext(stateData.next, home));
  });

  app.post("/federation/logout", (c) => {
    c.header("Set-Cookie", buildClearFederatedSessionCookie());
    return c.redirect(home);
  });

  return app;
}
