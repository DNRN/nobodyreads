import type { Database } from "../../../db/index.js";
import { getSiteSettings } from "../../../shared/site-settings.js";
import { decryptSecret } from "../../../shared/secrets.js";

// --- Per-tenant Comfy Cloud settings keys (site_settings) ---
export const SETTING_COMFY_BASE_URL = "comfy_base_url";
/** Encrypted (see `secrets.ts`) BYO API key. Never returned to the client. */
export const SETTING_COMFY_API_KEY_ENC = "comfy_api_key_enc";

export interface ComfyProviderConfig {
  apiKey: string;
  baseUrl: string;
}

const DEFAULT_BASE_URL = "https://cloud.comfy.org";

/** Whether a resolved config can actually serve a request. */
export function isComfyConfigured(
  comfy: ComfyProviderConfig | undefined,
): comfy is ComfyProviderConfig {
  return !!comfy?.apiKey;
}

/**
 * Resolve the platform-default Comfy Cloud config from the environment, or
 * `undefined` when unusable. Mirrors {@link resolveModerationAiConfig} in
 * `../config.ts`: the host (`.me`) sets `COMFY_API_KEY`; without it the
 * feature is cleanly off (generation returns 503, never a crash).
 */
export function resolvePlatformComfyConfig(): ComfyProviderConfig | undefined {
  const config: ComfyProviderConfig = {
    apiKey: process.env.COMFY_API_KEY ?? "",
    baseUrl: process.env.COMFY_BASE_URL || DEFAULT_BASE_URL,
  };
  return isComfyConfigured(config) ? config : undefined;
}

/**
 * Per-tenant BYO Comfy Cloud config from `site_settings`, or `undefined` when
 * the tenant hasn't set one. The stored API key is decrypted here; callers
 * layer this over the platform default (`tenantConfig ?? ctx.comfy`).
 */
export async function getTenantComfyConfig(
  db: Database,
  tenantId: string,
): Promise<ComfyProviderConfig | undefined> {
  const settings = await getSiteSettings(db, tenantId);
  const apiKey = decryptSecret(settings[SETTING_COMFY_API_KEY_ENC]);
  if (!apiKey) return undefined; // nothing configured for this tenant

  const config: ComfyProviderConfig = {
    apiKey,
    baseUrl: settings[SETTING_COMFY_BASE_URL] || DEFAULT_BASE_URL,
  };
  return isComfyConfigured(config) ? config : undefined;
}

/**
 * The config a route should actually generate with: the tenant's BYO key when
 * they've set one, else the platform default passed down from `ctx.comfy`.
 * Every image-generation entry point (cover image, media library, …) resolves
 * the same way, so this is the one place that precedence is spelled out.
 */
export async function resolveEffectiveComfyConfig(
  db: Database,
  tenantId: string,
  platformComfy: ComfyProviderConfig | undefined,
): Promise<ComfyProviderConfig | undefined> {
  return (await getTenantComfyConfig(db, tenantId)) ?? platformComfy;
}
