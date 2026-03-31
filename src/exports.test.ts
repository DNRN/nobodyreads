import { describe, it, expect } from "vitest";

import {
  // Routers
  createBlogApiRoutes,
  createEditorRoutes,
  createSubscriptionApiRoutes,
  createSubscriptionAdminRoutes,
  notifySubscribers,

  // Database
  initDb,
  getDb,
  getRawClient,

  // Schema tables
  tenant,
  page,
  contentView,
  siteTemplate,
  siteTemplateRevision,
  siteSettings,
  media,
  subscriber,

  // Content DB functions
  listPosts,
  getPageBySlug,
  upsertPage,
  deletePage,

  // Validation
  pageFormSchema,
  viewFormSchema,
  siteTemplateFormSchema,
  subscribeFormSchema,
  loginFormSchema,

  // HTTP utilities
  html,
  json,
  redirect,
  parseFormBody,
  escapeHtml,

  // Rendering
  renderMarkdown,
  renderContent,
  resolveLinks,
  resolveViews,

  // SEO
  buildMetaTags,
  buildStructuredData,

  // Site template
  getSiteTemplate,
  addSiteTemplateRevision,

  // Template system
  generateCss,
  generateHtml,
  DEFAULT_TEMPLATE,

  // Media storage
  createMediaStorage,
  LocalMediaStorage,
  GcsMediaStorage,

  // Auth
  editorRequiresAuth,
  isAuthenticatedRequest,
  buildSessionCookie,
  buildClearSessionCookies,
  verifyEditorPassword,

  // Types / constants
  DEFAULT_TENANT_ID,
  PLATFORM_TENANT_ID,

  // Paths
  getPublicDir,
  getSchemaPath,
  getRobotsTxtPath,
} from "./index.js";

describe("public API exports", () => {
  it("exports route factories", () => {
    expect(createBlogApiRoutes).toBeTypeOf("function");
    expect(createEditorRoutes).toBeTypeOf("function");
    expect(createSubscriptionApiRoutes).toBeTypeOf("function");
    expect(createSubscriptionAdminRoutes).toBeTypeOf("function");
    expect(notifySubscribers).toBeTypeOf("function");
  });

  it("exports database utilities", () => {
    expect(initDb).toBeTypeOf("function");
    expect(getDb).toBeTypeOf("function");
    expect(getRawClient).toBeTypeOf("function");
  });

  it("exports Drizzle schema tables", () => {
    expect(tenant).toBeDefined();
    expect(page).toBeDefined();
    expect(contentView).toBeDefined();
    expect(siteTemplate).toBeDefined();
    expect(siteTemplateRevision).toBeDefined();
    expect(siteSettings).toBeDefined();
    expect(media).toBeDefined();
    expect(subscriber).toBeDefined();
  });

  it("exports content DB functions", () => {
    expect(listPosts).toBeTypeOf("function");
    expect(getPageBySlug).toBeTypeOf("function");
    expect(upsertPage).toBeTypeOf("function");
    expect(deletePage).toBeTypeOf("function");
  });

  it("exports validation schemas", () => {
    expect(pageFormSchema).toBeDefined();
    expect(viewFormSchema).toBeDefined();
    expect(siteTemplateFormSchema).toBeDefined();
    expect(subscribeFormSchema).toBeDefined();
    expect(loginFormSchema).toBeDefined();
  });

  it("exports HTTP utilities", () => {
    expect(html).toBeTypeOf("function");
    expect(json).toBeTypeOf("function");
    expect(redirect).toBeTypeOf("function");
    expect(parseFormBody).toBeTypeOf("function");
    expect(escapeHtml).toBeTypeOf("function");
  });

  it("exports rendering functions", () => {
    expect(renderMarkdown).toBeTypeOf("function");
    expect(renderContent).toBeTypeOf("function");
    expect(resolveLinks).toBeTypeOf("function");
    expect(resolveViews).toBeTypeOf("function");
  });

  it("exports SEO utilities", () => {
    expect(buildMetaTags).toBeTypeOf("function");
    expect(buildStructuredData).toBeTypeOf("function");
  });

  it("exports site template functions", () => {
    expect(getSiteTemplate).toBeTypeOf("function");
    expect(addSiteTemplateRevision).toBeTypeOf("function");
  });

  it("exports template system", () => {
    expect(generateCss).toBeTypeOf("function");
    expect(generateHtml).toBeTypeOf("function");
    expect(DEFAULT_TEMPLATE).toBeDefined();
    expect(DEFAULT_TEMPLATE.tokens).toBeDefined();
    expect(DEFAULT_TEMPLATE.sections).toBeInstanceOf(Array);
  });

  it("exports media storage", () => {
    expect(createMediaStorage).toBeTypeOf("function");
    expect(LocalMediaStorage).toBeTypeOf("function");
    expect(GcsMediaStorage).toBeTypeOf("function");
  });

  it("exports auth utilities", () => {
    expect(editorRequiresAuth).toBeTypeOf("function");
    expect(isAuthenticatedRequest).toBeTypeOf("function");
    expect(buildSessionCookie).toBeTypeOf("function");
    expect(buildClearSessionCookies).toBeTypeOf("function");
    expect(verifyEditorPassword).toBeTypeOf("function");
  });

  it("exports tenant constants", () => {
    expect(DEFAULT_TENANT_ID).toBe("_default");
    expect(PLATFORM_TENANT_ID).toBe("_platform");
  });

  it("exports path utilities", () => {
    expect(getPublicDir).toBeTypeOf("function");
    expect(getSchemaPath).toBeTypeOf("function");
    expect(getRobotsTxtPath).toBeTypeOf("function");
  });
});
