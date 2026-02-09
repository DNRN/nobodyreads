// Routers
export { createBlogRouter } from "./content/index.js";
export type { BlogRouterOptions, RequestHandler } from "./content/index.js";
export { createEditorRouter } from "./editor/index.js";
export type { EditorRouterOptions } from "./editor/index.js";

// Database
export { initDb, getDb } from "./shared/db.js";
export {
  listPosts,
  getPageBySlug,
  getPageByKind,
  getNavItems,
  resolvePageLinks,
  listAllPages,
  getPageById,
  deletePage,
  upsertPage,
} from "./content/db.js";

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
export {
  defaultLayout,
  createBlogLayoutWithAuth,
  homePage,
  postPage,
  contentPage,
  notFoundPage,
} from "./content/templates.js";
export { renderMarkdown, resolveLinks } from "./content/render.js";

// SEO
export { buildMetaTags, buildStructuredData, navHref } from "./shared/seo.js";

// Types
export type {
  Page,
  PageSummary,
  NavItem,
  LinkTarget,
  LayoutFn,
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
