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

  // This file compiles to `dist/astro/integration.js`. The injected pages live
  // at `<pkg>/astro/_injected/admin/*.astro` — resolve them relative to here.
  const here = dirname(fileURLToPath(import.meta.url));
  const adminPagesRoot = resolve(here, "..", "..", "astro", "_injected", "admin");

  const entry = (relative: string) => resolve(adminPagesRoot, relative);

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
          pattern: `${pattern}/views`,
          entrypoint: entry("views/index.astro"),
        });
        injectRoute({
          pattern: `${pattern}/views/new`,
          entrypoint: entry("views/new.astro"),
        });
        injectRoute({
          pattern: `${pattern}/views/[id]`,
          entrypoint: entry("views/[id].astro"),
        });
        injectRoute({
          pattern: `${pattern}/media`,
          entrypoint: entry("media/index.astro"),
        });
        injectRoute({
          pattern: `${pattern}/layout`,
          entrypoint: entry("layout.astro"),
        });
        injectRoute({
          pattern: `${pattern}/settings`,
          entrypoint: entry("settings.astro"),
        });
      },
    },
  };
}
