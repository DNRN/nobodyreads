import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import svelte from "@astrojs/svelte";
import { nobodyreadsAdmin } from "./src/astro/integration.ts";

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  output: "server",
  server: {
    host: true,
    port: 4321,
  },
  adapter: node({ mode: "middleware" }),
  srcDir: "./astro",
  outDir: "./dist/astro",
  publicDir: "./public",
  // Svelte powers the interactive admin islands only (Phase 2+). The public
  // site stays zero-framework — it ships no islands, so no Svelte runtime is
  // sent there.
  integrations: [svelte(), nobodyreadsAdmin({ pattern: "/admin" })],
  vite: {
    // This package self-references via `nobodyreads/…` from its own injected
    // admin pages for DX parity with the published package. Map the package
    // name to local source so Vite can resolve the imports during the
    // package's own build.
    resolve: {
      alias: [
        { find: /^nobodyreads\/astro\/context$/, replacement: r("./src/astro/context.ts") },
        { find: /^nobodyreads\/astro$/, replacement: r("./src/astro/index.ts") },
        { find: /^nobodyreads\/editor\/milkdown$/, replacement: r("./src/admin/client/milkdown/index.ts") },
        { find: /^nobodyreads\/editor$/, replacement: r("./src/admin/client/index.ts") },
        { find: /^nobodyreads\/storage$/, replacement: r("./src/media/storage.ts") },
        { find: /^nobodyreads\/schema$/, replacement: r("./src/db/schema.ts") },
        { find: /^nobodyreads$/, replacement: r("./src/index.ts") },
      ],
      // Milkdown (ProseMirror) must run as a single instance — multiple copies
      // of these break plugin/schema identity checks at runtime. Collapse the
      // nested copies Milkdown ships to one.
      dedupe: [
        "prosemirror-state",
        "prosemirror-model",
        "prosemirror-view",
        "prosemirror-transform",
        "prosemirror-keymap",
      ],
    },
  },
});
