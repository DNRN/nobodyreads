import { createHmac, timingSafeEqual } from "node:crypto";

const EDITOR_PASSWORD = process.env.EDITOR_PASSWORD || "";
const COOKIE_NAME = "editor_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

const SIGN_KEY = EDITOR_PASSWORD;

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

/** Returns true if the editor requires a password (EDITOR_PASSWORD is set). */
export function editorRequiresAuth(): boolean {
  return EDITOR_PASSWORD.length > 0;
}

function isAuthenticatedWithCookie(cookie?: string): boolean {
  if (!editorRequiresAuth()) return true;
  if (!cookie) return false;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  return verify(decodeURIComponent(match[1]));
}

/** Check if a Fetch API Request has a valid editor session. Works with Hono and Astro. */
export function isAuthenticatedRequest(req: Request): boolean {
  return isAuthenticatedWithCookie(req.headers.get("cookie") ?? undefined);
}

/** Build Set-Cookie header value to create an editor session. */
export function buildSessionCookie(cookiePath: string = "/admin"): string {
  const token = sign(`editor:${Date.now()}`);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=${cookiePath}; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

/** Build Set-Cookie header values to clear the editor session across all known paths. */
export function buildClearSessionCookies(cookiePath: string = "/admin"): string[] {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const expires = "; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  const paths = new Set([cookiePath, "/admin", "/admin/editor", "/editor", "/"]);
  return Array.from(paths).map(
    (path) =>
      `${COOKIE_NAME}=; HttpOnly; Path=${path}; Max-Age=0${expires}; SameSite=Lax${secure}`
  );
}

/** Returns true if the request should be denied (not authenticated). */
export function guardAuth(request: Request): boolean {
  if (!editorRequiresAuth()) return false;
  return !isAuthenticatedRequest(request);
}

/** Verify the provided password against EDITOR_PASSWORD (constant-time). */
export function verifyEditorPassword(password: string): boolean {
  if (!EDITOR_PASSWORD) return false;
  if (password.length !== EDITOR_PASSWORD.length) return false;
  return timingSafeEqual(Buffer.from(password), Buffer.from(EDITOR_PASSWORD));
}
