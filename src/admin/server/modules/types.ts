import type { Database } from "../../../db/index.js";
import type { MediaStorage } from "../../../media/storage.js";
import type { EmailResolvable } from "../../../subscription/email.js";

/**
 * OpenAI-compatible provider config for AI theming. The engine is vendor- and
 * key-agnostic: the host supplies these; when absent, AI routes return 503 and
 * the host should hide the AI admin panel.
 */
export interface AiProviderConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface AdminModuleContext {
  db: Database;
  storage?: MediaStorage;
  tenantId: string;
  /** URL prefix the host mounts this package under (e.g. per-tenant base). */
  urlPrefix: string;
  adminBase: string;
  editorBase: string;
  /** Prefix prepended to generated media storage keys (e.g. per-tenant folder). */
  keyPrefix?: string;
  /** Email provider/config for publish notifications. Falls back to file config. */
  email?: EmailResolvable;
  /** Absolute base URL used in notification emails. */
  siteUrl?: string;
  /** Display name used in notification email branding. */
  siteName?: string;
  /** OpenAI-compatible provider config for AI theming. When absent, AI is off. */
  ai?: AiProviderConfig;
}
