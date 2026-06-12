// Routers (Hono sub-apps)
export { createBlogApiRoutes } from "./content/index.js";
export type { BlogApiOptions } from "./content/index.js";
export { createAdminRoutes, createEditorRoutes } from "./admin/server/routes.js";
export type { AdminRouterOptions, EditorRouterOptions } from "./admin/server/routes.js";
export { createContentRoutes } from "./admin/server/modules/content.js";
export { createThemeRoutes } from "./admin/server/modules/theme.js";
export { createMediaRoutes } from "./admin/server/modules/media.js";
export { createViewRoutes } from "./admin/server/modules/views.js";
export { mountAuthRoutes } from "./admin/server/modules/auth-routes.js";
export type { AdminModuleContext } from "./admin/server/modules/types.js";
export {
  createSubscriptionApiRoutes,
  createSubscriptionAdminRoutes,
  notifySubscribers,
} from "./subscription/index.js";
export type {
  SubscriptionRouterOptions,
  NotifyOptions,
} from "./subscription/index.js";

// Community (memberships, likes, local member accounts)
export {
  createCommunityRoutes,
  createMemberAuthRoutes,
  resolveLocalMember,
  getLocalMemberIdentity,
  getMemberIdFromRequest,
  buildMemberSessionCookie,
  buildClearMemberSessionCookie,
  createMember,
  getMemberById,
  verifyMemberCredentials,
  joinSpace,
  leaveSpace,
  isSpaceMember,
  countSpaceMembers,
  likePost,
  unlikePost,
  countPostLikes,
  hasLikedPost,
  LOCAL_MEMBER_ISSUER,
} from "./community/index.js";
export type {
  CommunityRouterOptions,
  MemberAuthRouterOptions,
  MemberRecord,
  MemberIdentity,
  ResolveMember,
} from "./community/index.js";

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
  member,
  spaceMembership,
  postLike,
} from "./db/schema.js";
export {
  listPosts,
  listPostsForView,
  getPageBySlug,
  getPageByKind,
  findPageByKind,
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
  listMedia,
} from "./content/db.js";
export { listAllSubscribers, countSubscribers } from "./subscription/db.js";
export type { SubscriberCounts } from "./subscription/db.js";
export {
  isEmailEnabled,
  createEmailProvider,
  registerEmailProvider,
  resolveEmailProvider,
  isEmailProvider,
  loadEmailConfig,
  emailConfigSchema,
  DEFAULT_EMAIL_CONFIG_PATH,
} from "./subscription/email.js";
export type {
  EmailProvider,
  EmailMessage,
  EmailFrom,
  EmailProviderContext,
  EmailProviderFactory,
  EmailConfig,
  EmailResolvable,
} from "./subscription/email.js";

// Validation schemas
export {
  pageFormSchema,
  viewFormSchema,
  siteTemplateFormSchema,
  subscribeFormSchema,
  loginFormSchema,
  memberSignupFormSchema,
  memberLoginFormSchema,
} from "./db/validation.js";
export type {
  PageFormData,
  ViewFormData,
  SiteTemplateFormData,
  SubscribeFormData,
  LoginFormData,
  MemberSignupFormData,
  MemberLoginFormData,
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
  resolveMediaValue,
  resolveSiteIdentity,
  SITE_IDENTITY_FIELDS,
  SETTING_SITE_NAME,
  SETTING_SITE_TAGLINE,
  SETTING_SITE_LOGO,
  SETTING_SITE_FAVICON,
  SETTING_SITE_OG_IMAGE,
} from "./shared/site-settings.js";
export type {
  SiteIdentityField,
  SiteIdentityFieldType,
  ResolvedSiteIdentity,
} from "./shared/site-settings.js";

// Template system
export {
  generateCss,
  generateHtml,
  DEFAULT_TEMPLATE,
  componentRegistry,
  getComponentByName,
  serializeRegistry,
  validateTheme,
  normalizeComponents,
} from "./template/index.js";
export type {
  SiteTemplateDefinition,
  TokenSet,
  SectionConfig,
  ComponentConfig,
  ComponentMap,
  ComponentVariants,
  LegacyComponentVariants,
  CustomToken,
  ThemeMeta,
  ComponentTokenDef,
  ComponentDefinition,
  SerializableComponentDefinition,
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
  CustomViewConfig,
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
  loadStorageConfig,
  storageConfigSchema,
  DEFAULT_STORAGE_CONFIG_PATH,
  LocalMediaStorage,
  GcsMediaStorage,
  S3MediaStorage,
} from "./media/storage.js";
export type {
  MediaStorage,
  StoredFile,
  StorageConfig,
} from "./media/storage.js";

// Editor auth
export {
  guardAuth,
  editorRequiresAuth,
  isAuthenticatedRequest,
  buildSessionCookie,
  buildClearSessionCookies,
  verifyEditorPassword,
} from "./admin/server/auth.js";

// Package paths
export { getPublicDir, getSchemaPath, getRobotsTxtPath } from "./paths.js";
