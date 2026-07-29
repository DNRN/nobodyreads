import type { AiProvider, AiProviderConfig } from "../../admin/server/modules/types.js";
import type { Database } from "../../db/index.js";
import { getSiteSettings } from "../../shared/site-settings.js";
import { decryptSecret } from "../../shared/secrets.js";

// --- Per-tenant AI provider settings keys (site_settings) ---
export const SETTING_AI_PROVIDER = "ai_provider";
export const SETTING_AI_MODEL = "ai_model";
export const SETTING_AI_BASE_URL = "ai_base_url";
/** Encrypted (see `secrets.ts`) BYO API key. Never returned to the client. */
export const SETTING_AI_API_KEY_ENC = "ai_api_key_enc";

const KNOWN_PROVIDERS: AiProvider[] = [
  "openai-compatible",
  "anthropic",
  "gemini",
  "local",
];

function coerceProvider(value: string | undefined): AiProvider {
  return KNOWN_PROVIDERS.includes(value as AiProvider)
    ? (value as AiProvider)
    : "openai-compatible";
}

/**
 * Whether a resolved config can actually serve a request. `local` (Ollama)
 * needs no key; every hosted provider needs one. All need a model.
 */
export function isAiConfigured(ai: AiProviderConfig | undefined): ai is AiProviderConfig {
  if (!ai || !ai.model) return false;
  return ai.provider === "local" || !!ai.apiKey;
}

/**
 * Resolve the AI provider config from the environment, or `undefined` when
 * unusable. This is the app-layer (standalone / host) reader; the engine core
 * stays env-agnostic and receives the resolved config through
 * `AdminModuleContext`. Any OpenAI-compatible endpoint works via
 * `OPENAI_BASE_URL`; set `AI_PROVIDER` to target another backend.
 */
export function resolveAiProviderConfig(): AiProviderConfig | undefined {
  const provider = coerceProvider(process.env.AI_PROVIDER);
  const config: AiProviderConfig = {
    provider,
    apiKey: process.env.OPENAI_API_KEY,
    baseURL:
      process.env.OPENAI_BASE_URL ||
      (provider === "openai-compatible" ? "https://api.openai.com/v1" : undefined),
    model: process.env.AI_THEME_MODEL || "gpt-4o-mini",
  };
  return isAiConfigured(config) ? config : undefined;
}

/** Sensible small-model default per provider (moderation is high-volume). */
function defaultModerationModel(provider: AiProvider): string {
  switch (provider) {
    case "openai-compatible":
      return "gpt-4o-mini";
    case "anthropic":
      return "claude-haiku-4-5";
    default:
      return ""; // gemini/local: an explicit model is required
  }
}

/**
 * Resolve the moderation AI config from the environment, or `undefined` when
 * unusable. Moderation runs per comment (cost- and latency-sensitive, usually
 * a small fast model, possibly a different vendor than theming), so every
 * field has its own `AI_MODERATION_*` override. Key/baseURL/model fall back to
 * the theming variables only when moderation uses the *same provider* as
 * theming — an OpenAI key is useless against Anthropic. A host that sets no
 * `AI_MODERATION_*` variables gets the same config as theming.
 */
export function resolveModerationAiConfig(): AiProviderConfig | undefined {
  const themeProvider = coerceProvider(process.env.AI_PROVIDER);
  const provider = coerceProvider(
    process.env.AI_MODERATION_PROVIDER || process.env.AI_PROVIDER,
  );
  const sameProvider = provider === themeProvider;
  const config: AiProviderConfig = {
    provider,
    apiKey:
      process.env.AI_MODERATION_API_KEY ||
      (sameProvider ? process.env.OPENAI_API_KEY : undefined),
    baseURL:
      process.env.AI_MODERATION_BASE_URL ||
      (sameProvider ? process.env.OPENAI_BASE_URL : undefined) ||
      (provider === "openai-compatible" ? "https://api.openai.com/v1" : undefined),
    model:
      process.env.AI_MODERATION_MODEL ||
      (sameProvider ? process.env.AI_THEME_MODEL : undefined) ||
      defaultModerationModel(provider),
  };
  return isAiConfigured(config) ? config : undefined;
}

/**
 * Per-tenant BYO provider config from `site_settings`, or `undefined` when the
 * tenant hasn't set one. The stored API key is decrypted here; callers layer
 * this over the platform/env default (`tenantConfig ?? ctx.ai`).
 */
export async function getTenantAiConfig(
  db: Database,
  tenantId: string,
): Promise<AiProviderConfig | undefined> {
  const settings = await getSiteSettings(db, tenantId);
  const provider = settings[SETTING_AI_PROVIDER];
  const model = settings[SETTING_AI_MODEL];
  if (!provider && !model) return undefined; // nothing configured for this tenant

  const config: AiProviderConfig = {
    provider: coerceProvider(provider),
    model: model || "",
    baseURL: settings[SETTING_AI_BASE_URL] || undefined,
    apiKey: decryptSecret(settings[SETTING_AI_API_KEY_ENC]) || undefined,
  };
  return isAiConfigured(config) ? config : undefined;
}
