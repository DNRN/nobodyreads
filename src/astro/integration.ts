import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { AstroIntegration } from "astro";

export interface NobodyreadsAdminIntegrationOptions {
  /**
   * URL pattern under which the admin pages are mounted.
   *
   * Examples:
   * - `"/admin"` (single-tenant)
   * - `"/[nickname]/admin"` (multi-tenant, requires middleware that resolves
   *   `nickname` → tenant and populates `Astro.locals.nobodyreadsAdmin`)
   *
   * Trailing slashes are stripped.
   */
  pattern?: string;
  /**
   * URL pattern for the public site base under which the owner-only draft
   * **preview** pages are mounted (`{sitePattern}/preview`, `/preview/[...path]`,
   * `/preview/revision.json`). This is the AI/Design editors' live-preview
   * iframe target.
   *
   * Multi-tenant hosts pass the site base, e.g. `"/[nickname]"`, and must have
   * middleware that authorizes the owner and populates
   * `Astro.locals.nobodyreadsAdmin` for `{sitePattern}/preview` too.
   *
   * When omitted, no preview routes are injected — single-tenant hosts that
   * already ship their own `/preview` pages (or don't want them) are unaffected.
   * Trailing slashes are stripped.
   */
  sitePattern?: string;
}

/**
 * Astro integration that injects the nobodyreads admin UI at a configurable
 * URL pattern. Pages live inside this package at `astro/_injected/admin/` so
 * they are not auto-routed by the consuming app; this integration is the only
 * way to expose them.
 */
export function nobodyreadsAdmin(
  options: NobodyreadsAdminIntegrationOptions = {}
): AstroIntegration {
  const pattern = (options.pattern ?? "/admin").replace(/\/+$/, "") || "/admin";
  const sitePattern = options.sitePattern
    ? options.sitePattern.replace(/\/+$/, "")
    : null;

  // This file compiles to `dist/astro/integration.js`. The injected pages live
  // at `<pkg>/astro/_injected/**` — resolve them relative to here.
  const here = dirname(fileURLToPath(import.meta.url));
  const injectedRoot = resolve(here, "..", "..", "astro", "_injected");
  const adminPagesRoot = resolve(injectedRoot, "admin");
  const previewPagesRoot = resolve(injectedRoot, "preview");

  const entry = (relative: string) => resolve(adminPagesRoot, relative);
  const previewEntry = (relative: string) => resolve(previewPagesRoot, relative);

  return {
    name: "nobodyreads-admin",
    hooks: {
      "astro:config:setup": ({ injectRoute }) => {
        injectRoute({ pattern, entrypoint: entry("index.astro") });
        injectRoute({
          pattern: `${pattern}/editor`,
          entrypoint: entry("editor/index.astro"),
        });
        injectRoute({
          pattern: `${pattern}/editor/new`,
          entrypoint: entry("editor/new.astro"),
        });
        injectRoute({
          pattern: `${pattern}/editor/[id]`,
          entrypoint: entry("editor/[id].astro"),
        });
        injectRoute({
          pattern: `${pattern}/editor/site`,
          entrypoint: entry("editor/site.astro"),
        });
        injectRoute({
          pattern: `${pattern}/collections`,
          entrypoint: entry("collections/index.astro"),
        });
        injectRoute({
          pattern: `${pattern}/collections/new`,
          entrypoint: entry("collections/new.astro"),
        });
        injectRoute({
          pattern: `${pattern}/collections/[id]`,
          entrypoint: entry("collections/[id].astro"),
        });

        // Pre-rename URLs. Collections used to live at `/views`; these 301 to
        // the new path so bookmarks and old links survive.
        const legacyViews = entry("collections/legacy-redirect.astro");
        injectRoute({ pattern: `${pattern}/views`, entrypoint: legacyViews });
        injectRoute({ pattern: `${pattern}/views/new`, entrypoint: legacyViews });
        injectRoute({ pattern: `${pattern}/views/[id]`, entrypoint: legacyViews });
        injectRoute({
          pattern: `${pattern}/media`,
          entrypoint: entry("media/index.astro"),
        });
        injectRoute({
          pattern: `${pattern}/layout`,
          entrypoint: entry("layout.astro"),
        });
        injectRoute({
          pattern: `${pattern}/ai`,
          entrypoint: entry("ai.astro"),
        });
        injectRoute({
          pattern: `${pattern}/community`,
          entrypoint: entry("community/index.astro"),
        });
        injectRoute({
          pattern: `${pattern}/moderation`,
          entrypoint: entry("moderation/index.astro"),
        });
        injectRoute({
          pattern: `${pattern}/payments`,
          entrypoint: entry("payments/index.astro"),
        });
        injectRoute({
          pattern: `${pattern}/settings`,
          entrypoint: entry("settings.astro"),
        });

        // Owner-only draft preview surface (the editors' live-preview iframe).
        // Only injected when a host opts in via `sitePattern`; single-tenant
        // hosts keep their own `/preview` pages.
        if (sitePattern) {
          injectRoute({
            pattern: `${sitePattern}/preview`,
            entrypoint: previewEntry("index.astro"),
          });
          injectRoute({
            pattern: `${sitePattern}/preview/revision.json`,
            entrypoint: previewEntry("revision.json.ts"),
          });
          injectRoute({
            pattern: `${sitePattern}/preview/[...path]`,
            entrypoint: previewEntry("[...path].astro"),
          });
        }
      },
    },
  };
}
