import { describe, it, expect } from "vitest";
import { createThemeProvider } from "./provider.js";
import { isAiConfigured } from "./config.js";
import type { AiProviderConfig } from "../../admin/server/modules/types.js";

describe("createThemeProvider", () => {
  it("builds a provider exposing generateThemeDiff for each backend", () => {
    const configs: AiProviderConfig[] = [
      { provider: "openai-compatible", apiKey: "k", baseURL: "https://x/v1", model: "m" },
      { provider: "anthropic", apiKey: "k", model: "claude-haiku-4-5" },
      { provider: "gemini", apiKey: "k", model: "gemini-2.0-flash" },
      { provider: "local", model: "qwen2.5" },
    ];
    for (const config of configs) {
      const provider = createThemeProvider(config);
      expect(typeof provider.generateThemeDiff).toBe("function");
    }
  });

  it("falls back to the openai-compatible adapter for unknown providers", () => {
    // A legacy/unknown provider string should not throw at construction.
    const provider = createThemeProvider({
      provider: "mystery" as AiProviderConfig["provider"],
      apiKey: "k",
      baseURL: "https://x/v1",
      model: "m",
    });
    expect(typeof provider.generateThemeDiff).toBe("function");
  });
});

describe("isAiConfigured", () => {
  it("requires a model, and a key for hosted providers", () => {
    expect(isAiConfigured(undefined)).toBe(false);
    expect(isAiConfigured({ provider: "openai-compatible", model: "" })).toBe(false);
    expect(isAiConfigured({ provider: "anthropic", model: "m" })).toBe(false); // no key
    expect(isAiConfigured({ provider: "anthropic", model: "m", apiKey: "k" })).toBe(true);
  });

  it("treats local (Ollama) as configured without a key", () => {
    expect(isAiConfigured({ provider: "local", model: "qwen2.5" })).toBe(true);
  });
});
