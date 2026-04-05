import { Hono } from "hono";
import { DEFAULT_TENANT_ID } from "../../shared/types.js";
import type { Database } from "../../db/index.js";
import type { MediaStorage } from "../../media/storage.js";
import type { AdminModuleContext } from "./modules/types.js";
import { mountAuthRoutes } from "./modules/auth-routes.js";
import { createContentRoutes } from "./modules/content.js";
import { createThemeRoutes } from "./modules/theme.js";
import { createMediaRoutes } from "./modules/media.js";
import { createViewRoutes } from "./modules/views.js";

export interface AdminRouterOptions {
  db: Database;
  storage?: MediaStorage;
  tenantId?: string;
  urlPrefix?: string;
}

/** @deprecated Use AdminRouterOptions */
export type EditorRouterOptions = AdminRouterOptions;

function buildModuleContext(options: AdminRouterOptions): AdminModuleContext {
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const urlPrefix = options.urlPrefix ?? "";
  const adminBase = `${urlPrefix}/admin`;
  const editorBase = `${adminBase}/editor`;
  return { db: options.db, storage: options.storage, tenantId, adminBase, editorBase };
}

export function createAdminRoutes(options: AdminRouterOptions): Hono {
  const app = new Hono();
  const ctx = buildModuleContext(options);

  mountAuthRoutes(app, ctx);
  app.route("/", createMediaRoutes(ctx));
  app.route("/", createThemeRoutes(ctx));
  app.route("/", createContentRoutes(ctx));
  app.route("/", createViewRoutes(ctx));

  return app;
}

/** @deprecated Use createAdminRoutes */
export const createEditorRoutes = createAdminRoutes;
