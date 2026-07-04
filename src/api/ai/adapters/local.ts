import { themeDiffJsonSchema, type ThemeDiff } from "../../../template/ai-theme.js";
import type { AiProviderConfig } from "../../../admin/server/modules/types.js";
import type { AIThemeProvider } from "../provider.js";
import { SYSTEM_PROMPT, parseThemeDiff } from "./shared.js";

/**
 * Local theme provider for Ollama / llama.cpp servers. Uses Ollama's native
 * `/api/chat` with structured output (`format` set to the engine's JSON
 * Schema), which drives grammar-constrained decoding on the local model. No API
 * key required. `baseURL` defaults to the standard Ollama address.
 */
export function createLocalProvider(config: AiProviderConfig): AIThemeProvider {
  const baseURL = (config.baseURL || "http://localhost:11434").replace(/\/+$/, "");

  return {
    async generateThemeDiff(prompt: string): Promise<ThemeDiff> {
      const res = await fetch(`${baseURL}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          stream: false,
          format: themeDiffJsonSchema,
          options: { temperature: 0.4 },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!res.ok) {
        throw new Error(`Local model request failed (${res.status}): ${await res.text()}`);
      }

      const data = (await res.json()) as { message?: { content?: string } };
      const parsed = parseThemeDiff(data.message?.content ?? "");
      if (!parsed) {
        throw new Error("Local model returned a response that was not valid JSON.");
      }
      return parsed;
    },
  };
}
