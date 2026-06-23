import { Hono } from "hono";
import type { Context } from "hono";
import type { Database } from "../db/index.js";
import type { ResolveMember } from "../community/types.js";
import type { EmailResolvable } from "../subscription/email.js";
import { createCommunityRoutes, createMemberAuthRoutes } from "../community/routes.js";
import { createCommentRoutes } from "../comments/routes.js";
import { createSubscriptionApiRoutes } from "../subscription/index.js";
import { createFederatedAuthRoutes } from "../federation/routes.js";

export interface InterfaceApiOptions {
  db: Database;
  tenantId?: string;
  urlPrefix?: string;
  /** Maps a request to the current member; hosts plug in their own auth. */
  resolveMember: ResolveMember;
  /** Per-tenant email config for subscription confirmations. */
  email?: EmailResolvable;
  siteUrl?: string;
  siteName?: string;
  /** Mount local member signup/login (self-hosted mode). Default false. */
  enableMemberAuth?: boolean;
  /** Mount federated sign-in routes (auxiliary plots). Default false. */
  enableFederation?: boolean;
  /** Comment submissions allowed per member per minute. Default 5. */
  commentRateLimitPerMinute?: number;
  /** Returns true when the requester may remove any comment (post owner/admin). */
  canModerateComments?: (c: Context) => boolean | Promise<boolean>;
}

/**
 * Interface API group — the member-facing surface (identity-aware actions and
 * the reads that back them). Mount at `/api`. Composes community, comments,
 * subscriptions and, optionally, sign-in routes into one app.
 *
 * GET endpoints here (membership state, like counts, comment threads) stay
 * publicly readable; only the mutating routes require an identity.
 */
export function createInterfaceApiRoutes(options: InterfaceApiOptions): Hono {
  const { db, tenantId, urlPrefix, resolveMember, email, siteUrl, siteName } =
    options;

  const app = new Hono();

  app.route("/", createCommunityRoutes({ db, tenantId, urlPrefix, resolveMember }));

  app.route(
    "/",
    createCommentRoutes({
      db,
      tenantId,
      urlPrefix,
      resolveMember,
      rateLimitPerMinute: options.commentRateLimitPerMinute,
      canModerate: options.canModerateComments,
    })
  );

  app.route(
    "/",
    createSubscriptionApiRoutes({ db, tenantId, urlPrefix, email, siteUrl, siteName })
  );

  if (options.enableMemberAuth) {
    app.route("/", createMemberAuthRoutes({ db, urlPrefix }));
  }

  if (options.enableFederation) {
    app.route("/", createFederatedAuthRoutes({ urlPrefix }));
  }

  return app;
}
