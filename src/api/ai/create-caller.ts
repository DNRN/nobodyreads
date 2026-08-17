import type { AiProviderConfig } from "../../admin/server/modules/types.js";
import type { StructuredCaller } from "./adapters/shared.js";
import { createOpenAiCompatibleCaller } from "./adapters/openai-compatible.js";
import { createAnthropicCaller } from "./adapters/anthropic.js";
import { createGeminiCaller } from "./adapters/gemini.js";
import { createLocalCaller } from "./adapters/local.js";

/**
 * Shared 4-way adapter dispatch for every text-generation AI feature (theme,
 * moderation, collections, cover-image prompts). Unknown/legacy configs fall
 * back to `openai-compatible`.
 */
export function createCaller(config: AiProviderConfig): StructuredCaller {
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
