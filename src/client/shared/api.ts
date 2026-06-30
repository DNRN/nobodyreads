// Shared fetch helpers for the progressive-enhancement widgets. Both the
// community (join/like) and comments widgets read the same /membership
// endpoint and talk to the same JSON API, so the request plumbing lives here.

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  body: T | null;
}

export async function request<T = unknown>(
  url: string,
  method: string = "GET",
  jsonBody?: unknown,
): Promise<ApiResult<T>> {
  const opts: RequestInit = {
    method,
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  };
  if (jsonBody !== undefined) {
    opts.headers = {
      ...opts.headers,
      "Content-Type": "application/json",
    };
    opts.body = JSON.stringify(jsonBody);
  }
  const res = await fetch(url, opts);
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    /* non-JSON response */
  }
  return { ok: res.ok, status: res.status, body };
}

/** Build a login URL that returns the visitor to the current page. */
export function loginUrl(loginHref: string): string {
  const sep = loginHref.indexOf("?") >= 0 ? "&" : "?";
  return loginHref + sep + "next=" + encodeURIComponent(location.pathname);
}

/**
 * Run `start` on initial load and after every Astro client-side navigation.
 * The widgets are idempotent per-element (they mark roots with data-nb-init),
 * so re-running on `astro:page-load` is safe.
 */
export function onReady(start: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
  document.addEventListener("astro:page-load", start);
}

/** Inject a <style> block once, keyed by id. */
export function injectStyles(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}
