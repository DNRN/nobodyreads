// API route groups (public reads vs member/admin interface)
export { createPublicApiRoutes } from "./api/public.js";
export type { PublicApiOptions } from "./api/public.js";
export { createInterfaceApiRoutes } from "./api/interface.js";
export type { InterfaceApiOptions } from "./api/interface.js";
export { createAiApiRoutes } from "./api/ai/ai.routes.js";
export type { AiApiOptions } from "./api/ai/ai.routes.js";
export { createThemeProvider } from "./api/ai/provider.js";
export type { AIThemeProvider } from "./api/ai/provider.js";
export { createModerationProvider } from "./api/ai/moderation-provider.js";
export type { AIModerationProvider } from "./api/ai/moderation-provider.js";
export {
  resolveAiProviderConfig,
  resolveModerationAiConfig,
  getTenantAiConfig,
  isAiConfigured,
  SETTING_AI_PROVIDER,
  SETTING_AI_MODEL,
  SETTING_AI_BASE_URL,
  SETTING_AI_API_KEY_ENC,
} from "./api/ai/config.js";
export { recordThemeGeneration, recordModerationCheck } from "./api/ai/metering.js";
export {
  encryptSecret,
  decryptSecret,
  isSecretsEncryptionAvailable,
} from "./shared/secrets.js";

// Routers (Hono sub-apps)
export { createBlogApiRoutes } from "./content/routes.js";
export type { BlogApiOptions } from "./content/routes.js";
export { createFeedRoutes } from "./content/feed.js";
export type { FeedOptions } from "./content/feed.js";

// Comments
export {
  createCommentRoutes,
  listComments,
  getCommentById,
  createComment,
  softDeleteComment,
  setPinnedComment,
  unholdComment,
  countRecentCommentsByMember,
} from "./comments/index.js";
export type {
  CommentRouterOptions,
  CommentModerationOptions,
  Comment,
  NewComment,
} from "./comments/index.js";

// Moderation (file-sourced ruleset + AI-assisted comment review)
export {
  reviewComment,
  DEFAULT_RULESET_PATH,
  loadRulesetFile,
  clearRulesetCache,
  fileRulesetSource,
  SETTING_MODERATION_AUTO_HIDE,
  getModerationAutoHide,
  setModerationAutoHide,
  enqueueModerationFlag,
  listModerationQueue,
  getModerationFlagById,
  resolveModerationFlag,
  countPendingFlags,
  moderationVerdictSchema,
  moderationVerdictJsonSchema,
  buildModerationSystemPrompt,
  buildModerationUserPrompt,
  parseModerationVerdict,
} from "./moderation/index.js";
export type {
  ModerationDecision,
  ReviewCommentOptions,
  ModerationCallInput,
  RulesetSource,
  ModerationVerdict,
  ModerationVerdictKind,
  ModerationFlag,
  ModerationQueueItem,
  ModerationQueueStatus,
  FlaggedCommentEvent,
} from "./moderation/index.js";
export { createAdminRoutes, createEditorRoutes } from "./admin/server/routes.js";
export type { AdminRouterOptions, EditorRouterOptions } from "./admin/server/routes.js";
export { createContentRoutes } from "./admin/server/modules/content.js";
export { createThemeRoutes } from "./admin/server/modules/theme.js";
export { createAiRoutes } from "./admin/server/modules/ai.js";
export { createModerationRoutes } from "./admin/server/modules/moderation.js";
export { createMediaRoutes } from "./admin/server/modules/media.js";
export { createViewRoutes } from "./admin/server/modules/views.js";
export { createPaymentsAdminRoutes } from "./admin/server/modules/payments.js";
export { mountAuthRoutes } from "./admin/server/modules/auth-routes.js";
export type { AdminModuleContext, AiProviderConfig, AiProvider } from "./admin/server/modules/types.js";
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
  combineResolvers,
  getLocalMemberIdentity,
  getMemberIdFromRequest,
  buildMemberSessionCookie,
  buildClearMemberSessionCookie,
  createMember,
  getMemberById,
  verifyMemberCredentials,
  joinPlot,
  leavePlot,
  isPlotMember,
  countPlotMembers,
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
  plotMembership,
  postLike,
  comment,
  moderationQueue,
  paidTier,
  entitlement,
  paymentEvent,
  paymentCustomer,
} from "./db/schema/index.js";
export {
  listPosts,
  listPostsForView,
  listFeedPosts,
  getPostStats,
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
  auditCustomViews,
  validateCustomQuery,
  CUSTOM_VIEW_ALLOWED_TABLES,
  listMedia,
} from "./content/db.js";
export type { CustomViewIssue } from "./content/db.js";
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

