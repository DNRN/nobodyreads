import { GoogleGenAI } from "@google/genai";
import { themeDiffJsonSchema, type ThemeDiff } from "../../../template/ai-theme.js";
import type { AiProviderConfig } from "../../../admin/server/modules/types.js";
import type { AIThemeProvider } from "../provider.js";
import { SYSTEM_PROMPT, parseThemeDiff } from "./shared.js";

/**
 * Google Gemini theme provider. Maps the engine's JSON Schema to Gemini's
 * native constraint mechanism: `responseMimeType: "application/json"` plus
 * `responseJsonSchema`, so the model emits only schema-valid JSON. The call
 * site re-validates the merged template. Model id comes from config.
 */
export function createGeminiProvider(config: AiProviderConfig): AIThemeProvider {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  return {
    async generateThemeDiff(prompt: string): Promise<ThemeDiff> {
      const res = await ai.models.generateContent({
        model: config.model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.4,
          responseMimeType: "application/json",
          responseJsonSchema: themeDiffJsonSchema,
        },
      });

      const parsed = parseThemeDiff(res.text ?? "");
      if (!parsed) {
        throw new Error("Gemini returned a response that was not valid JSON.");
      }
      return parsed;
    },
  };
}
