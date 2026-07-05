import type { ThemeDiff } from "../../../template/ai-theme.js";

/**
 * Instruction shared by every AI theme adapter. The task is the same regardless
 * of backend: translate a mood into a schema-constrained {@link ThemeDiff}. Each
 * adapter maps `themeDiffJsonSchema` to its provider's native constraint
 * mechanism; this prose only guides tone and which fields to touch.
 */
export const SYSTEM_PROMPT =
  "You translate a mood into theme tokens for a site that supports both light and dark " +
  "color schemes. Always fill in a complete, coherent set of colors for BOTH `tokens.light` " +
  "and `tokens.dark`, picking values appropriate to each mode (light mode: dark text on a " +
  "light background; dark mode: light text on a dark background) so the theme looks right " +
  "whichever mode a visitor uses — never leave one mode's colors null while changing the " +
  "other. Only set fields defined by the schema, and leave section/component fields null " +
  "unless the mood clearly calls for a structural change.";

/**
 * Headroom for the completion. Reasoning models (e.g. Kimi, DeepSeek-R1) emit a
 * long chain of thought before the JSON, which counts against this budget. The
 * default provider cap (often 2048) truncates them mid-output, yielding invalid
 * JSON — so give them room.
 */
export const MAX_TOKENS = 8192;

/** Parse a model response into a ThemeDiff, tolerating surrounding prose/fences. */
export function parseThemeDiff(raw: string): ThemeDiff | null {
  const attempts = [raw];
  // Some models wrap the object in markdown fences or preamble; fall back to
  // the outermost {...} span.
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) attempts.push(raw.slice(first, last + 1));
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as ThemeDiff;
    } catch {
      // try the next candidate
    }
  }
  return null;
}
