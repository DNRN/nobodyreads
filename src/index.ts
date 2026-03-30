// Routers (Hono sub-apps)
export { createBlogApiRoutes } from "./content/index.js";
export type { BlogApiOptions } from "./content/index.js";
export { createEditorRoutes } from "./editor/index.js";
export type { EditorRouterOptions } from "./editor/index.js";
export {
  createSubscriptionApiRoutes,
  createSubscriptionAdminRoutes,
  notifySubscribers,
} from "./subscription/index.js";
export type { SubscriptionRouterOptions } from "./subscription/index.js";

// Database
export { initDb, getDb, getRawClient } from "./shared/db.js";
export type { Database } from "./db/index.js";
export {
  listPosts,
  listPostsForView,
  getPageBySlug,
  getPageByKind,
  getNavItems,
  resolvePageLinks,
  listAllPages,
  getPageById,
  deletePage,
  upsertPage,
  listContentViews,
  getContentViewBySlug,
  getContentViewById,
  deleteContentView,
  upsertContentView,
} from "./content/db.js";

// Validation schemas
export {
  pageFormSchema,
  viewFormSchema,
  siteBundleFormSchema,
  subscribeFormSchema,
  loginFormSchema,
} from "./db/validation.js";
export type {
  PageFormData,
  ViewFormData,
  SiteBundleFormData,
  SubscribeFormData,
  LoginFormData,
} from "./db/validation.js";

// HTTP utilities
export {
  html,
  json,
  redirect,
  serveStatic,
  parseFormBody,
  escapeHtml,
} from "./shared/http.js";
export type { HtmlOptions } from "./shared/http.js";

// Templates & rendering
export { renderPostListView } from "./content/templates.js";
export { renderMarkdown, resolveLinks, resolveViews, renderContent } from "./content/render.js";

// SEO
export { buildMetaTags, buildStructuredData, navHref } from "./shared/seo.js";

// Site bundle
export {
  getSiteBundle,
  getLatestSiteBundleRevision,
  getLatestSiteBundleRevisionId,
  listSiteBundleRevisions,
  getCurrentSiteBundleRevisionId,
  addSiteBundleRevision,
  setCurrentSiteBundleRevision,
  deleteSiteBundleRevision,
} from "./shared/site-bundle.js";
export type { SiteBundle, SiteBundleRevision } from "./shared/site-bundle.js";

// Types
export type {
  Page,
  PageSummary,
  NavItem,
  LinkTarget,
  ContentView,
  ContentViewKind,
  PostListViewConfig,
  LayoutOptions,
  PageMeta,
  PageKind,
  PageNav,
  FaqItem,
} from "./content/types.js";
export { DEFAULT_TENANT_ID, PLATFORM_TENANT_ID } from "./shared/types.js";
export type { Tenant } from "./shared/types.js";

// Package paths
export { getPublicDir, getSchemaPath, getRobotsTxtPath } from "./paths.js";
