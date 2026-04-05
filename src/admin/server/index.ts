export { createAdminRoutes, createEditorRoutes } from "./routes.js";
export type { AdminRouterOptions, EditorRouterOptions } from "./routes.js";

export {
  editorRequiresAuth,
  isAuthenticatedRequest,
  buildSessionCookie,
  buildClearSessionCookies,
  verifyEditorPassword,
} from "./auth.js";

export { createContentRoutes } from "./modules/content.js";
export { createThemeRoutes } from "./modules/theme.js";
export { createMediaRoutes } from "./modules/media.js";
export { createViewRoutes } from "./modules/views.js";
export { mountAuthRoutes } from "./modules/auth-routes.js";
export type { AdminModuleContext } from "./modules/types.js";
