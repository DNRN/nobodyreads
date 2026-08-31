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
/**
 * An image handed to a vision-capable backend alongside the text prompt.
 *
 * Raw bytes as base64 rather than a URL: the only caller today is content
 * screening, which runs on freshly uploaded media that may not be reachable
 * from the provider (private buckets, a not-yet-public key), and handing the
 * model a URL would make the check depend on the storage layer being world
 * readable — which is precisely the thing we do not want for content nobody
 * has reviewed yet.
 */
export interface StructuredCallImage {
  /** Base64-encoded image bytes, with no `data:` URI prefix. */
  data: string;
  /** IANA media type, e.g. `image/png`, `image/jpeg`, `image/webp`. */
  mediaType: string;
}

/**
 * Guard for adapters that cannot see images.
 *
 * Vision is implemented on the Anthropic adapter only, because that is the one
 * `.me` pins for moderation and adding it to four backends on spec would be
 * four untested code paths. The rest throw rather than silently judging an
 * image on its filename — a screening call that quietly saw nothing is worse
 * than one that failed, because the caller records the former as "clear".
 */
export function assertNoImages(spec: StructuredCallSpec, backend: string): void {
  if (spec.images && spec.images.length > 0) {
    throw new Error(
      `The ${backend} adapter cannot accept images; use an image-capable provider for this call.`
    );
  }
}

export interface StructuredCallSpec {
  /** System instruction for the call. */
  system: string;
  /** User content the model responds to. */
  user: string;
  /**
   * Images to judge alongside {@link user}. Only backends that support vision
   * accept these; the others throw via {@link assertNoImages}.
   */
  images?: StructuredCallImage[];
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
