import { eq } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { paymentEvent } from "./schema.js";
import { grantEntitlement, revokeEntitlement, upsertPaymentCustomer } from "./db.js";
import type { EntitlementEvent } from "./provider.js";

/**
 * Apply normalized provider events to entitlements.
 *
 * ## Process-first, record-after — and why it is not claim-first
 *
 * The order per event is: skip if already recorded → apply the entitlement →
 * upsert the customer → record the event. It is tempting to "fix" this into
 * claim-first (insert the `payment_event` row, then do the work) because that
 * is the usual shape for exactly-once processing. **Do not.**
 *
 * Claim-first is right when the work is not idempotent, because it stops two
 * concurrent deliveries both doing it. Here the work *is* idempotent — a grant
 * is an upsert guarded by a monotonic clock — so a duplicate delivery is a
 * no-op anyway. What claim-first would buy in de-duplication it would lose in
 * durability: a crash between the claim and the work leaves the event recorded
 * but never applied, and the provider's retry sees it as already-handled. The
 * event is dropped permanently, and a paying reader silently has no access.
 *
 * With process-first, a crash between grant and record just means the retry
 * re-runs a no-op. The failure mode is "do it twice harmlessly" rather than
 * "never do it at all".
 *
 * ## Ordering
 *
 * `payment_event` de-duplicates *replays*. It cannot fix *reordering*: a
 * `subscription.deleted` and a straggling `subscription.updated` are two
 * different event ids, so both pass the dedupe check. The
 * `entitlement.last_event_at` guard inside `grantEntitlement` /
 * `revokeEntitlement` is what makes the outcome independent of arrival order.
 */
export interface ApplyResult {
  applied: number;
  skipped: number;
  failed: number;
}

export async function applyEntitlementEvents(
  db: Database,
  events: EntitlementEvent[]
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, skipped: 0, failed: 0 };

  for (const event of events) {
    try {
      if (await alreadyProcessed(db, event.eventId)) {
        result.skipped++;
        continue;
      }

      if (event.action === "grant") {
        await grantEntitlement(db, event.tenantId, {
          member: event.member,
          scope: event.scope,
          source: event.provider,
          externalRef: event.externalRef,
          expiresAt: event.expiresAt,
          eventAt: event.occurredAt,
        });
      } else {
        await revokeEntitlement(db, event.tenantId, {
          member: event.member,
          scope: event.scope,
          eventAt: event.occurredAt,
        });
      }

      if (event.customerRef) {
        await upsertPaymentCustomer(
          db,
          event.tenantId,
          event.member,
          event.provider,
          event.customerRef
        );
      }

      await recordEvent(db, event);
      result.applied++;
    } catch (err) {
      // One malformed event must not stop the rest of the batch — and must not
      // fail the whole webhook, which would make the provider retry the events
      // that already succeeded.
      result.failed++;
      console.error(
        `[payments] failed to apply event ${event.eventId} (${event.kind}):`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return result;
}

async function alreadyProcessed(db: Database, eventId: string): Promise<boolean> {
  const rows = await db
    .select({ eventId: paymentEvent.eventId })
    .from(paymentEvent)
    .where(eq(paymentEvent.eventId, eventId))
    .limit(1);
  return rows.length > 0;
}

async function recordEvent(db: Database, event: EntitlementEvent): Promise<void> {
  await db
    .insert(paymentEvent)
    .values({
      eventId: event.eventId,
      provider: event.provider,
      tenantId: event.tenantId,
      kind: event.kind,
      occurredAt: event.occurredAt,
    })
    .onConflictDoNothing();
}
