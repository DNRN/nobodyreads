import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import { nobodyreadsAdmin } from "./src/astro/integration.ts";

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  output: "server",
  adapter: node({ mode: "middleware" }),
  srcDir: "./astro",
  outDir: "./dist/astro",
  publicDir: "./public",
  integrations: [nobodyreadsAdmin({ pattern: "/admin" })],
  vite: {
    // This package self-references via `nobodyreads/…` from its own injected
    // admin pages for DX parity with the published package. Map the package
    // name to local source so Vite can resolve the imports during the
    // package's own build.
    resolve: {
      alias: [
        { find: /^nobodyreads\/astro\/context$/, replacement: r("./src/astro/context.ts") },
        { find: /^nobodyreads\/astro$/, replacement: r("./src/astro/index.ts") },
        { find: /^nobodyreads\/storage$/, replacement: r("./src/media/storage.ts") },
        { find: /^nobodyreads\/schema$/, replacement: r("./src/db/schema.ts") },
        { find: /^nobodyreads$/, replacement: r("./src/index.ts") },
      ],
    },
  },
});
