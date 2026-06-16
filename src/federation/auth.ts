import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import type { MemberIdentity, ResolveMember } from "../community/types.js";

const SESSION_COOKIE = "federated_member_session";
const STATE_COOKIE = "federation_oauth_state";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds
const STATE_MAX_AGE = 60 * 10; // 10 minutes in seconds

// Without an explicit secret, sessions are signed with an ephemeral key and
// won't survive a restart — fine for trying things out, not for production.
const SIGN_KEY =
  process.env.FEDERATION_SESSION_SECRET ||
  process.env.MEMBER_SESSION_SECRET ||
  randomBytes(32).toString("hex");

// --- Signed-token helpers (HMAC over a base64url JSON payload) ---

function signValue(value: string): string {
  const mac = createHmac("sha256", SIGN_KEY).update(value).digest("hex");
  return `${value}.${mac}`;
}

function verifyValue(token: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const value = token.slice(0, idx);
  const expected = signValue(value);
  if (token.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return null;
  return value;
}

function pack(obj: unknown): string {
  const json = Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  return signValue(json);
}

function unpack<T>(token: string): T | null {
  const value = verifyValue(token);
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function secureFlag(): string {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

// --- Federated member session ---

interface SessionData {
  issuer: string;
  subject: string;
  displayName: string;
  exp: number;
}

/** Build a Set-Cookie header value creating a federated member session. */
export function buildFederatedSessionCookie(identity: MemberIdentity): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const token = pack({
    issuer: identity.issuer,
    subject: identity.subject,
    displayName: identity.displayName,
    exp,
  } satisfies SessionData);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax${secureFlag()}`;
}

/** Build a Set-Cookie header value clearing the federated member session. */
export function buildClearFederatedSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secureFlag()}`;
}

/** Resolve the federated member identity from a request, or null. */
export function getFederatedMemberIdentity(
  req: Request
): MemberIdentity | null {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const data = unpack<SessionData>(token);
  if (!data) return null;
  if (
    typeof data.issuer !== "string" ||
    typeof data.subject !== "string" ||
    typeof data.displayName !== "string" ||
    typeof data.exp !== "number"
  ) {
    return null;
  }
  if (data.exp * 1000 < Date.now()) return null;
  return {
    issuer: data.issuer,
    subject: data.subject,
    displayName: data.displayName,
  };
}

/** ResolveMember backed by a federated (hub) session. */
export function resolveFederatedMember(): ResolveMember {
  return (c: Context) => Promise.resolve(getFederatedMemberIdentity(c.req.raw));
}

// --- OAuth state (CSRF) + post-login redirect target ---

interface StateData {
  state: string;
  next: string;
}

export function generateState(): string {
  return randomBytes(16).toString("hex");
}

/** Build a Set-Cookie value holding the signed CSRF state and next target. */
export function buildStateCookie(data: StateData): string {
  const token = pack(data);
  return `${STATE_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${STATE_MAX_AGE}; SameSite=Lax${secureFlag()}`;
}

export function buildClearStateCookie(): string {
  return `${STATE_COOKIE}=; HttpOnly; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secureFlag()}`;
}

export function getStateData(req: Request): StateData | null {
  const token = readCookie(req, STATE_COOKIE);
  if (!token) return null;
  const data = unpack<StateData>(token);
  if (!data || typeof data.state !== "string") return null;
  return { state: data.state, next: typeof data.next === "string" ? data.next : "" };
}
