import type { SiteTemplateDefinition } from "../template/types.js";

/**
 * The draft preview's reload loop.
 *
 * The design editor patches CSS into its iframe directly, but a structural
 * change has to come back from the server. Rather than have the editor reach
 * into the frame, the previewed page polls its own revision id and reloads when
 * it moves — so a save made in any tab, by any means, lands here.
 *
 * Inlined as source text because it runs inside the previewed document, which
 * is rendered from the author's own theme and carries no bundler entry.
 */
export function autoReloadScript(options: {
  /** Revision this document was rendered from; null before the first save. */
  revisionId: number | null;
  /** Where to poll, e.g. `/preview/revision.json`. */
  endpoint: string;
  /** Where to send a viewer whose session has expired. */
  loginHref: string;
}): string {
  return `(() => {
  let currentRevisionId = ${options.revisionId ?? "null"};
  const pollIntervalMs = 1500;
  const endpoint = ${JSON.stringify(options.endpoint)};

  const schedule = () => window.setTimeout(check, pollIntervalMs);

  async function check() {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (response.status === 401) {
        window.location.assign(${JSON.stringify(options.loginHref)});
        return;
      }

      if (!response.ok) {
        schedule();
        return;
      }

      const data = await response.json();
      const nextRevisionId = typeof data.revisionId === "number" ? data.revisionId : null;
      if (nextRevisionId !== currentRevisionId) {
        window.location.reload();
        return;
      }
    } catch {
      // Keep polling even on transient network/runtime errors.
    }

    schedule();
  }

  schedule();
})();`;
}

/**
 * A template the design editor is holding but has not saved, sent with the
 * request that renders it.
 *
 * The editor patches the preview's stylesheet in place while an author drags a
 * colour, which is honest for anything `generateCss` fully describes and a lie
 * for anything else: a hero switched off, a different post arrangement, edited
 * layout HTML. Those need the page built again, so the editor posts the
 * in-flight template to this surface and the answer is a real render of it.
 *
 * Request-scoped on purpose. Nothing is stored, so there is no slot to expire,
 * nothing to key by session, no way for one tab's unsaved experiment to reach
 * another reader, and no behaviour that depends on which instance answered. The
 * route is owner-only, so the only person who can post a template is the person
 * already allowed to save one.
 */
export async function readScratchTemplate(
  request: Request,
): Promise<SiteTemplateDefinition | null> {
  if (request.method !== "POST") return null;

  const form = await request.formData().catch(() => null);
  const raw = form?.get("template");
  if (typeof raw !== "string" || !raw.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // The layout reads `tokens.light` without guarding, so a half-formed body
  // would take the page down rather than showing the previous render.
  const tokens = (parsed as { tokens?: { light?: unknown } } | null)?.tokens;
  if (!tokens || typeof tokens !== "object" || !tokens.light) return null;

  return parsed as SiteTemplateDefinition;
}
