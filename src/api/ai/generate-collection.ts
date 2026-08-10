import {
  collectionDraftSchema,
  buildCollectionRetryPrompt,
  type CollectionDraft,
} from "../../content/ai-collection.js";
import { validateCustomQuery } from "../../content/custom-view-sql.js";
import { validateCollectionTemplate } from "../../content/collection-template.js";
import type { AICollectionProvider } from "./collection-provider.js";

export type GenerateCollectionResult =
  | { ok: true; collection: CollectionDraft }
  | { ok: false; error: string };

/** Both validators, as one message. Null when the draft is acceptable. */
function reject(draft: CollectionDraft): string | null {
  const queryError = validateCustomQuery(draft.query ?? "");
  if (queryError) return `Query: ${queryError}`;
  const templateError = validateCollectionTemplate(draft.template ?? "");
  if (templateError) return `Template: ${templateError}`;
  return null;
}

/**
 * Ask a provider for a collection, then hold it to the same rules a hand-written
 * one is held to.
 *
 * The model is guided by a JSON Schema but that is not the boundary: whatever
 * comes back goes through `validateCustomQuery` and `validateCollectionTemplate`
 * before any caller sees it, exactly as a save would.
 *
 * One retry, with the rejection fed back. The errors are specific enough to act
 * on ("reads tables that are not allowed: page") and a second pass usually fixes
 * them — failing the whole request on a fixable mistake is a worse experience
 * than one extra call.
 */
export async function generateCollection(
  provider: AICollectionProvider,
  description: string,
): Promise<GenerateCollectionResult> {
  const first = collectionDraftSchema.safeParse(await provider.generateCollection(description));
  if (!first.success) {
    return { ok: false, error: "The model did not return a usable collection." };
  }

  const firstError = reject(first.data);
  if (!firstError) return { ok: true, collection: first.data };

  const retry = collectionDraftSchema.safeParse(
    await provider.generateCollection(
      buildCollectionRetryPrompt(description, first.data, firstError),
    ),
  );
  if (!retry.success) {
    return { ok: false, error: firstError };
  }

  const retryError = reject(retry.data);
  if (retryError) {
    // Report the second failure: it is the one describing what is on the table
    // now, and repeating the first would be misleading.
    return { ok: false, error: retryError };
  }

  return { ok: true, collection: retry.data };
}
