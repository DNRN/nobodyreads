import type { Database } from "../db/index.js";
import type { AiProviderConfig } from "../admin/server/modules/types.js";
import { getTenantAiConfig, isAiConfigured } from "../api/ai/config.js";
import { createModerationProvider } from "../api/ai/moderation-provider.js";
import { recordModerationCheck } from "../api/ai/metering.js";
import type { Page } from "../content/types.js";
import type { Comment } from "../comments/types.js";
import { getSpaceRuleset } from "./db.js";
import type { ModerationFlag, ModerationVerdict } from "./types.js";
import type { ModerationRulesetInput } from "./verdict.js";

/** What the pre-publish check decided about a new comment. */
export interface ModerationDecision {
  action: "publish" | "hold";
  /** Present on non-allow verdicts — recorded in the queue even when publishing (auto-hide off). */
  flag?: ModerationFlag;
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const VERDICT_TIMEOUT_MS = 10_000;

export interface ReviewCommentOptions {
  db: Database;
  tenantId: string;
  /** Host/platform default AI config; per-tenant BYO settings are layered over it. */
  ai?: AiProviderConfig;
  /** The post being commented on (carries the per-post moderation override). */
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
  ruleset: ModerationRulesetInput
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
 * Resolves the effective ruleset (per-post override → space ruleset), the
 * effective AI config (tenant BYO → host default), and asks the model for a
 * verdict. **Fails open**: when moderation is off, unconfigured, or the model
 * errors/times out, the comment publishes — moderation is an assist, and
 * degrading to pre-moderation behavior beats silently swallowing every comment
 * during a provider outage. The owner keeps the manual delete path either way.
 */
export async function reviewComment(opts: ReviewCommentOptions): Promise<ModerationDecision> {
  const publish: ModerationDecision = { action: "publish" };

  // 1. Effective ruleset.
  if (opts.post.moderationMode === "off") return publish;

  const spaceRules = await getSpaceRuleset(opts.db, opts.tenantId);
  let ruleset: ModerationRulesetInput;
  let autoHide: boolean;

  if (opts.post.moderationMode === "custom") {
    // Custom rules attached to the post work even when the space ruleset is
    // absent or disabled — the author opted this post in explicitly.
    const rules = opts.post.moderationRules?.trim();
    if (!rules) return publish;
    ruleset = { rules };
    autoHide = spaceRules?.autoHide ?? true;
  } else {
    if (!spaceRules || !spaceRules.enabled || !spaceRules.rules.trim()) return publish;
    ruleset = {
      rules: spaceRules.rules,
      tone: spaceRules.tone,
      noGoTopics: spaceRules.noGoTopics,
      offTopicExamples: spaceRules.offTopicExamples,
    };
    autoHide = spaceRules.autoHide;
  }

  // 2. Effective AI config: tenant BYO key first, then the host default.
  const tenantConfig = await getTenantAiConfig(opts.db, opts.tenantId);
  const config = tenantConfig ?? opts.ai;
  if (!isAiConfigured(config)) return publish;

  // 3. Ask the model — fail open on error or timeout.
  let verdict: ModerationVerdict;
  try {
    verdict = await generateVerdictWithTimeout(config, opts, ruleset);
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
  return { action: autoHide ? "hold" : "publish", flag };
}
