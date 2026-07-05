import OpenAI from "openai";
import { themeDiffJsonSchema, type ThemeDiff } from "../../../template/ai-theme.js";
import type { AiProviderConfig } from "../../../admin/server/modules/types.js";
import type { AIThemeProvider } from "../provider.js";
import { MAX_TOKENS, SYSTEM_PROMPT, parseThemeDiff } from "./shared.js";

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
 * Provider+model combos whose strict `json_schema` output can't be used — the
 * grammar compiler rejects the schema, or a reasoning model streams prose
 * instead of JSON. Once we've seen one fail, later generations skip the wasted
 * structured attempt and go straight to JSON mode. Process-lifetime only.
 */
const skipStructured = new Set<string>();

type Completion = { content: string; truncated: boolean };

/**
 * OpenAI-compatible theme provider. Works with any provider that speaks the
 * OpenAI chat-completions wire format (OpenAI, OpenRouter, Together, Groq,
 * vLLM, …). Returns a schema-constrained {@link ThemeDiff}; merging and
 * validation happen at the call site, which owns the current template.
 *
 * Providers that support strict structured output get a grammar-constrained
 * response. When a provider's grammar compiler chokes on the schema, we retry
 * once in plain JSON mode (schema embedded in the prompt). The call site
 * re-validates the merged result, so the schema is a guide for the model, not
 * the safety boundary — a loose JSON-mode response is still safe.
 */
export function createOpenAiCompatibleProvider(config: AiProviderConfig): AIThemeProvider {
  const { apiKey, baseURL, model } = config;
  const client = new OpenAI({ apiKey, baseURL });

  const complete = async (
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    response_format: OpenAI.Chat.ChatCompletionCreateParams["response_format"],
  ): Promise<Completion> => {
    const res = await client.chat.completions.create({
      model,
      temperature: 0.4, // low — you want consistency, not creativity, in the JSON
      max_tokens: MAX_TOKENS,
      messages,
      response_format,
    });
    const choice = res.choices[0];
    return {
      content: choice.message.content ?? "",
      truncated: choice.finish_reason === "length",
    };
  };

  const generateStructured = (content: string): Promise<Completion> =>
    complete(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      {
        type: "json_schema",
        json_schema: { name: "theme_diff", strict: true, schema: themeDiffJsonSchema },
      },
    );

  // Fallback for providers whose grammar compiler rejects the schema, and for
  // reasoning models that ignore strict schema mode and stream prose into the
  // content. Plain JSON mode has no constrained decoding (so no grammar step)
  // and keeps a model's chain-of-thought out of `content`.
  const generateJsonMode = (content: string): Promise<Completion> =>
    complete(
      [
        {
          role: "system",
          content:
            `${SYSTEM_PROMPT}\n\n` +
            "Respond with a single JSON object that conforms to this JSON Schema. " +
            "Every field is optional: include only the fields you want to change and " +
            "use null for anything left unchanged.\n" +
            JSON.stringify(themeDiffJsonSchema),
        },
        { role: "user", content },
      ],
      { type: "json_object" },
    );

  return {
    async generateThemeDiff(content: string): Promise<ThemeDiff> {
      // Prefer strict structured output (rock-solid on OpenAI). Fall back to
      // plain JSON mode when the provider's grammar compiler rejects the
      // schema, or when the "structured" response is truncated / isn't JSON
      // (e.g. a reasoning model streamed prose instead). Once a model is
      // known to need the fallback, skip the wasted structured attempt.
      const modelKey = `${baseURL}::${model}`;
      if (!skipStructured.has(modelKey)) {
        try {
          const structured = await generateStructured(content);
          if (!structured.truncated) {
            const parsed = parseThemeDiff(structured.content);
            if (parsed) return parsed;
          }
          skipStructured.add(modelKey);
        } catch (err) {
          if (!isGrammarCompileError(err)) throw err;
          skipStructured.add(modelKey);
        }
      }

      const fallback = await generateJsonMode(content);
      if (fallback.truncated) {
        throw new Error(
          `AI response was truncated at ${MAX_TOKENS} tokens before the theme JSON completed.`,
        );
      }
      const parsed = parseThemeDiff(fallback.content);
      if (!parsed) {
        throw new Error("AI returned a response that was not valid JSON.");
      }
      return parsed;
    },
  };
}
