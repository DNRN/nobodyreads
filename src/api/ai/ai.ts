import OpenAI from "openai";

const client = new OpenAI({
	apiKey: process.env.OPEN_AI_KEY,
	baseURL: "https://api.together.xyz/v1",
});

export const AIGenerate = {
	theme: async (input: string, model = "Qwen/Qwen2.5-7B-Instruct-Turbo") => {
		const response = await client.chat.completions.create({
			model,
			messages: [{ role: "user", content: input }],
		});

		return response;
	},
};
