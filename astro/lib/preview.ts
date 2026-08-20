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
