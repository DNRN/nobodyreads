export {
  isFederationEnabled,
  getFederationConfig,
} from "./config.js";
export type { FederationConfig } from "./config.js";
export {
  buildFederatedSessionCookie,
  buildClearFederatedSessionCookie,
  getFederatedMemberIdentity,
  resolveFederatedMember,
} from "./auth.js";
export { buildAuthorizeUrl, exchangeCodeForIdentity } from "./client.js";
export { createFederatedAuthRoutes } from "./routes.js";
export type { FederatedAuthRouterOptions } from "./routes.js";
