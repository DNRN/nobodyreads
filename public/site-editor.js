// --- Site editor: tabs + live preview for HTML/CSS/JS ---
(function () {
  "use strict";

  const form = document.getElementById("site-editor-form");
  const tabs = document.getElementById("site-editor-tabs");
  const panes = document.querySelectorAll(".site-editor-pane");
  const htmlInput = document.getElementById("site-html");
  const cssInput = document.getElementById("site-css");
  const jsInput = document.getElementById("site-js");
  const preview = document.getElementById("site-preview");

  if (!form || !tabs || !htmlInput || !cssInput || !jsInput || !preview) return;

  let previewTimer = null;

  function buildPreviewHtml() {
    const html = htmlInput.value || "";
    const css = cssInput.value || "";
    const js = jsInput.value || "";
    const contentHtml = "<main><h1>Preview</h1><p>Your page content renders here.</p></main>";
    const navHtml = '<a href="#">Home</a><a href="#">About</a><a href="#">Posts</a>';
    const nowYear = new Date().getFullYear();
    const bodyHtml = html
      .replaceAll("{{nav}}", navHtml)
      .replaceAll("{{siteTagline}}", "Edit your site layout")
      .replaceAll("{{homeHref}}", "/")
      .replaceAll("{{year}}", String(nowYear))
      .replaceAll("{{authLinksBlock}}", "")
      .replaceAll("{{navToggle}}", "");
    const resolvedBody = bodyHtml.includes("{{content}}")
      ? bodyHtml.replaceAll("{{content}}", contentHtml)
      : `${bodyHtml}\n${contentHtml}`;

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${css}</style>
  </head>
  <body>
    ${resolvedBody}
    <script type="module">${js}</script>
  </body>
</html>`;
  }

  function updatePreview() {
    const doc = buildPreviewHtml();
    preview.setAttribute("srcdoc", doc);
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 150);
  }

  htmlInput.addEventListener("input", schedulePreview);
  cssInput.addEventListener("input", schedulePreview);
  jsInput.addEventListener("input", schedulePreview);

  function activateTab(target) {
    tabs.querySelectorAll(".editor-tab").forEach((t) => t.classList.remove("active"));
    tabs.querySelector(`.editor-tab[data-tab="${target}"]`)?.classList.add("active");
    panes.forEach((pane) => {
      const isTarget = pane.getAttribute("data-pane") === target;
      pane.classList.toggle("hidden", !isTarget);
    });
    if (target === "preview") updatePreview();
  }

  tabs.addEventListener("click", function (e) {
    const tab = e.target.closest(".editor-tab");
    if (!tab) return;
    const target = tab.dataset.tab;
    if (target) activateTab(target);
  });

  // Initial preview render (in case user opens Preview tab immediately)
  updatePreview();
})();
