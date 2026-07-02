import type { AiProviderConfig } from "../../admin/server/modules/types.js";

/**
 * Resolve the OpenAI-compatible AI provider config from the environment, or
 * `undefined` when no key is set. Any OpenAI-compatible endpoint works
 * (OpenAI, OpenRouter, Together, Groq, vLLM, …) via `OPENAI_BASE_URL`.
 *
 * This is the app-layer (standalone / host) reader; the engine core stays
 * env-agnostic and receives the resolved config through `AdminModuleContext`.
 */
export function resolveAiProviderConfig(): AiProviderConfig | undefined {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;
  return {
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.AI_THEME_MODEL || "gpt-4o-mini",
  };
}
