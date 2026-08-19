import { generateImage } from "./generate-image.js";
import type { GenerateImageInput, GenerateImageResult } from "./generate-image.js";

export type GenerateCoverImageInput = Omit<GenerateImageInput, "filenamePrefix">;
export type GenerateCoverImageResult = GenerateImageResult;

/** Cover-image generation is the generic `generateImage` with a "cover" filename prefix. */
export async function generateCoverImage(
  input: GenerateCoverImageInput,
): Promise<GenerateCoverImageResult> {
  return generateImage({ ...input, filenamePrefix: "cover" });
}
