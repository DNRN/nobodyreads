import type { APIRoute } from "astro";
import { getDbClient } from "../../lib/db.js";
import { guardAuth } from "../../../src/admin/server/auth.js";
import { DEFAULT_TENANT_ID } from "../../../src/shared/types.js";
import { getLatestSiteTemplateRevisionId } from "../../../src/shared/site-bundle.js";

export const GET: APIRoute = async ({ request }) => {
  if (guardAuth(request)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  const tenantId = process.env.TENANT_ID || DEFAULT_TENANT_ID;
  const db = await getDbClient();
  const revisionId = await getLatestSiteTemplateRevisionId(db, tenantId);

  return new Response(JSON.stringify({ revisionId }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noai, noimageai",
    },
  });
};
