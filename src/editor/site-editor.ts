import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";

type EditorHandle = {
  view: EditorView;
  textarea: HTMLTextAreaElement;
};

function createEditor(
  textarea: HTMLTextAreaElement,
  extensions: unknown[]
): EditorHandle {
  textarea.style.display = "none";
  const parent = textarea.parentElement;
  if (!parent) {
    throw new Error("Missing textarea parent");
  }

  const state = EditorState.create({
    doc: textarea.value,
    extensions: [basicSetup, ...extensions],
  });

  const view = new EditorView({
    state,
    parent,
  });

  return { view, textarea };
}

function getEditorValue(editor: EditorHandle | null): string {
  if (!editor) return "";
  return editor.view.state.doc.toString();
}

function setEditorValue(editor: EditorHandle | null, value: string): void {
  if (!editor) return;
  const transaction = editor.view.state.update({
    changes: { from: 0, to: editor.view.state.doc.length, insert: value },
  });
  editor.view.dispatch(transaction);
}

function initSiteEditor(): void {
  const form = document.getElementById("site-editor-form") as HTMLFormElement | null;
  const tabs = document.getElementById("site-editor-tabs");
  const panes = document.querySelectorAll(".site-editor-pane");
  const htmlInput = document.getElementById("site-html") as HTMLTextAreaElement | null;
  const cssInput = document.getElementById("site-css") as HTMLTextAreaElement | null;
  const jsInput = document.getElementById("site-js") as HTMLTextAreaElement | null;
  const preview = document.getElementById("site-preview") as HTMLIFrameElement | null;

  if (!form || !tabs || !htmlInput || !cssInput || !jsInput || !preview) return;

  let previewTimer: number | null = null;

  const changeListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) schedulePreview();
  });

  const htmlEditor = createEditor(htmlInput, [html(), changeListener]);
  const cssEditor = createEditor(cssInput, [css(), changeListener]);
  const jsEditor = createEditor(jsInput, [javascript(), changeListener]);

  function buildPreviewHtml(): string {
    const htmlValue = getEditorValue(htmlEditor) || "";
    const cssValue = getEditorValue(cssEditor) || "";
    const jsValue = getEditorValue(jsEditor) || "";
    const contentHtml = "<main><h1>Preview</h1><p>Your page content renders here.</p></main>";
    const navHtml = '<a href="#">Home</a><a href="#">About</a><a href="#">Posts</a>';
    const nowYear = new Date().getFullYear();
    const bodyHtml = htmlValue
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
    <style>${cssValue}</style>
  </head>
  <body>
    ${resolvedBody}
    <script type="module">${jsValue}</script>
  </body>
</html>`;
  }

  function updatePreview(): void {
    preview.setAttribute("srcdoc", buildPreviewHtml());
  }

  function schedulePreview(): void {
    if (previewTimer) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(updatePreview, 150);
  }

  function activateTab(target: string): void {
    tabs.querySelectorAll(".editor-tab").forEach((t) => t.classList.remove("active"));
    tabs.querySelector(`.editor-tab[data-tab="${target}"]`)?.classList.add("active");
    panes.forEach((pane) => {
      const isTarget = pane.getAttribute("data-pane") === target;
      pane.classList.toggle("hidden", !isTarget);
    });
    if (target === "preview") updatePreview();
  }

  tabs.addEventListener("click", (e) => {
    const tab = (e.target as HTMLElement | null)?.closest(".editor-tab") as HTMLElement | null;
    if (!tab) return;
    const target = tab.dataset.tab;
    if (target) activateTab(target);
  });

  form.addEventListener("submit", () => {
    htmlInput.value = getEditorValue(htmlEditor);
    cssInput.value = getEditorValue(cssEditor);
    jsInput.value = getEditorValue(jsEditor);
  });

  updatePreview();
  activateTab("html");
}

initSiteEditor();
