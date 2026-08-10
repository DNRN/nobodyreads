import type { AiProviderConfig } from "../../admin/server/modules/types.js";
import {
  COLLECTION_SYSTEM_PROMPT,
  collectionDraftJsonSchema,
  buildCollectionUserPrompt,
} from "../../content/ai-collection.js";
import type { StructuredCaller } from "./adapters/shared.js";
import { createOpenAiCompatibleCaller } from "./adapters/openai-compatible.js";
import { createAnthropicCaller } from "./adapters/anthropic.js";
import { createGeminiCaller } from "./adapters/gemini.js";
import { createLocalCaller } from "./adapters/local.js";

/**
 * Vendor-neutral AI collection provider — the third sibling of
 * {@link createThemeProvider} and {@link createModerationProvider}. Given a
 * description, it returns a schema-constrained draft of a collection. Holding
 * that draft to the engine's rules happens at the call site
 * (`generateCollection`), which owns the validators.
 */
export interface AICollectionProvider {
  /**
   * `input` is either a plain description or a retry prompt carrying the
   * previous attempt and why it was rejected — both are just user content.
   */
  generateCollection(input: string): Promise<unknown>;
}

function createCaller(config: AiProviderConfig): StructuredCaller {
  switch (config.provider) {
    case "anthropic":
      return createAnthropicCaller(config);
    case "gemini":
      return createGeminiCaller(config);
    case "local":
      return createLocalCaller(config);
    case "openai-compatible":
    default:
      return createOpenAiCompatibleCaller(config);
  }
}

export function createCollectionProvider(config: AiProviderConfig): AICollectionProvider {
  const caller = createCaller(config);

  return {
    async generateCollection(input: string): Promise<unknown> {
      return caller.callStructured({
        system: COLLECTION_SYSTEM_PROMPT,
        // A retry prompt already contains its own framing; a bare description
        // needs wrapping.
        user: input.includes("was rejected:") ? input : buildCollectionUserPrompt(input),
        schemaName: "collection_draft",
        schema: collectionDraftJsonSchema as Record<string, unknown>,
        toolDescription: "Return the collection's name, SQL query and template.",
        // Close to deterministic: this is a translation task with hard rules,
        // not a creative one.
        temperature: 0.2,
      });
    },
  };
}
