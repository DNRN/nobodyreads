/**
 * Metering hook for AI theme generations. Today it is a no-op; it exists so the
 * platform has a single, stable seam to enforce per-plan generation limits
 * (Phase 9 billing) without touching the generate route later.
 */
export async function recordThemeGeneration(_tenantId: string): Promise<void> {
  // TODO(phase-9): count per-tenant generations and enforce plan limits /
  // metering for the free model. BYO-key and unlimited tiers skip the cap.
}
