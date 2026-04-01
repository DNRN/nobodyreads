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
  tenant,
  page,
  contentView,
  siteTemplate,
  siteTemplateRevision,
  siteSettings,
  media,
  subscriber,
} from "./db/schema.js";
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
  siteTemplateFormSchema,
  subscribeFormSchema,
  loginFormSchema,
} from "./db/validation.js";
export type {
  PageFormData,
  ViewFormData,
  SiteTemplateFormData,
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

// Site template
export {
  getSiteTemplate,
  getLatestSiteTemplateRevision,
  getLatestSiteTemplateRevisionId,
  listSiteTemplateRevisions,
  getCurrentSiteTemplateRevisionId,
  addSiteTemplateRevision,
  setCurrentSiteTemplateRevision,
  deleteSiteTemplateRevision,
} from "./shared/site-bundle.js";
export type { SiteTemplateRecord, SiteTemplateRevisionRecord } from "./shared/site-bundle.js";

// Site settings
export {
  getSiteSettings,
  getSiteSetting,
  setSiteSetting,
  deleteSiteSetting,
} from "./shared/site-settings.js";

// Template system
export {
  generateCss,
  generateHtml,
  DEFAULT_TEMPLATE,
} from "./template/index.js";
export type {
  SiteTemplateDefinition,
  TokenSet,
  SectionConfig,
  ComponentVariants,
  CustomToken,
  ThemeMeta,
} from "./template/index.js";

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

// Media storage
export {
  createMediaStorage,
  LocalMediaStorage,
  GcsMediaStorage,
} from "./media/storage.js";
export type { MediaStorage, StoredFile } from "./media/storage.js";

// Editor auth
export {
  editorRequiresAuth,
  isAuthenticatedRequest,
  buildSessionCookie,
  buildClearSessionCookies,
  verifyEditorPassword,
} from "./editor/auth.js";

// Package paths
export { getPublicDir, getSchemaPath, getRobotsTxtPath } from "./paths.js";
