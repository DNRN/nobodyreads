import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

function isDarkMode() {
  return document.documentElement.dataset.theme === "dark";
}

function createEditor(textarea, extensions) {
  textarea.style.display = "none";
  const parent = textarea.parentElement;
  if (!parent) {
    throw new Error("Missing textarea parent");
  }

  const themeExtensions = isDarkMode() ? [oneDark] : [];

  const state = EditorState.create({
    doc: textarea.value,
    extensions: [basicSetup, ...themeExtensions, ...extensions],
  });

  const view = new EditorView({
    state,
    parent,
  });

  return { view, textarea };
}

function getEditorValue(editor) {
  if (!editor) return "";
  return editor.view.state.doc.toString();
}

function initSiteEditor() {
  const form = document.getElementById("site-editor-form");
  const tabs = document.getElementById("site-editor-tabs");
  const panes = document.querySelectorAll(".site-editor-pane");
  const htmlInput = document.getElementById("site-html");
  const cssInput = document.getElementById("site-css");
  const tsInput = document.getElementById("site-ts");
  const preview = document.getElementById("site-preview");
  const saveStatus = document.getElementById("site-save-status");

  if (!form || !tabs || !htmlInput || !cssInput || !tsInput || !preview) return;

  let isDirty = false;

  function setSaveStatus(state) {
    if (!saveStatus) return;
    saveStatus.dataset.state = state;
    if (state === "dirty") saveStatus.textContent = "Unsaved changes";
    else if (state === "saving") saveStatus.textContent = "Saving...";
    else if (state === "saved") saveStatus.textContent = "Saved";
    else if (state === "error") saveStatus.textContent = "Save failed";
    else saveStatus.textContent = "Ready";
  }

  function markDirty() {
    if (isDirty) return;
    isDirty = true;
    setSaveStatus("dirty");
  }

  const changeListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      markDirty();
    }
  });

  const htmlEditor = createEditor(htmlInput, [html(), changeListener]);
  const cssEditor = createEditor(cssInput, [css(), changeListener]);
  const tsEditor = createEditor(tsInput, [javascript({ typescript: true }), changeListener]);
  const previewUrl = preview.getAttribute("data-preview-url") || "/preview";

  function buildPreviewUrl(forceRefresh = false) {
    const url = new URL(previewUrl, window.location.origin);
    if (forceRefresh) {
      url.searchParams.set("t", String(Date.now()));
    } else {
      url.searchParams.delete("t");
    }
    return `${url.pathname}${url.search}`;
  }

  function refreshPreview(forceRefresh = false) {
    preview.setAttribute("src", buildPreviewUrl(forceRefresh));
  }

  function syncEditorsToInputs() {
    htmlInput.value = getEditorValue(htmlEditor);
    cssInput.value = getEditorValue(cssEditor);
    tsInput.value = getEditorValue(tsEditor);
  }

  function activateTab(target) {
    tabs.querySelectorAll(".editor-tab").forEach((t) => t.classList.remove("active"));
    tabs.querySelector(`.editor-tab[data-tab="${target}"]`)?.classList.add("active");
    panes.forEach((pane) => {
      const isTarget = pane.getAttribute("data-pane") === target;
      pane.classList.toggle("hidden", !isTarget);
    });
    if (target === "preview") refreshPreview();
  }

  tabs.addEventListener("click", (e) => {
    const tab = e.target?.closest(".editor-tab");
    if (!tab) return;
    const target = tab.dataset.tab;
    if (target) activateTab(target);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncEditorsToInputs();
    setSaveStatus("saving");

    const formData = new FormData(form);
    const body = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") {
        body.append(key, value);
      }
    }

    try {
      const response = await fetch(form.action, {
        method: form.method || "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        credentials: "same-origin",
        body,
      });

      if (response.redirected && response.url.includes("/admin/login")) {
        window.location.assign(response.url);
        return;
      }

      if (!response.ok) {
        // Check for TypeScript compilation errors
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json();
          if (data.error) {
            setSaveStatus("error");
            saveStatus.textContent = `TS error: ${data.error}`;
            saveStatus.title = data.error;
            console.error("TypeScript compilation error:", data.error);
            return;
          }
        }
        throw new Error(`Save failed: ${response.status}`);
      }

      isDirty = false;
      setSaveStatus("saved");
      refreshPreview(true);
    } catch (error) {
      setSaveStatus("error");
      console.error(error);
      form.submit();
    }
  });

  setSaveStatus("ready");
  refreshPreview();
  activateTab("html");
}

initSiteEditor();
