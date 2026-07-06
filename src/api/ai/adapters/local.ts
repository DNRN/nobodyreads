import { themeDiffJsonSchema, type ThemeDiff } from "../../../template/ai-theme.js";
import type { AiProviderConfig } from "../../../admin/server/modules/types.js";
import type { AIThemeProvider } from "../provider.js";
import {
  SYSTEM_PROMPT,
  parseLooseJson,
  type StructuredCallSpec,
  type StructuredCaller,
} from "./shared.js";

/**
 * Local structured caller for Ollama / llama.cpp servers. Uses Ollama's native
 * `/api/chat` with structured output (`format` set to the spec's JSON Schema),
 * which drives grammar-constrained decoding on the local model. No API key
 * required. `baseURL` defaults to the standard Ollama address.
 */
export function createLocalCaller(config: AiProviderConfig): StructuredCaller {
  const baseURL = (config.baseURL || "http://localhost:11434").replace(/\/+$/, "");

  return {
    async callStructured(spec: StructuredCallSpec): Promise<unknown> {
      const res = await fetch(`${baseURL}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          stream: false,
          format: spec.schema,
          options: { temperature: spec.temperature ?? 0.4 },
          messages: [
            { role: "system", content: spec.system },
            { role: "user", content: spec.user },
          ],
        }),
      });

      if (!res.ok) {
        throw new Error(`Local model request failed (${res.status}): ${await res.text()}`);
      }

      const data = (await res.json()) as { message?: { content?: string } };
      const parsed = parseLooseJson(data.message?.content ?? "");
      if (!parsed) {
        throw new Error("Local model returned a response that was not valid JSON.");
      }
      return parsed;
    },
  };
}

/**
 * Local (Ollama / llama.cpp) theme provider — a thin theme-shaped wrapper over
 * {@link createLocalCaller}.
 */
export function createLocalProvider(config: AiProviderConfig): AIThemeProvider {
  const caller = createLocalCaller(config);

  return {
    async generateThemeDiff(prompt: string): Promise<ThemeDiff> {
      const value = await caller.callStructured({
        system: SYSTEM_PROMPT,
        user: prompt,
        schemaName: "theme_diff",
        schema: themeDiffJsonSchema as Record<string, unknown>,
      });
      return value as ThemeDiff;
    },
  };
}
