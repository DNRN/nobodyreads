export { createAdminRoutes, createEditorRoutes } from "./server/routes.js";
export type { AdminRouterOptions, EditorRouterOptions } from "./server/routes.js";

export {
  editorRequiresAuth,
  isAuthenticatedRequest,
  buildSessionCookie,
  buildClearSessionCookies,
  verifyEditorPassword,
} from "./server/auth.js";

export { createContentRoutes } from "./server/modules/content.js";
export { createThemeRoutes } from "./server/modules/theme.js";
export { createMediaRoutes } from "./server/modules/media.js";
export { createViewRoutes } from "./server/modules/views.js";
export { mountAuthRoutes } from "./server/modules/auth-routes.js";
export type { AdminModuleContext } from "./server/modules/types.js";
