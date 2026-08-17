/**
 * Metering hook for AI theme generations. Today it is a no-op; it exists so the
 * platform has a single, stable seam to enforce per-plan generation limits
 * (Phase 9 billing) without touching the generate route later.
 */
export async function recordThemeGeneration(_tenantId: string): Promise<void> {
  // TODO(phase-9): count per-tenant generations and enforce plan limits /
  // metering for the free model. BYO-key and unlimited tiers skip the cap.
}

/** Same seam for AI moderation checks (one per judged comment). */
export async function recordModerationCheck(_tenantId: string): Promise<void> {
  // TODO(phase-9): count per-tenant moderation checks and enforce plan limits.
}

/**
 * Same seam for AI cover-image generations. Unlike theming/moderation (cheap
 * LLM calls), a Comfy Cloud generation costs real GPU credits per call, and
 * the platform-default key means the host absorbs that cost with no cap until
 * this lands — treat this one as higher priority than its siblings above.
 */
export async function recordCoverImageGeneration(_tenantId: string): Promise<void> {
  // TODO(phase-9): count per-tenant generations and enforce plan limits for
  // the platform-default key. BYO-key tenants skip the cap (their own spend).
}
