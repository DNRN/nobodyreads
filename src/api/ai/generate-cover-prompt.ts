import { z } from "zod";
import type { AiProviderConfig } from "../../admin/server/modules/types.js";
import { createCaller } from "./create-caller.js";

const coverImagePromptSchema = z.object({
  prompt: z.string(),
});

const coverImagePromptJsonSchema = z.toJSONSchema(coverImagePromptSchema, {
  target: "draft-2020-12",
});

const SYSTEM_PROMPT =
  "You write a single text-to-image generation prompt for a blog post's cover " +
  "image. Read the post's title, excerpt, and body, then describe one concrete, " +
  "visual scene that reflects the post's actual subject — not a literal " +
  "illustration of its title, but an evocative image a reader would recognize " +
  "as belonging to this post. Write 40-80 words of comma-separated visual " +
  "detail (subject, setting, mood, lighting, style) the way an image-generation " +
  "prompt is normally written. Do not mention the blog, the platform, or that " +
  "this is a cover image — describe only the scene itself.";

const EXCERPT_LIMIT = 300;
const BODY_LIMIT = 1500;

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export interface CoverPromptInput {
  title: string;
  excerpt: string;
  body: string;
}

function buildUserPrompt({ title, excerpt, body }: CoverPromptInput): string {
  return [
    `Title: ${title}`,
    excerpt ? `Excerpt: ${truncate(excerpt, EXCERPT_LIMIT)}` : null,
    `Body:\n${truncate(body, BODY_LIMIT)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Draft an image-generation prompt from a post's content. Pure text
 * generation — no Comfy call happens here, so the author can review/edit the
 * draft before any image credits are spent (see `generateCoverImage`).
 */
export async function generateCoverPrompt(
  config: AiProviderConfig,
  input: CoverPromptInput,
): Promise<string> {
  const caller = createCaller(config);
  const value = await caller.callStructured({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(input),
    schemaName: "set_image_prompt",
    schema: coverImagePromptJsonSchema as Record<string, unknown>,
    toolDescription: "Record the image-generation prompt for this post's cover image.",
    temperature: 0.7,
  });
  const parsed = coverImagePromptSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("AI returned an invalid cover image prompt.");
  }
  return parsed.data.prompt;
}
