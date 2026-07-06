import { Hono } from "hono";
import type { Context } from "hono";
import {
  getSpaceRuleset,
  upsertSpaceRuleset,
  listModerationQueue,
  getModerationFlagById,
  resolveModerationFlag,
  countPendingFlags,
} from "../../../moderation/db.js";
import type { ModerationQueueStatus } from "../../../moderation/types.js";
import { unholdComment, softDeleteComment, getCommentById } from "../../../comments/db.js";
import type { AdminModuleContext } from "./types.js";

const QUEUE_STATUSES: ModerationQueueStatus[] = ["pending", "dismissed", "actioned"];

/**
 * Moderation routes (per-tenant): the space ruleset editor and the flagged-
 * comment inbox. Owner-gating happens in the host's admin handler, like every
 * other admin module.
 *
 * Routes (mounted under the tenant admin base):
 *   GET  /moderation/ruleset             -> the tenant's ruleset (or defaults)
 *   POST /moderation/ruleset             -> upsert the ruleset
 *   GET  /moderation/queue?status=...    -> inbox rows (default: pending)
 *   POST /moderation/queue/:id/approve   -> unhold the comment, dismiss the flag
 *   POST /moderation/queue/:id/dismiss   -> same effect, for published-but-flagged rows
 *   POST /moderation/queue/:id/remove    -> soft-delete the comment, action the flag
 *   GET  /moderation/pending-count       -> { count } for the in-app badge
 */
export function createModerationRoutes(ctx: AdminModuleContext): Hono {
  const { db, tenantId } = ctx;
  const app = new Hono();

  app.get("/moderation/ruleset", async (c) => {
    const ruleset = await getSpaceRuleset(db, tenantId);
    return c.json({
      enabled: ruleset?.enabled ?? false,
      rules: ruleset?.rules ?? "",
      tone: ruleset?.tone ?? "",
      noGoTopics: ruleset?.noGoTopics ?? "",
      offTopicExamples: ruleset?.offTopicExamples ?? "",
      autoHide: ruleset?.autoHide ?? true,
    });
  });

  app.post("/moderation/ruleset", async (c) => {
    const body = await c.req.parseBody();
    const rules = String(body.rules ?? "").trim();
    const enabled = body.enabled != null && body.enabled !== "off";
    if (enabled && !rules) {
      return c.json({ error: "Rules are required to enable moderation" }, 400);
    }
    await upsertSpaceRuleset(db, tenantId, {
      enabled,
      rules,
      tone: String(body.tone ?? "").trim(),
      noGoTopics: String(body.noGoTopics ?? "").trim(),
      offTopicExamples: String(body.offTopicExamples ?? "").trim(),
      autoHide: body.autoHide == null || body.autoHide !== "off",
    });
    return c.json({ ok: true });
  });

  app.get("/moderation/queue", async (c) => {
    const raw = c.req.query("status") ?? "pending";
    const status = QUEUE_STATUSES.includes(raw as ModerationQueueStatus)
      ? (raw as ModerationQueueStatus)
      : "pending";
    const items = await listModerationQueue(db, tenantId, status);
    return c.json({ items });
  });

  app.get("/moderation/pending-count", async (c) => {
    return c.json({ count: await countPendingFlags(db, tenantId) });
  });

  /**
   * Resolve a flag. Approve and dismiss share the same DB effect (release the
   * hold, keep the comment); remove soft-deletes the comment. Distinct labels
   * exist so the inbox reads naturally for held vs published-but-flagged rows.
   */
  async function resolveFlag(c: Context, resolution: "approve" | "dismiss" | "remove") {
    const queueId = c.req.param("id");
    const flag = queueId ? await getModerationFlagById(db, tenantId, queueId) : null;
    if (!flag) return c.json({ error: "not_found" }, 404);
    if (flag.status !== "pending") return c.json({ error: "already_resolved" }, 409);

    const comment = await getCommentById(db, tenantId, flag.commentId);
    if (resolution === "remove") {
      if (comment && !comment.deleted) {
        await softDeleteComment(db, tenantId, flag.commentId);
      }
      await resolveModerationFlag(db, tenantId, flag.id, "actioned");
    } else {
      if (comment?.held) {
        await unholdComment(db, tenantId, flag.commentId);
      }
      await resolveModerationFlag(db, tenantId, flag.id, "dismissed");
    }
    return c.json({ ok: true });
  }

  app.post("/moderation/queue/:id/approve", (c) => resolveFlag(c, "approve"));
  app.post("/moderation/queue/:id/dismiss", (c) => resolveFlag(c, "dismiss"));
  app.post("/moderation/queue/:id/remove", (c) => resolveFlag(c, "remove"));

  return app;
}
