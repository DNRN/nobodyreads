import OpenAI from "openai";
import { themeDiffJsonSchema, type ThemeDiff } from "../../../template/ai-theme.js";
import type { AiProviderConfig } from "../../../admin/server/modules/types.js";
import type { AIThemeProvider } from "../provider.js";
import {
  MAX_TOKENS,
  SYSTEM_PROMPT,
  parseLooseJson,
  type StructuredCallSpec,
  type StructuredCaller,
} from "./shared.js";

/**
 * Some OpenAI-compatible providers (notably Together) turn a `json_schema`
 * response format into a constrained-decoding grammar, and their grammar
 * compiler intermittently rejects otherwise-valid schemas with a 422
 * "failed to compile grammar". Detect that specific transient failure so we can
 * fall back to plain JSON mode instead of surfacing it to the user.
 */
function isGrammarCompileError(err: unknown): boolean {
  if (!(err instanceof OpenAI.APIError)) return false;
  const message = String(err.message ?? "").toLowerCase();
  return message.includes("compile grammar") || message.includes("grammar is not valid");
}

/**
 * Provider+model+schema combos whose strict `json_schema` output can't be used
 * — the grammar compiler rejects the schema, or a reasoning model streams prose
 * instead of JSON. Once we've seen one fail, later calls skip the wasted
 * structured attempt and go straight to JSON mode. Process-lifetime only.
 */
const skipStructured = new Set<string>();

type Completion = { content: string; truncated: boolean };

/**
 * OpenAI-compatible structured caller. Works with any provider that speaks the
 * OpenAI chat-completions wire format (OpenAI, OpenRouter, Together, Groq,
 * vLLM, …).
 *
 * Providers that support strict structured output get a grammar-constrained
 * response. When a provider's grammar compiler chokes on the schema, we retry
 * once in plain JSON mode (schema embedded in the prompt). Call sites
 * re-validate the parsed result, so the schema is a guide for the model, not
 * the safety boundary — a loose JSON-mode response is still safe.
 */
export function createOpenAiCompatibleCaller(config: AiProviderConfig): StructuredCaller {
  const { apiKey, baseURL, model } = config;
  const client = new OpenAI({ apiKey, baseURL });

  const complete = async (
    spec: StructuredCallSpec,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    response_format: OpenAI.Chat.ChatCompletionCreateParams["response_format"],
  ): Promise<Completion> => {
    const res = await client.chat.completions.create({
      model,
      // Low default — structured output wants consistency, not creativity.
      temperature: spec.temperature ?? 0.4,
      max_tokens: spec.maxTokens ?? MAX_TOKENS,
      messages,
      response_format,
    });
    const choice = res.choices[0];
    return {
      content: choice.message.content ?? "",
      truncated: choice.finish_reason === "length",
    };
  };

  const generateStructured = (spec: StructuredCallSpec): Promise<Completion> =>
    complete(
      spec,
      [
        { role: "system", content: spec.system },
        { role: "user", content: spec.user },
      ],
      {
        type: "json_schema",
        json_schema: { name: spec.schemaName, strict: true, schema: spec.schema },
      },
    );

  // Fallback for providers whose grammar compiler rejects the schema, and for
  // reasoning models that ignore strict schema mode and stream prose into the
  // content. Plain JSON mode has no constrained decoding (so no grammar step)
  // and keeps a model's chain-of-thought out of `content`.
  const generateJsonMode = (spec: StructuredCallSpec): Promise<Completion> =>
    complete(
      spec,
      [
        {
          role: "system",
          content:
            `${spec.system}\n\n` +
            "Respond with a single JSON object that conforms to this JSON Schema. " +
            (spec.jsonModeInstruction ? `${spec.jsonModeInstruction}\n` : "") +
            JSON.stringify(spec.schema),
        },
        { role: "user", content: spec.user },
      ],
      { type: "json_object" },
    );

  return {
    async callStructured(spec: StructuredCallSpec): Promise<unknown> {
      // Prefer strict structured output (rock-solid on OpenAI). Fall back to
      // plain JSON mode when the provider's grammar compiler rejects the
      // schema, or when the "structured" response is truncated / isn't JSON
      // (e.g. a reasoning model streamed prose instead). Once a model is
      // known to need the fallback, skip the wasted structured attempt.
      const modelKey = `${baseURL}::${model}::${spec.schemaName}`;
      if (!skipStructured.has(modelKey)) {
        try {
          const structured = await generateStructured(spec);
          if (!structured.truncated) {
            const parsed = parseLooseJson(structured.content);
            if (parsed) return parsed;
          }
          skipStructured.add(modelKey);
        } catch (err) {
          if (!isGrammarCompileError(err)) throw err;
          skipStructured.add(modelKey);
        }
      }

      const fallback = await generateJsonMode(spec);
      if (fallback.truncated) {
        throw new Error(
          `AI response was truncated at ${spec.maxTokens ?? MAX_TOKENS} tokens before the JSON completed.`,
        );
      }
      const parsed = parseLooseJson(fallback.content);
      if (!parsed) {
        throw new Error("AI returned a response that was not valid JSON.");
      }
      return parsed;
    },
  };
}

/**
 * OpenAI-compatible theme provider — a thin theme-shaped wrapper over
 * {@link createOpenAiCompatibleCaller}. Returns a schema-constrained
 * {@link ThemeDiff}; merging and validation happen at the call site, which
 * owns the current template.
 */
export function createOpenAiCompatibleProvider(config: AiProviderConfig): AIThemeProvider {
  const caller = createOpenAiCompatibleCaller(config);

  return {
    async generateThemeDiff(prompt: string): Promise<ThemeDiff> {
      const value = await caller.callStructured({
        system: SYSTEM_PROMPT,
        user: prompt,
        schemaName: "theme_diff",
        schema: themeDiffJsonSchema as Record<string, unknown>,
        jsonModeInstruction:
          "Every field is optional: include only the fields you want to change and " +
          "use null for anything left unchanged.",
      });
      return value as ThemeDiff;
    },
  };
}
