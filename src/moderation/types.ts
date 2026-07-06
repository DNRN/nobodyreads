// --- Moderation types ---
// Space rulesets and the AI-assisted moderation queue. A ruleset describes the
// tone and boundaries the owner wants for discussion; the pipeline judges new
// comments against it before they go public.

/** A verdict from the moderation model. `allow` publishes immediately. */
export type ModerationVerdictKind = "allow" | "hold" | "reject";

/** Queue lifecycle: pending → dismissed (kept public/unheld) or actioned (removed). */
export type ModerationQueueStatus = "pending" | "dismissed" | "actioned";

/** Per-tenant discussion ruleset, one row per tenant (like site_template). */
export interface SpaceRuleset {
  /** Master switch — when false the pipeline publishes everything untouched. */
  enabled: boolean;
  /** Free-text rules; the main field the model judges against. */
  rules: string;
  /** Optional structured hint: desired tone of discussion. */
  tone: string;
  /** Optional structured hint: topics that are off-limits (newline-separated). */
  noGoTopics: string;
  /** Optional structured hint: examples of off-topic comments (newline-separated). */
  offTopicExamples: string;
  /** When true, flagged comments are held before publication; when false they publish but are queued for review. */
  autoHide: boolean;
  updatedAt: string;
}

/** Editable fields of a ruleset (everything except updatedAt). */
export type SpaceRulesetInput = Omit<SpaceRuleset, "updatedAt">;

/** The structured result of a `set_verdict` model call. */
export interface ModerationVerdict {
  verdict: ModerationVerdictKind;
  /** One-sentence explanation, shown to the owner in the inbox. */
  reason: string;
  /** The specific rule violated, or null when none applies. */
  rule: string | null;
  /** Model confidence in the verdict, clamped to [0, 1]. */
  confidence: number;
}

/** A non-allow verdict recorded against a comment. */
export interface ModerationFlag {
  verdict: "hold" | "reject";
  reason: string;
  rule: string | null;
  confidence: number;
}

/** Payload for the `onFlagged` notification hook (email / in-app, host's choice). */
export interface FlaggedCommentEvent {
  queueId: string;
  commentId: string;
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  authorName: string;
  commentExcerpt: string;
  /** Whether the comment was held (auto-hide on) or published-but-flagged. */
  held: boolean;
  flag: ModerationFlag;
}

/** A moderation queue row, joined with enough context to render the inbox. */
export interface ModerationQueueItem {
  id: string;
  commentId: string;
  pageId: string;
  verdict: "hold" | "reject";
  flagReason: string;
  rule: string | null;
  confidence: number;
  status: ModerationQueueStatus;
  createdAt: string;
  resolvedAt: string | null;
  /** Comment context for the inbox. */
  comment: {
    authorName: string;
    body: string;
    deleted: boolean;
    held: boolean;
  };
  /** Post context for the inbox. */
  page: {
    title: string;
    slug: string;
  };
}
