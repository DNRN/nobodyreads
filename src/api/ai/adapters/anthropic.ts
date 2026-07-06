import Anthropic from "@anthropic-ai/sdk";
import { themeDiffJsonSchema, type ThemeDiff } from "../../../template/ai-theme.js";
import type { AiProviderConfig } from "../../../admin/server/modules/types.js";
import type { AIThemeProvider } from "../provider.js";
import {
  MAX_TOKENS,
  SYSTEM_PROMPT,
  type StructuredCallSpec,
  type StructuredCaller,
} from "./shared.js";

/**
 * Anthropic (Claude) structured caller. Maps a JSON Schema to Claude's native
 * constraint mechanism: a single forced tool (named after the spec's
 * `schemaName`) whose `input_schema` is that schema. The model can only return
 * a `tool_use` block whose `input` matches the shape, so no free-form text can
 * come back. Call sites re-validate the parsed value, so this is a guide for
 * the model, not the safety boundary.
 *
 * The model id comes from config (the host/tenant picks it) — this adapter
 * never hard-codes a vendor model. Thinking is left off so the forced
 * `tool_choice` is accepted across the Claude model family.
 */
export function createAnthropicCaller(config: AiProviderConfig): StructuredCaller {
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    async callStructured(spec: StructuredCallSpec): Promise<unknown> {
      const res = await client.messages.create({
        model: config.model,
        max_tokens: spec.maxTokens ?? MAX_TOKENS,
        system: spec.system,
        tools: [
          {
            name: spec.schemaName,
            description:
              spec.toolDescription ??
              `Record a result conforming to the ${spec.schemaName} schema.`,
            // The spec's schema is a JSON Schema object; Anthropic accepts it
            // as the tool's input schema.
            input_schema: spec.schema as Anthropic.Messages.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: spec.schemaName },
        messages: [{ role: "user", content: spec.user }],
      });

      const toolUse = res.content.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error(`Anthropic returned no ${spec.schemaName} tool call.`);
      }
      return toolUse.input;
    },
  };
}

/**
 * Anthropic (Claude) theme provider — a thin theme-shaped wrapper over
 * {@link createAnthropicCaller} using the forced `set_theme` tool.
 */
export function createAnthropicProvider(config: AiProviderConfig): AIThemeProvider {
  const caller = createAnthropicCaller(config);

  return {
    async generateThemeDiff(prompt: string): Promise<ThemeDiff> {
      const value = await caller.callStructured({
        system: SYSTEM_PROMPT,
        user: prompt,
        schemaName: "set_theme",
        schema: themeDiffJsonSchema as Record<string, unknown>,
        toolDescription:
          "Apply the described mood as a set of theme token, section, and component changes.",
      });
      return value as ThemeDiff;
    },
  };
}
