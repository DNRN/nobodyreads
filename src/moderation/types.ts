// --- Moderation types ---
// The AI-assisted moderation queue. The ruleset a comment is judged against is
// plain markdown supplied by the host (see ruleset.ts); only per-comment state
// lives in the database.

/** A verdict from the moderation model. `allow` publishes immediately. */
export type ModerationVerdictKind = "allow" | "hold" | "reject";

/** Queue lifecycle: pending → dismissed (kept public/unheld) or actioned (removed). */
export type ModerationQueueStatus = "pending" | "dismissed" | "actioned";

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
