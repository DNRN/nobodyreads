import type { SiteTemplateDefinition } from "../../template/types.js";
import type { ThemeDiff } from "../../template/ai-theme.js";
import type { AiProviderConfig } from "../../admin/server/modules/types.js";
import { createOpenAiCompatibleProvider } from "./adapters/openai-compatible.js";
import { createAnthropicProvider } from "./adapters/anthropic.js";
import { createGeminiProvider } from "./adapters/gemini.js";
import { createLocalProvider } from "./adapters/local.js";

/**
 * Vendor-neutral AI theme provider. Given a natural-language prompt, it returns
 * a schema-constrained {@link ThemeDiff}. Merging the diff onto the current
 * template and re-validating happens at the call site (`generateTheme`), which
 * owns the template — so a provider only has to produce a diff.
 *
 * `current` is accepted for future adapters that want to condition on the
 * existing template; the shipped adapters generate from the prompt alone (the
 * call site diffs against `current`), matching the original behaviour.
 */
export interface AIThemeProvider {
  generateThemeDiff(prompt: string, current?: SiteTemplateDefinition): Promise<ThemeDiff>;
}

/**
 * Build the right {@link AIThemeProvider} for a resolved config. Each adapter
 * maps the engine's JSON Schema to its backend's native constraint mechanism
 * (OpenAI `json_schema`, Anthropic tool use, Gemini `responseJsonSchema`,
 * Ollama `format`). Unknown/legacy configs fall back to `openai-compatible`,
 * which covers OpenAI, OpenRouter, Together, Groq, vLLM, and most gateways.
 */
export function createThemeProvider(config: AiProviderConfig): AIThemeProvider {
  switch (config.provider) {
    case "anthropic":
      return createAnthropicProvider(config);
    case "gemini":
      return createGeminiProvider(config);
    case "local":
      return createLocalProvider(config);
    case "openai-compatible":
    default:
      return createOpenAiCompatibleProvider(config);
  }
}
