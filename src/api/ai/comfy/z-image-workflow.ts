/**
 * Flat "API format" graph for Comfy Cloud's `image_z_image_turbo_int8`
 * text-to-image template (Z-Image-Turbo, 8-step distilled model). The
 * template itself is a subgraph on Comfy Cloud; its internal node graph was
 * pulled once via the template inspector and hand-flattened here, since the
 * plain `/api/prompt` REST endpoint takes node-id-keyed graphs directly and
 * does not resolve subgraphs the way the Comfy Cloud template UI/MCP tooling
 * does. Node ids are kept identical to the source template for traceability.
 */

export interface ZImageWorkflowInput {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
}

export function buildZImageWorkflow({
  prompt,
  width = 1280,
  height = 720,
  seed = Math.floor(Math.random() * 2 ** 32),
  steps = 8,
}: ZImageWorkflowInput): Record<string, unknown> {
  return {
    "28": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: "z_image_turbo_int8_convrot.safetensors",
        weight_dtype: "default",
      },
    },
    "30": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: "qwen_3_4b_fp8_mixed.safetensors",
        type: "lumina2",
        device: "default",
      },
    },
    "29": {
      class_type: "VAELoader",
      inputs: { vae_name: "ae.safetensors" },
    },
    "27": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["30", 0] },
    },
    "33": {
      class_type: "ConditioningZeroOut",
      inputs: { conditioning: ["27", 0] },
    },
    "11": {
      class_type: "ModelSamplingAuraFlow",
      inputs: { shift: 3, model: ["28", 0] },
    },
    "13": {
      class_type: "EmptySD3LatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    "3": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps,
        cfg: 1,
        sampler_name: "res_multistep",
        scheduler: "simple",
        denoise: 1,
        model: ["11", 0],
        positive: ["27", 0],
        negative: ["33", 0],
        latent_image: ["13", 0],
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["29", 0] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { images: ["8", 0], filename_prefix: "cover" },
    },
  };
}
