import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveImportAiConfig, resolveModerationAiConfig } from "./config.js";

/**
 * The feature-specific resolvers layer over the theming env: `<PREFIX>_*`
 * wins, then the theming variables when the provider matches, then a
 * per-provider default. Getting the fallback wrong means silently calling one
 * vendor with another vendor's key.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveImportAiConfig", () => {
  it("is undefined with no AI environment at all", () => {
    expect(resolveImportAiConfig()).toBeUndefined();
  });

  it("inherits provider, key, and theme model when only the base vars are set", () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    vi.stubEnv("OPENAI_BASE_URL", "https://together.example/v1");
    vi.stubEnv("AI_THEME_MODEL", "gpt-oss-120b");

    expect(resolveImportAiConfig()).toEqual({
      provider: "openai-compatible",
      apiKey: "k",
      baseURL: "https://together.example/v1",
      model: "gpt-oss-120b",
    });
  });

  it("lets AI_IMPORT_MODEL override the model and nothing else", () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    vi.stubEnv("AI_THEME_MODEL", "gpt-oss-120b");
    vi.stubEnv("AI_IMPORT_MODEL", "zai-org/GLM-5.3-Flash");

    const ai = resolveImportAiConfig();

    expect(ai?.model).toBe("zai-org/GLM-5.3-Flash");
    expect(ai?.apiKey).toBe("k");
    expect(ai?.provider).toBe("openai-compatible");
  });

  it("does not reuse the theming key across providers", () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubEnv("AI_IMPORT_PROVIDER", "anthropic");
    vi.stubEnv("AI_IMPORT_MODEL", "claude-haiku-4-5");

    // Same provider rule: anthropic gets no OpenAI key and no inherited model.
    expect(resolveImportAiConfig()).toBeUndefined();

    vi.stubEnv("AI_IMPORT_API_KEY", "anthropic-key");
    expect(resolveImportAiConfig()).toEqual({
      provider: "anthropic",
      apiKey: "anthropic-key",
      baseURL: undefined,
      model: "claude-haiku-4-5",
    });
  });

  it("keeps moderation and import independent", () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    vi.stubEnv("AI_IMPORT_MODEL", "zai-org/GLM-5.3-Flash");
    vi.stubEnv("AI_MODERATION_MODEL", "Llama-3.3-70B-Instruct-Turbo");

    expect(resolveImportAiConfig()?.model).toBe("zai-org/GLM-5.3-Flash");
    expect(resolveModerationAiConfig()?.model).toBe("Llama-3.3-70B-Instruct-Turbo");
  });
});
