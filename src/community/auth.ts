import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Database } from "../db/index.js";
import { getMemberById } from "./db.js";
import { LOCAL_MEMBER_ISSUER } from "./types.js";
import type { MemberIdentity, ResolveMember } from "./types.js";

const COOKIE_NAME = "member_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds

// Without an explicit secret, sessions are signed with an ephemeral key and
// won't survive a server restart — fine for trying things out, not for prod.
const SIGN_KEY =
  process.env.MEMBER_SESSION_SECRET || randomBytes(32).toString("hex");

function sign(payload: string): string {
  const mac = createHmac("sha256", SIGN_KEY).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

/** Verify a token and return its payload, or null when invalid. */
function verify(token: string): string | null {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 0) return null;
  const payload = token.slice(0, dotIdx);
  const expected = sign(payload);
  if (token.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return null;
  return payload;
}

/** Extract the member id from a request's session cookie, or null. */
export function getMemberIdFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const payload = verify(decodeURIComponent(match[1]));
  if (!payload) return null;

  const sepIdx = payload.lastIndexOf(":");
  if (sepIdx < 0) return null;
  const memberId = payload.slice(0, sepIdx);
  const expires = parseInt(payload.slice(sepIdx + 1), 10);
  if (!memberId || !Number.isFinite(expires)) return null;
  if (expires * 1000 < Date.now()) return null;
  return memberId;
}

/** Build a Set-Cookie header value creating a member session. */
export function buildMemberSessionCookie(memberId: string): string {
  const expires = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE;
  const token = sign(`${memberId}:${expires}`);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

/** Build a Set-Cookie header value clearing the member session. */
export function buildClearMemberSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secure}`;
}

/** Resolve the local-account member identity for a request, or null. */
export async function getLocalMemberIdentity(
  db: Database,
  req: Request
): Promise<MemberIdentity | null> {
  const memberId = getMemberIdFromRequest(req);
  if (!memberId) return null;
  const record = await getMemberById(db, memberId);
  if (!record) return null;
  return {
    issuer: LOCAL_MEMBER_ISSUER,
    subject: record.memberId,
    displayName: record.displayName || record.email,
  };
}

/**
 * ResolveMember backed by local member accounts (self-hosted mode).
 * Multi-tenant hosts supply their own resolver instead.
 */
export function resolveLocalMember(db: Database): ResolveMember {
  return (c) => getLocalMemberIdentity(db, c.req.raw);
}

/**
 * Combine multiple resolvers; the first one that returns an identity wins.
 * Useful for layering sign-in methods (e.g. local accounts + federated).
 */
export function combineResolvers(...resolvers: ResolveMember[]): ResolveMember {
  return async (c) => {
    for (const resolve of resolvers) {
      const identity = await resolve(c);
      if (identity) return identity;
    }
    return null;
  };
}
