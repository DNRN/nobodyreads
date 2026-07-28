import type { Database } from "../db/index.js";
import type { AiProviderConfig } from "../admin/server/modules/types.js";
import { isAiConfigured } from "../api/ai/config.js";
import { createModerationProvider } from "../api/ai/moderation-provider.js";
import { recordModerationCheck } from "../api/ai/metering.js";
import type { Page } from "../content/types.js";
import type { Comment } from "../comments/types.js";
import { getModerationAutoHide } from "./db.js";
import { fileRulesetSource, type RulesetSource } from "./ruleset.js";
import type { ModerationFlag, ModerationVerdict } from "./types.js";

/** What the pre-publish check decided about a new comment. */
export interface ModerationDecision {
  action: "publish" | "hold";
  /** Present on non-allow verdicts — recorded in the queue even when publishing. */
  flag?: ModerationFlag;
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const VERDICT_TIMEOUT_MS = 10_000;

export interface ReviewCommentOptions {
  db: Database;
  tenantId: string;
  /** AI config for the moderation call. Host-owned; never a reader's key. */
  ai?: AiProviderConfig;
  /** Where the ruleset text comes from. Defaults to `config/ruleset.md`. */
  rulesetSource?: RulesetSource;
  /** The post being commented on. */
  post: Page;
  /** Parent chain of the new comment, oldest first (empty for top-level). */
  parentChain: Comment[];
  authorName: string;
  body: string;
  /** Minimum confidence for a non-allow verdict to take effect. Default 0.7. */
  confidenceThreshold?: number;
}

async function generateVerdictWithTimeout(
  config: AiProviderConfig,
  opts: ReviewCommentOptions,
  ruleset: string
): Promise<ModerationVerdict> {
  const provider = createModerationProvider(config);
  const input = {
    ruleset,
    postTitle: opts.post.title,
    postExcerpt: opts.post.excerpt,
    thread: opts.parentChain
      .filter((c) => !c.deleted)
      .map((c) => ({ authorName: c.author.displayName, body: c.body })),
    authorName: opts.authorName,
    body: opts.body,
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      provider.generateVerdict(input),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`moderation check timed out after ${VERDICT_TIMEOUT_MS}ms`)),
          VERDICT_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pre-publish moderation check for a new comment.
 *
 * Resolves the ruleset text from the host's {@link RulesetSource} and asks the
 * model for a verdict. **Fails open**: when no ruleset exists, the AI is
 * unconfigured, or the model errors or times out, the comment publishes —
 * moderation is an assist, and degrading to unmoderated beats silently
 * swallowing every comment during a provider outage. The owner keeps the
 * manual delete path either way.
 *
 * Enforcement is split by severity. A `reject` verdict always holds: it is the
 * deployment's own policy floor, not something an individual space opts out
 * of. A `hold` verdict is a judgement call, so it respects the space's
 * auto-hide setting — off means the comment publishes but still lands in the
 * owner's inbox for review.
 */
export async function reviewComment(opts: ReviewCommentOptions): Promise<ModerationDecision> {
  const publish: ModerationDecision = { action: "publish" };

  // 1. Effective ruleset. Nothing configured → nothing to enforce.
  const source = opts.rulesetSource ?? fileRulesetSource;
  const ruleset = (await source(opts.tenantId))?.trim();
  if (!ruleset) return publish;

  // 2. AI config is host-owned. A tenant's BYO theming key deliberately does
  //    not apply here — moderation enforces the deployment's policy, judged
  //    with the deployment's model, not with whatever key a space happens to
  //    have pasted in for theme generation.
  if (!isAiConfigured(opts.ai)) return publish;

  // 3. Ask the model — fail open on error or timeout.
  let verdict: ModerationVerdict;
  try {
    verdict = await generateVerdictWithTimeout(opts.ai, opts, ruleset);
    await recordModerationCheck(opts.tenantId);
  } catch (err) {
    console.error("moderation check failed (comment published):", err);
    return publish;
  }

  // 4. Apply the verdict.
  const threshold = opts.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  if (verdict.verdict === "allow" || verdict.confidence < threshold) return publish;

  const flag: ModerationFlag = {
    verdict: verdict.verdict,
    reason: verdict.reason,
    rule: verdict.rule,
    confidence: verdict.confidence,
  };

  // `reject` is the policy floor and always holds; `hold` is the owner's call.
  if (verdict.verdict === "reject") return { action: "hold", flag };

  const autoHide = await getModerationAutoHide(opts.db, opts.tenantId);
  return { action: autoHide ? "hold" : "publish", flag };
}
