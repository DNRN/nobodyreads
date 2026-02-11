import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

// --- Configuration ---

const EDITOR_PASSWORD = process.env.EDITOR_PASSWORD || "";
const COOKIE_NAME = "editor_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

// Use EDITOR_PASSWORD itself as the signing key (only exists when password is set)
const SIGN_KEY = EDITOR_PASSWORD;

// --- Token helpers ---

function sign(payload: string): string {
  const mac = createHmac("sha256", SIGN_KEY).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

function verify(token: string): boolean {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 0) return false;
  const payload = token.slice(0, dotIdx);
  const expected = sign(payload);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// --- Public API ---

/** Returns true if the editor requires a password (EDITOR_PASSWORD is set). */
export function editorRequiresAuth(): boolean {
  return EDITOR_PASSWORD.length > 0;
}

function extractCookieHeader(req: IncomingMessage | Request): string | undefined {
  const anyReq = req as Request;
  if (typeof anyReq.headers?.get === "function") {
    return anyReq.headers.get("cookie") ?? undefined;
  }
  const nodeReq = req as IncomingMessage;
  return nodeReq.headers.cookie;
}

function isAuthenticatedWithCookie(cookie?: string): boolean {
  if (!editorRequiresAuth()) return true; // No password = open access
  if (!cookie) return false;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  return verify(decodeURIComponent(match[1]));
}

/** Check if the request has a valid editor session. */
export function isAuthenticated(req: IncomingMessage): boolean {
  return isAuthenticatedWithCookie(extractCookieHeader(req));
}

/** Check if a Fetch Request has a valid editor session. */
export function isAuthenticatedRequest(req: Request): boolean {
  return isAuthenticatedWithCookie(extractCookieHeader(req));
}

/** Set the editor session cookie after successful login. */
export function createEditorSession(
  res: ServerResponse,
  cookiePath: string = "/admin"
): void {
  const token = sign(`editor:${Date.now()}`);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=${cookiePath}; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`
  );
}

/** Clear the editor session cookie. */
export function clearEditorSession(
  res: ServerResponse,
  cookiePath: string = "/admin"
): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const expires = "; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  const paths = new Set([cookiePath, "/admin", "/admin/editor", "/editor", "/"]);
  const cookies = Array.from(paths).map(
    (path) =>
      `${COOKIE_NAME}=; HttpOnly; Path=${path}; Max-Age=0${expires}; SameSite=Lax${secure}`
  );
  res.setHeader("Set-Cookie", cookies);
}

/** Verify the provided password against EDITOR_PASSWORD. */
export function verifyEditorPassword(password: string): boolean {
  if (!EDITOR_PASSWORD) return false;
  // Constant-time comparison
  if (password.length !== EDITOR_PASSWORD.length) return false;
  return timingSafeEqual(Buffer.from(password), Buffer.from(EDITOR_PASSWORD));
}
