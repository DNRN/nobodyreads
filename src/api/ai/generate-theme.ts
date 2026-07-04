import type { SiteTemplateDefinition } from "../../template/types.js";
import { applyThemeDiff, type ThemeDiff } from "../../template/ai-theme.js";
import { validateTheme } from "../../template/theme-io.js";
import type { AIThemeProvider } from "./provider.js";

export type GenerateThemeResult =
	| { ok: true; template: SiteTemplateDefinition; diff: ThemeDiff }
	| { ok: false; error: string; diff: ThemeDiff };

/**
 * The full AI theming pipeline in one place: ask the provider for a
 * {@link ThemeDiff}, merge it onto `current`, and re-validate the result. The
 * diff is returned in both the ok and error cases so callers can inspect or
 * echo what the model produced.
 *
 * Provider errors from `generateThemeDiff` propagate to the caller, which owns
 * how to surface them (HTTP status, log, …). An invalid *merged* theme is a
 * normal, non-throwing outcome (`ok: false`).
 */
export async function generateTheme(
	provider: AIThemeProvider,
	current: SiteTemplateDefinition,
	prompt: string,
): Promise<GenerateThemeResult> {
	const diff = await provider.generateThemeDiff(prompt, current);
	const merged = applyThemeDiff(current, diff);
	const validation = validateTheme(merged);
	if (!validation.ok) {
		return { ok: false, error: validation.error, diff };
	}
	return { ok: true, template: validation.theme, diff };
}
