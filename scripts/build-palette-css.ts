/**
 * Regenerates the palette-derived `:root` blocks in the shipped stylesheets
 * from `src/template/palette.ts`.
 *
 * Why a script and not a CSS build: both files are served verbatim —
 * `public/style.css` by the static-file middleware, `public/editor.css` via
 * the `nobodyreads/editor/styles` export — so they have to stay real, readable
 * CSS on disk. Generating in place keeps the colours in a reviewable git diff
 * while making the palette module the only thing anyone edits.
 *
 *   npm run build:palette         rewrite the generated regions
 *   npm run build:palette -- --check    fail if they are stale (no writes)
 *
 * `palette.test.ts` runs the same check, so a stale stylesheet fails `npm test`
 * as well as the build.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  renderEditorCss,
  renderFallbackCss,
  replaceGeneratedRegion,
} from "../src/template/palette-css.js";

const targets = [
  {
    label: "public/style.css",
    path: fileURLToPath(new URL("../public/style.css", import.meta.url)),
    render: renderFallbackCss,
  },
  {
    label: "public/editor.css",
    path: fileURLToPath(new URL("../public/editor.css", import.meta.url)),
    render: renderEditorCss,
  },
];

const check = process.argv.includes("--check");
let stale = 0;

for (const target of targets) {
  const current = await readFile(target.path, "utf8");
  const next = replaceGeneratedRegion(current, target.render(), target.label);

  if (current === next) {
    if (!check) console.log(`  ${target.label} — up to date`);
    continue;
  }

  stale++;
  if (check) {
    console.error(`  ${target.label} — STALE`);
    continue;
  }

  await writeFile(target.path, next, "utf8");
  console.log(`  ${target.label} — regenerated`);
}

if (check && stale > 0) {
  console.error(
    `\n${stale} stylesheet(s) out of step with src/template/palette.ts. ` +
      `Run \`npm run build:palette\`.`,
  );
  process.exit(1);
}
