/**
 * Manual smoke test for AI theme generation. Hits a live provider (any
 * OpenAI-compatible endpoint) with a few sample prompts and reports, per prompt,
 * whether the merged+validated theme is OK and how many light/dark tokens the
 * model actually set.
 *
 * Not part of the build or `npm test` — it makes real network calls and needs
 * credentials. Run with: `npm run theme:smoke` (reads OPENAI_API_KEY,
 * OPENAI_BASE_URL and AI_THEME_MODEL from your env/.env).
 */
import "dotenv/config";
import { AIGenerate } from "../src/api/ai/ai.js";
import { generateTheme } from "../src/api/ai/generate-theme.js";
import { DEFAULT_TEMPLATE } from "../src/template/defaults.js";

const PROMPTS = [
	"hot pink cyberpunk near-black background",
	"warm literary serif",
	"brutalist zine",
];

const { OPENAI_API_KEY, OPENAI_BASE_URL, AI_THEME_MODEL } = process.env;
if (!OPENAI_API_KEY || !OPENAI_BASE_URL || !AI_THEME_MODEL) {
	console.error("Set OPENAI_API_KEY, OPENAI_BASE_URL and AI_THEME_MODEL in your env/.env");
	process.exit(1);
}

/** How many tokens the diff set for one mode (non-null values). */
function countTokens(tokens: Record<string, string | null> | null | undefined): number {
	if (!tokens) return 0;
	return Object.values(tokens).filter((value) => value != null).length;
}

const gen = AIGenerate(OPENAI_API_KEY, OPENAI_BASE_URL, AI_THEME_MODEL);
console.log("MODEL:", AI_THEME_MODEL);

for (const prompt of PROMPTS) {
	try {
		const result = await generateTheme(gen, DEFAULT_TEMPLATE, prompt);
		const light = countTokens(result.diff.tokens?.light);
		const dark = countTokens(result.diff.tokens?.dark);
		const status = result.ok ? "OK " : "BAD";
		const detail = result.ok ? "" : ` :: ${result.error.slice(0, 40)}`;
		console.log(`${status} light=${light} dark=${dark}  <- ${prompt}${detail}`);
	} catch (err) {
		console.log(`ERR <- ${prompt} :: ${(err as Error).message}`);
	}
}
