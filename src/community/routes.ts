import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { DEFAULT_TENANT_ID } from "../shared/types.js";
import type { Database } from "../db/index.js";
import { getPageBySlug } from "../content/db.js";
import {
  memberLoginFormSchema,
  memberSignupFormSchema,
} from "../db/validation.js";
import {
  countPostLikes,
  countSpaceMembers,
  createMember,
  hasLikedPost,
  isSpaceMember,
  joinSpace,
  leaveSpace,
  likePost,
  unlikePost,
  verifyMemberCredentials,
} from "./db.js";
import {
  buildClearMemberSessionCookie,
  buildMemberSessionCookie,
} from "./auth.js";
import type { ResolveMember } from "./types.js";

// --- Member auth routes (local accounts; self-hosted mode) ---

export interface MemberAuthRouterOptions {
  db: Database;
  urlPrefix?: string;
}

/** Only allow same-site redirect targets. */
function safeNext(next: string | undefined, fallback: string): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return fallback;
}

/**
 * Local member signup/login/logout. Mount at /api in self-hosted mode.
 * Multi-tenant hosts use their own account system and skip these routes.
 *
 * Routes:
 *   POST /members/signup — create account + session
 *   POST /members/login  — create session
 *   POST /members/logout — clear session
 */
export function createMemberAuthRoutes(
  options: MemberAuthRouterOptions
): Hono {
  const { db } = options;
  const urlPrefix = options.urlPrefix ?? "";
  const home = urlPrefix || "/";

  const app = new Hono();

  app.post(
    "/members/signup",
    zValidator("form", memberSignupFormSchema, (result, c) => {
      if (!result.success) {
        return c.redirect(`${urlPrefix}/signup?error=invalid`);
      }
    }),
    async (c) => {
      const form = c.req.valid("form");
      const created = await createMember(db, {
        email: form.email,
        password: form.password,
        displayName: form.display_name,
      });
      if (!created) {
        return c.redirect(`${urlPrefix}/signup?error=exists`);
      }
      c.header("Set-Cookie", buildMemberSessionCookie(created.memberId));
      return c.redirect(safeNext(form.next, home));
    }
  );

  app.post(
    "/members/login",
    zValidator("form", memberLoginFormSchema, (result, c) => {
      if (!result.success) {
        return c.redirect(`${urlPrefix}/login?error=invalid`);
      }
    }),
    async (c) => {
      const form = c.req.valid("form");
      const record = await verifyMemberCredentials(
        db,
        form.email,
        form.password
      );
      if (!record) {
        return c.redirect(`${urlPrefix}/login?error=invalid`);
      }
      c.header("Set-Cookie", buildMemberSessionCookie(record.memberId));
      return c.redirect(safeNext(form.next, home));
    }
  );

  app.post("/members/logout", (c) => {
    c.header("Set-Cookie", buildClearMemberSessionCookie());
    return c.redirect(home);
  });

  return app;
}

// --- Community routes (join/leave/likes) ---

export interface CommunityRouterOptions {
  db: Database;
  tenantId?: string;
  urlPrefix?: string;
  /** Maps the request to the current member; hosts plug in their own auth. */
  resolveMember: ResolveMember;
}

/**
 * Space membership + post like routes. Mount at /api.
 *
 * Routes:
 *   GET  /membership          — current member + joined state
 *   POST /join                — join this space
 *   POST /leave               — leave this space
 *   GET  /posts/:slug/likes   — like count + likedByMe
 *   POST /posts/:slug/like    — like a post (members only)
 *   POST /posts/:slug/unlike  — remove a like
 */
export function createCommunityRoutes(options: CommunityRouterOptions): Hono {
  const { db, resolveMember } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;

  const app = new Hono();

  app.get("/membership", async (c) => {
    const identity = await resolveMember(c);
    const joined = identity
      ? await isSpaceMember(db, tenantId, identity)
      : false;
    return c.json({
      member: identity
        ? { issuer: identity.issuer, displayName: identity.displayName }
        : null,
      joined,
      memberCount: await countSpaceMembers(db, tenantId),
    });
  });

  app.post("/join", async (c) => {
    const identity = await resolveMember(c);
    if (!identity) return c.json({ error: "unauthorized" }, 401);
    await joinSpace(db, tenantId, identity);
    return c.json({ joined: true });
  });

  app.post("/leave", async (c) => {
    const identity = await resolveMember(c);
    if (!identity) return c.json({ error: "unauthorized" }, 401);
    await leaveSpace(db, tenantId, identity);
    return c.json({ joined: false });
  });

  app.get("/posts/:slug/likes", async (c) => {
    const post = await getPageBySlug(db, c.req.param("slug"), "post", tenantId);
    if (!post) return c.json({ error: "not_found" }, 404);
    const identity = await resolveMember(c);
    return c.json({
      count: await countPostLikes(db, tenantId, post.id),
      likedByMe: identity
        ? await hasLikedPost(db, tenantId, post.id, identity)
        : false,
    });
  });

  app.post("/posts/:slug/like", async (c) => {
    const post = await getPageBySlug(db, c.req.param("slug"), "post", tenantId);
    if (!post) return c.json({ error: "not_found" }, 404);
    const identity = await resolveMember(c);
    if (!identity) return c.json({ error: "unauthorized" }, 401);
    if (!(await isSpaceMember(db, tenantId, identity))) {
      return c.json({ error: "not_member" }, 403);
    }
    await likePost(db, tenantId, post.id, identity);
    return c.json({
      count: await countPostLikes(db, tenantId, post.id),
      likedByMe: true,
    });
  });

  app.post("/posts/:slug/unlike", async (c) => {
    const post = await getPageBySlug(db, c.req.param("slug"), "post", tenantId);
    if (!post) return c.json({ error: "not_found" }, 404);
    const identity = await resolveMember(c);
    if (!identity) return c.json({ error: "unauthorized" }, 401);
    await unlikePost(db, tenantId, post.id, identity);
    return c.json({
      count: await countPostLikes(db, tenantId, post.id),
      likedByMe: false,
    });
  });

  return app;
}
