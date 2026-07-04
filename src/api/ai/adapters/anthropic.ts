import Anthropic from "@anthropic-ai/sdk";
import { themeDiffJsonSchema, type ThemeDiff } from "../../../template/ai-theme.js";
import type { AiProviderConfig } from "../../../admin/server/modules/types.js";
import type { AIThemeProvider } from "../provider.js";
import { MAX_TOKENS, SYSTEM_PROMPT } from "./shared.js";

/**
 * Anthropic (Claude) theme provider. Maps the engine's JSON Schema to Claude's
 * native constraint mechanism: a single forced tool (`set_theme`) whose
 * `input_schema` is `themeDiffJsonSchema`. The model can only return a
 * `tool_use` block whose `input` matches that shape, so no free-form CSS/HTML
 * can come back. The call site re-validates the merged template, so this is a
 * guide for the model, not the safety boundary.
 *
 * The model id comes from config (the host/tenant picks it) — this adapter
 * never hard-codes a vendor model. Thinking is left off so the forced
 * `tool_choice` is accepted across the Claude model family.
 */
export function createAnthropicProvider(config: AiProviderConfig): AIThemeProvider {
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    async generateThemeDiff(prompt: string): Promise<ThemeDiff> {
      const res = await client.messages.create({
        model: config.model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: "set_theme",
            description: "Apply the described mood as a set of theme token, section, and component changes.",
            // themeDiffJsonSchema is a JSON Schema object; Anthropic accepts it
            // as the tool's input schema.
            input_schema: themeDiffJsonSchema as Anthropic.Messages.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: "set_theme" },
        messages: [{ role: "user", content: prompt }],
      });

      const toolUse = res.content.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Anthropic returned no theme tool call.");
      }
      return toolUse.input as ThemeDiff;
    },
  };
}
