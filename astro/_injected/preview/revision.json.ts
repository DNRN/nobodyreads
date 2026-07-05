import type { APIRoute } from "astro";
import { getAdminContext } from "nobodyreads/astro/context";
import { initDb, getLatestSiteTemplateRevisionId } from "nobodyreads";

/**
 * Poll endpoint backing the preview auto-reload. Tenant + auth come from the
 * host-populated admin context; a missing context means the host middleware
 * didn't authorize this request, so we treat it as unauthorized (the client
 * redirects to login on 401).
 */
export const GET: APIRoute = async ({ locals }) => {
  const ctx = getAdminContext(locals as Record<string, unknown>);
  if (!ctx) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = await initDb();
  const revisionId = await getLatestSiteTemplateRevisionId(db, ctx.tenantId);

  return new Response(JSON.stringify({ revisionId }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noai, noimageai",
    },
  });
};
