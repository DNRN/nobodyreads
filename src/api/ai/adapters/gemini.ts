import { GoogleGenAI } from "@google/genai";
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
 * Google Gemini structured caller. Maps a JSON Schema to Gemini's native
 * constraint mechanism: `responseMimeType: "application/json"` plus
 * `responseJsonSchema`, so the model emits only schema-valid JSON. Call sites
 * re-validate the parsed value. Model id comes from config.
 */
export function createGeminiCaller(config: AiProviderConfig): StructuredCaller {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  return {
    async callStructured(spec: StructuredCallSpec): Promise<unknown> {
      const res = await ai.models.generateContent({
        model: config.model,
        contents: spec.user,
        config: {
          systemInstruction: spec.system,
          temperature: spec.temperature ?? 0.4,
          responseMimeType: "application/json",
          responseJsonSchema: spec.schema,
        },
      });

      const parsed = parseLooseJson(res.text ?? "");
      if (!parsed) {
        throw new Error("Gemini returned a response that was not valid JSON.");
      }
      return parsed;
    },
  };
}

/**
 * Google Gemini theme provider — a thin theme-shaped wrapper over
 * {@link createGeminiCaller}.
 */
export function createGeminiProvider(config: AiProviderConfig): AIThemeProvider {
  const caller = createGeminiCaller(config);

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
