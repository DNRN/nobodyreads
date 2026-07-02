import OpenAI from "openai";
import { themeDiffJsonSchema, type ThemeDiff } from "../../template/ai-theme.js";

/**
 * OpenAI-compatible theme generator. Works with any provider that speaks the
 * OpenAI chat-completions wire format (OpenAI, OpenRouter, Together, Groq,
 * vLLM, …). Returns a schema-constrained {@link ThemeDiff}; merging and
 * validation happen at the call site, which owns the current template.
 */
export const AIGenerate = (apiKey: string, baseURL: string, model: string) => {
	const client = new OpenAI({
		apiKey,
		baseURL,
	});

	return {
		theme: async (content: string): Promise<ThemeDiff> => {
			const res = await client.chat.completions.create({
				model,
				temperature: 0.4, // low — you want consistency, not creativity, in the JSON
				messages: [
					{
						role: "system",
						content:
							"You translate a mood into theme tokens. Only set fields defined by the schema. " +
							"Return changes that fit the requested mood; leave unrelated fields as null.",
					},
					{ role: "user", content },
				],
				response_format: {
					type: "json_schema",
					json_schema: {
						name: "theme_diff",
						strict: true,
						schema: themeDiffJsonSchema,
					},
				},
			});

			return JSON.parse(res.choices[0].message.content!) as ThemeDiff;
		},
	};
};
