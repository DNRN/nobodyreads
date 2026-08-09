import type { ThemeDiff } from "../../../template/ai-theme.js";
import { fontGuide } from "../../../template/fonts.js";

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
  "unless the mood clearly calls for a structural change.\n\n" +
  "Typefaces must be chosen from the list below — they are the only ones the site " +
  "loads, and anything else is rejected. Copy the CSS stack exactly. `font` and " +
  "`brandFont` may be any of them (a monospace body is a legitimate style); " +
  "`fontMono` must be a monospace. Pick for the mood rather than defaulting to a " +
  "system stack:\n" +
  fontGuide();

/**
 * Headroom for the completion. Reasoning models (e.g. Kimi, DeepSeek-R1) emit a
 * long chain of thought before the JSON, which counts against this budget. The
 * default provider cap (often 2048) truncates them mid-output, yielding invalid
 * JSON — so give them room.
 */
export const MAX_TOKENS = 8192;

/**
 * A single schema-constrained model call, independent of what the schema
 * describes. Both AI features (theme generation, moderation verdicts) reduce to
 * this shape; each adapter maps it to its backend's native constraint
 * mechanism (OpenAI `json_schema`, Anthropic forced tool use, Gemini
 * `responseJsonSchema`, Ollama `format`).
 */
export interface StructuredCallSpec {
  /** System instruction for the call. */
  system: string;
  /** User content the model responds to. */
  user: string;
  /** snake_case name for the schema/tool (e.g. "theme_diff", "set_verdict"). */
  schemaName: string;
  /** JSON Schema the response must conform to. */
  schema: Record<string, unknown>;
  /** Tool description for backends that constrain via a forced tool call. */
  toolDescription?: string;
  /**
   * Extra guidance appended to the system prompt when a backend falls back to
   * plain JSON mode (schema embedded in the prompt instead of enforced).
   */
  jsonModeInstruction?: string;
  /** Sampling temperature where the backend supports it. Default 0.4. */
  temperature?: number;
  /** Completion budget. Default {@link MAX_TOKENS}. */
  maxTokens?: number;
}

/**
 * Backend-specific executor for a {@link StructuredCallSpec}. Returns the
 * parsed JSON value; callers validate it against their own zod schema — the
 * JSON Schema constraint is a guide for the model, not the safety boundary.
 */
export interface StructuredCaller {
  callStructured(spec: StructuredCallSpec): Promise<unknown>;
}

/** Parse a model response as JSON, tolerating surrounding prose/fences. */
export function parseLooseJson(raw: string): unknown | null {
  const attempts = [raw];
  // Some models wrap the object in markdown fences or preamble; fall back to
  // the outermost {...} span.
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) attempts.push(raw.slice(first, last + 1));
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Parse a model response into a ThemeDiff, tolerating surrounding prose/fences. */
export function parseThemeDiff(raw: string): ThemeDiff | null {
  return parseLooseJson(raw) as ThemeDiff | null;
}