// Starter content
export { defaultHomePage, buildDefaultHomeContent } from "./content/defaults.js";
export type { DefaultHomePageOptions } from "./content/defaults.js";

// Templates & rendering
export { renderPostListView, heroMetaLine } from "./content/templates.js";
export type { PostListVariant, PostListRenderOptions } from "./content/templates.js";
export { renderMarkdown, resolveLinks, resolveViews, renderContent } from "./content/render.js";
export type { RenderMarkdownOptions, RenderContentOptions } from "./content/render.js";

// The collection embed token. Exported so admin UIs render the token they are
// telling an author to copy, rather than restating its spelling.
export {
  EMBED_TOKEN_NAME,
  EMBED_TOKEN_NAMES,
  embedToken,
  embedTokenPattern,
  hasEmbedToken,
} from "./shared/embed-token.js";
export type { EmbedTokenName } from "./shared/embed-token.js";

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
  themeDiffSchema,
  themeDiffJsonSchema,
  applyThemeDiff,
  // The canonical palette, plus the machinery to render it into a host's own
  // token vocabulary. A host generates its chrome from this rather than
  // keeping a copy of the hexes in step by hand.
  PALETTE,
  FONTS,
  alpha,
  renderDeclarations,
  replaceGeneratedRegion,
  GENERATED_BEGIN,
  GENERATED_END,
} from "./template/index.js";
export type { ThemeDiff } from "./template/index.js";
export type { Palette, ThemeName } from "./template/index.js";
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
  MenuItem,
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

// Payments — entitlements, the paywall gate, and paid tiers.
export {
  resolvePageAccess,
  redactPage,
  getReadableContent,
  requiresPrivateCache,
  buildTeaser,
  nowSeconds,
  listPaidTiers,
  getActivePaidTier,
  getPaidTierById,
  upsertPaidTier,
  deletePaidTier,
  hasPageAccess,
  listMemberEntitlements,
  getEntitlement,
  grantEntitlement,
  revokeEntitlement,
  upsertPaymentCustomer,
  getPaymentCustomerRef,
  toAccessTier,
  ACCESS_TIERS,
  DEFAULT_TEASER_WORDS,
  createPaymentsRoutes,
  createPaymentsWebhookRoutes,
  applyEntitlementEvents,
  createPaymentProvider,
  createSiteSettingsPaymentSource,
  getTenantPaymentsConfig,
  resolvePaymentsConfig,
  isPaymentsConfigured,
  createStripeProvider,
  mapStripeEventToEntitlementEvents,
  invoiceMetadata,
  ENTITLEMENT_GRACE_SECONDS,
  SETTING_PAYMENTS_PROVIDER,
  SETTING_PAYMENTS_PUBLISHABLE_KEY,
  SETTING_PAYMENTS_SECRET_KEY_ENC,
  SETTING_PAYMENTS_WEBHOOK_SECRET_ENC,
} from "./payments/index.js";
export type {
  AccessTier,
  AccessDecision,
  PageAccessOptions,
  PaidTier,
  Entitlement,
  EntitlementScope,
  TeaserOptions,
  GrantEntitlementInput,
  RevokeEntitlementInput,
  PaymentProvider,
  PaymentProviderSource,
  ChargeContext,
  ChargeContextResolver,
  CheckoutRequest,
  CheckoutSession,
  EntitlementEvent,
  PaymentsConfig,
  PaymentsRouterOptions,
  PaymentsWebhookOptions,
  ApplyResult,
  StripeProviderOptions,
  StripeTaxOptions,
} from "./payments/index.js";
