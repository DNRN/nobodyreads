import type { Database } from "../../../db/index.js";
import type { MediaStorage } from "../../../media/storage.js";
import type { EmailResolvable } from "../../../subscription/email.js";
import type { ComfyProviderConfig } from "../../../api/ai/comfy/config.js";
import type { PageKind } from "../../../content/types.js";

/** AI backend an {@link AiProviderConfig} targets. */
export type AiProvider = "openai-compatible" | "anthropic" | "gemini" | "local";

/**
 * Vendor-neutral AI provider config, used for theme generation today and reused
 * by later AI features (e.g. comment moderation). The engine is vendor- and
 * key-agnostic: the host supplies this; when absent, AI routes return 503 and
 * the host should hide the AI admin panel. `apiKey`/`baseURL` are optional
 * because the `local` (Ollama/llama.cpp) provider needs neither, and hosted
 * providers supply their own default endpoint.
 */
export interface AiProviderConfig {
  provider: AiProvider;
  apiKey?: string;
  baseURL?: string;
  model: string;
}

/**
 * A post or page has just gone from unpublished to published.
 *
 * Fired on the *transition*, not on every save, so an author editing a live
 * post does not re-trigger whatever the host hangs off this. The same condition
 * already gates subscriber notification — publishing is the moment content
 * becomes someone else's problem, which is exactly when a multi-tenant host
 * wants to look at it.
 */
export interface ContentPublishedEvent {
  tenantId: string;
  pageId: string;
  kind: PageKind;
  slug: string;
  title: string;
  /** The markdown body as stored. */
  content: string;
  excerpt: string;
  /** `public`, `members`, `paid`, … — what a reader must be to see it. */
  accessTier: string;
}

/** A file has just been accepted into the media library. */
export interface MediaUploadedEvent {
  tenantId: string;
  mediaId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
  /**
   * The bytes as uploaded. Handed over directly rather than made re-readable
   * from storage, so a host screening uploads never has to make unreviewed
   * media publicly fetchable in order to look at it.
   */
  data: Buffer;
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
  /** Comfy Cloud config for AI cover-image generation. When absent, it's off. */
  comfy?: ComfyProviderConfig;
  /**
   * Fired (never awaited) when a post or page is first published. Errors are
   * logged and swallowed: a host's screening or indexing must not be able to
   * fail an author's save.
   */
  onContentPublished?: (event: ContentPublishedEvent) => void | Promise<void>;
  /**
   * Fired (never awaited) when a file is uploaded to the media library. Same
   * contract as {@link onContentPublished}.
   */
  onMediaUploaded?: (event: MediaUploadedEvent) => void | Promise<void>;
}
