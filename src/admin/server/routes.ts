import { Hono } from "hono";
import { DEFAULT_TENANT_ID } from "../../shared/types.js";
import type { Database } from "../../db/index.js";
import type { MediaStorage } from "../../media/storage.js";
import type { EmailResolvable } from "../../subscription/email.js";
import type { AdminModuleContext, AiProviderConfig } from "./modules/types.js";
import type { ComfyProviderConfig } from "../../api/ai/comfy/config.js";
import { mountAuthRoutes } from "./modules/auth-routes.js";
import { createContentRoutes } from "./modules/content.js";
import { createThemeRoutes } from "./modules/theme.js";
import { createAiRoutes } from "./modules/ai.js";
import { createCoverImageRoutes } from "./modules/cover-image.js";
import { createModerationRoutes } from "./modules/moderation.js";
import { createMediaRoutes } from "./modules/media.js";
import { createViewRoutes } from "./modules/views.js";
import { createPaymentsAdminRoutes } from "./modules/payments.js";

export interface AdminRouterOptions {
  db: Database;
  storage?: MediaStorage;
  tenantId?: string;
  urlPrefix?: string;
  /**
   * Prefix prepended to generated media storage keys. Lets a host organize
   * uploads into per-tenant folders within a shared bucket, e.g.
   * `tenants/<id>/`. Defaults to "" (no prefix).
   */
  keyPrefix?: string;
  /**
   * Email provider/config used for new-post notifications. When omitted, the
   * file-based config is used. Multi-tenant hosts pass a per-tenant config.
   */
  email?: EmailResolvable;
  /** Absolute base URL used in notification emails (e.g. per-tenant site URL). */
  siteUrl?: string;
  /** Display name used in notification email branding. */
  siteName?: string;
  /**
   * OpenAI-compatible provider config for AI theming. The host owns the key and
   * endpoint; when omitted, AI routes return 503 and the AI panel is hidden.
   */
  ai?: AiProviderConfig;
  /**
   * Comfy Cloud config for AI cover-image generation. The host owns the key;
   * when omitted, cover-image routes return 503 and the generate UI is hidden.
   */
  comfy?: ComfyProviderConfig;
}

/** @deprecated Use AdminRouterOptions */
export type EditorRouterOptions = AdminRouterOptions;

function buildModuleContext(options: AdminRouterOptions): AdminModuleContext {
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const urlPrefix = options.urlPrefix ?? "";
  const adminBase = `${urlPrefix}/admin`;
  const editorBase = `${adminBase}/editor`;
  return {
    db: options.db,
    storage: options.storage,
    tenantId,
    urlPrefix,
    adminBase,
    editorBase,
    keyPrefix: options.keyPrefix,
    email: options.email,
    siteUrl: options.siteUrl,
    siteName: options.siteName,
    ai: options.ai,
    comfy: options.comfy,
  };
}

export function createAdminRoutes(options: AdminRouterOptions): Hono {
  const app = new Hono();
  const ctx = buildModuleContext(options);

  mountAuthRoutes(app, ctx);
  app.route("/", createMediaRoutes(ctx));
  app.route("/", createThemeRoutes(ctx));
  app.route("/", createAiRoutes(ctx));
  app.route("/", createCoverImageRoutes(ctx));
  app.route("/", createModerationRoutes(ctx));
  app.route("/", createContentRoutes(ctx));
  app.route("/", createViewRoutes(ctx));
  app.route("/", createPaymentsAdminRoutes(ctx));

  return app;
}

/** @deprecated Use createAdminRoutes */
export const createEditorRoutes = createAdminRoutes;
