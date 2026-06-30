/**
 * Bundles the public, progressive-enhancement browser scripts
 * (src/client/*.ts) into self-contained IIFE files in public/.
 *
 * Why a script and not a vite.config: these need stable, un-hashed output
 * names — `/site.js`, `/community.js`, `/comments.js` are hardcoded in the
 * layouts and, for comments, persisted in tenant `scripts` arrays in the DB.
 * Each entry is built as its own single-file IIFE (Vite lib mode) so shared
 * helpers are inlined per bundle and no code-split chunks are emitted.
 *
 *   npm run build:client          one-shot build
 *   npm run dev:client            rebuild on change (--watch)
 */
import { build } from "vite";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const entries: Record<string, string> = {
  site: r("../src/client/site.ts"),
  community: r("../src/client/community.ts"),
  comments: r("../src/client/comments.ts"),
};

const watch = process.argv.includes("--watch");

for (const [name, entry] of Object.entries(entries)) {
  await build({
    configFile: false,
    logLevel: "warn",
    // We emit straight into public/; there is no separate static dir to copy.
    publicDir: false,
    build: {
      outDir: "public",
      emptyOutDir: false, // keep the hand-authored CSS in public/
      minify: true,
      watch: watch ? {} : null,
      lib: {
        entry,
        formats: ["iife"],
        // IIFE needs a global name even though these scripts only run for
        // side effects and export nothing.
        name: `__nb_${name}`,
        fileName: () => `${name}.js`,
      },
      rollupOptions: {
        output: { inlineDynamicImports: true },
      },
    },
  });
}
