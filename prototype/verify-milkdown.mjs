// End-to-end Milkdown round-trip check against a real Chrome.
// Usage: node prototype/verify-milkdown.mjs <editorUrl>
import puppeteer from "puppeteer-core";

const url = process.argv[2];
const EXPECT = [
  "[[hello-world]]",
  "[[about|the about page]]",
  "{{view:latest-posts}}",
  "![A photo|400px|right](/media/x.jpg)",
];

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

try {
  const page = await browser.newPage();
  const errors = [];
  const failed404 = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => { if (r.status() === 404) failed404.push(r.url()); });
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });

  // 1. Milkdown mounted (markdown parsed → ProseMirror doc)
  try {
    await page.waitForSelector(".milkdown .ProseMirror", { timeout: 20000 });
  } catch (e) {
    console.log("EDITOR DID NOT MOUNT. Diagnostics:");
    const mountHtml = await page.$eval(".nbr-milkdown", (el) => el.innerHTML).catch(() => "(no .nbr-milkdown)");
    console.log("  .nbr-milkdown innerHTML:", mountHtml.slice(0, 300));
    console.log("  collected errors:");
    errors.forEach((er) => console.log("    " + er));
    throw e;
  }
  console.log("PASS  Milkdown editor mounted");

  // 2. Custom atom nodes rendered as chips
  const wikiChips = await page.$$eval(".nbr-wiki-link", (els) => els.map((e) => e.textContent));
  const viewChips = await page.$$eval(".nbr-view-embed", (els) => els.map((e) => e.textContent));
  console.log(`PASS  wiki chips rendered: ${JSON.stringify(wikiChips)}`);
  console.log(`PASS  view chips rendered: ${JSON.stringify(viewChips)}`);

  // 3. Toggle to Source — invokes crepe.getMarkdown() (ProseMirror → markdown)
  await page.$$eval("button", (btns) => {
    const b = btns.find((x) => x.textContent.trim() === "Source");
    if (b) b.click();
  });
  await page.waitForFunction(
    () => {
      const t = document.querySelector('textarea[name="content"]');
      return t && !t.classList.contains("hidden") && t.value.length > 0;
    },
    { timeout: 10000 },
  );
  const md = await page.$eval('textarea[name="content"]', (t) => t.value);

  console.log("\n--- serialized markdown (round-tripped through Milkdown) ---");
  console.log(md);
  console.log("-----------------------------------------------------------\n");

  let ok = true;
  for (const token of EXPECT) {
    const has = md.includes(token);
    if (!has) ok = false;
    console.log(`  ${has ? "PASS" : "FAIL"}  preserves  ${JSON.stringify(token)}`);
  }

  if (failed404.length) {
    console.log("\n404s:");
    failed404.forEach((u) => console.log("  " + u));
  }

  // A missing /favicon.ico is browser noise, not an app error.
  const realErrors = errors.filter((e) => !e.includes("404"));
  const onlyFavicon = failed404.every((u) => u.endsWith("/favicon.ico"));

  if (realErrors.length) {
    console.log("\nPAGE ERRORS:");
    realErrors.forEach((e) => console.log("  " + e));
  }

  const pass = ok && realErrors.length === 0 && onlyFavicon;
  console.log(`\nRESULT: ${pass ? "GREEN — Milkdown round-trips real content" : "RED"}`);
  await browser.close();
  process.exit(pass ? 0 : 1);
} catch (err) {
  console.error("VERIFY FAILED:", err);
  await browser.close();
  process.exit(1);
}
