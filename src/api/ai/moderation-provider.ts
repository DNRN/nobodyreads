import type { AiProviderConfig } from "../../admin/server/modules/types.js";
import type { ModerationVerdict } from "../../moderation/types.js";
import {
  moderationVerdictJsonSchema,
  buildModerationSystemPrompt,
  buildModerationUserPrompt,
  parseModerationVerdict,
  type ModerationCallInput,
} from "../../moderation/verdict.js";
import { createCaller } from "./create-caller.js";

/**
 * Vendor-neutral AI moderation provider — the moderation sibling of
 * {@link createThemeProvider}. Given a ruleset plus a new comment with its
 * thread context, it returns a schema-constrained verdict via the forced
 * `set_verdict` call. Deciding what to do with the verdict (hold, publish,
 * queue) happens at the call site (`reviewComment`).
 */
export interface AIModerationProvider {
  generateVerdict(input: ModerationCallInput): Promise<ModerationVerdict>;
}

/**
 * Build the right {@link AIModerationProvider} for a resolved config. Same
 * 4-way adapter dispatch as theming; unknown/legacy configs fall back to
 * `openai-compatible`.
 */
export function createModerationProvider(config: AiProviderConfig): AIModerationProvider {
  const caller = createCaller(config);

  return {
    async generateVerdict(input: ModerationCallInput): Promise<ModerationVerdict> {
      const value = await caller.callStructured({
        system: buildModerationSystemPrompt(input.ruleset),
        user: buildModerationUserPrompt(input),
        schemaName: "set_verdict",
        schema: moderationVerdictJsonSchema as Record<string, unknown>,
        toolDescription: "Record the moderation verdict for the new comment.",
        // A verdict is a classification — no creativity wanted.
        temperature: 0,
      });
      const verdict = parseModerationVerdict(value);
      if (!verdict) {
        throw new Error("AI returned an invalid moderation verdict.");
      }
      return verdict;
    },
  };
}
