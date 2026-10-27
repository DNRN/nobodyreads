import type { Database } from "../db/index.js";
import { claimNotification, getMediaById } from "../content/db.js";
import type { Page } from "../content/types.js";
import { countSubscribers } from "./db.js";
import { resolveEmailProvider } from "./email.js";
import { notifySubscribers, type NotifyOptions } from "./index.js";

/**
 * Email verified subscribers about a published post — at most once per post
 * (ADR 0002). The one entry point for every publishing path (admin editor,
 * `npm run post`), so none of them can re-send.
 *
 * Nothing is claimed when there is no way to send or no one to send to: the
 * post stays emailable later. Otherwise `claimNotification` decides — of two
 * concurrent callers exactly one wins.
 *
 * Returns null when nothing was sent; else the recorded timestamp and the send
 * itself, so a request handler can answer without waiting on the provider and
 * a CLI can await it.
 */
export async function notifySubscribersOnce(
  db: Database,
  tenantId: string,
  post: Page,
  options: NotifyOptions = {}
): Promise<{ notifiedAt: string; sending: Promise<void> } | null> {
  if (!resolveEmailProvider(options.email)) return null;
  if ((await countSubscribers(db, tenantId)).verified === 0) return null;
  const notifiedAt = await claimNotification(db, post.id, tenantId);
  if (!notifiedAt) return null;

  // An episode's email says how long it is.
  const audio = post.episode
    ? await getMediaById(db, post.episode.audioMediaId, tenantId, (key) => key)
    : null;
  const sending = notifySubscribers(
    db,
    tenantId,
    {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      format: post.format,
      durationSeconds: audio?.durationSeconds ?? null,
    },
    options
  );
  return { notifiedAt, sending };
}
