import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
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
  const jsonInput = document.getElementById("site-json");
  const templateHidden = document.getElementById("site-template-hidden");
  const preview = document.getElementById("site-preview");
  const saveStatus = document.getElementById("site-save-status");

  if (!form || !tabs || !htmlInput || !cssInput || !tsInput || !templateHidden || !preview) return;

  let isDirty = false;
  let editMode = "tabs"; // "tabs" or "advanced"

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
  const jsonEditor = jsonInput ? createEditor(jsonInput, [json(), changeListener]) : null;
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

  function getCurrentTemplate() {
    try {
      return JSON.parse(templateHidden.value);
    } catch {
      return {};
    }
  }

  function getCustomTokensFromUI() {
    const rows = document.querySelectorAll("#custom-tokens-editor tr[data-token-key]");
    const tokens = [];
    for (const row of rows) {
      const key = row.getAttribute("data-token-key");
      const label = row.querySelector("td:nth-child(2)")?.textContent?.trim() ?? key;
      const type = row.querySelector("td:nth-child(3)")?.textContent?.trim() ?? "text";
      const input = row.querySelector(`input[name="tokenval:${key}"]`);
      const defaultValue = input?.value ?? "";
      tokens.push({ key, label, type, defaultValue });
    }
    return tokens;
  }

  function getTokenValuesFromUI() {
    const values = {};
    const inputs = document.querySelectorAll('input[name^="tokenval:"]');
    for (const input of inputs) {
      const key = input.name.slice("tokenval:".length);
      values[key] = input.value;
    }
    return values;
  }

  function buildTemplateJson() {
    if (editMode === "advanced" && jsonEditor) {
      return getEditorValue(jsonEditor);
    }

    const base = getCurrentTemplate();
    const layoutHtml = getEditorValue(htmlEditor).trim();
    const customCss = getEditorValue(cssEditor).trim();
    const customJs = getEditorValue(tsEditor).trim();
    const customTokens = getCustomTokensFromUI();

    if (layoutHtml) {
      base.layoutHtml = layoutHtml;
    } else {
      delete base.layoutHtml;
    }

    if (customCss) {
      base.customCss = customCss;
    } else {
      delete base.customCss;
    }

    if (customJs) {
      base.customJs = customJs;
    } else {
      delete base.customJs;
    }

    if (customTokens.length > 0) {
      base.customTokens = customTokens;
    } else {
      delete base.customTokens;
    }

    return JSON.stringify(base, null, 2);
  }

  function activateTab(target) {
    tabs.querySelectorAll(".editor-tab").forEach((t) => t.classList.remove("active"));
    tabs.querySelector(`.editor-tab[data-tab="${target}"]`)?.classList.add("active");
    panes.forEach((pane) => {
      const isTarget = pane.getAttribute("data-pane") === target;
      pane.classList.toggle("hidden", !isTarget);
    });

    editMode = target === "advanced" ? "advanced" : "tabs";

    if (target === "advanced" && jsonEditor) {
      const current = buildTemplateJson();
      jsonEditor.view.dispatch({
        changes: {
          from: 0,
          to: jsonEditor.view.state.doc.length,
          insert: current,
        },
      });
    }

    if (target === "preview") refreshPreview();
  }

  tabs.addEventListener("click", (e) => {
    const tab = e.target?.closest(".editor-tab");
    if (!tab) return;
    const target = tab.dataset.tab;
    if (target) activateTab(target);
  });

  // Custom token management
  const addTokenBtn = document.getElementById("add-token-btn");
  if (addTokenBtn) {
    addTokenBtn.addEventListener("click", () => {
      const keyInput = document.getElementById("new-token-key");
      const labelInput = document.getElementById("new-token-label");
      const typeSelect = document.getElementById("new-token-type");
      const defaultInput = document.getElementById("new-token-default");

      const key = keyInput?.value?.trim();
      const label = labelInput?.value?.trim();
      const type = typeSelect?.value || "text";
      const defaultValue = defaultInput?.value ?? "";

      if (!key || !label) return;
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        alert("Key must start with a letter or underscore and contain only letters, numbers, and underscores.");
        return;
      }

      const existing = document.querySelector(`tr[data-token-key="${key}"]`);
      if (existing) {
        alert(`Token "${key}" already exists.`);
        return;
      }

      const tbody = document.querySelector("#custom-tokens-editor tbody");
      if (!tbody) {
        const emptyMsg = document.querySelector("#custom-tokens-editor .editor-empty");
        if (emptyMsg) {
          const table = document.createElement("table");
          table.className = "editor-table";
          table.innerHTML = `<thead><tr><th>Key</th><th>Label</th><th>Type</th><th>Value</th><th></th></tr></thead><tbody></tbody>`;
          emptyMsg.replaceWith(table);
        }
      }

      const target = document.querySelector("#custom-tokens-editor tbody");
      if (!target) return;

      const tr = document.createElement("tr");
      tr.setAttribute("data-token-key", key);
      const inputType = type === "color" ? "color" : "text";
      tr.innerHTML = `
        <td><code>{{${key}}}</code></td>
        <td>${label}</td>
        <td>${type}</td>
        <td><input type="${inputType}" class="editor-input editor-input--sm" name="tokenval:${key}" value="${defaultValue}" /></td>
        <td><button type="button" class="btn btn-danger btn-sm" data-remove-token="${key}">Remove</button></td>
      `;
      target.appendChild(tr);

      keyInput.value = "";
      labelInput.value = "";
      defaultInput.value = "";
      markDirty();
    });
  }

  document.addEventListener("click", (e) => {
    const btn = e.target?.closest("[data-remove-token]");
    if (!btn) return;
    const row = btn.closest("tr");
    if (row) {
      row.remove();
      markDirty();
    }
  });

  async function saveTokenValues() {
    const values = getTokenValuesFromUI();
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      body.append(`token:${key}`, value);
    }

    try {
      await fetch("/admin/settings/tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body,
      });
    } catch (err) {
      console.error("Failed to save token values:", err);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    setSaveStatus("saving");

    const templateJson = buildTemplateJson();
    templateHidden.value = templateJson;

    const body = new URLSearchParams();
    body.append("template", templateJson);

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
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json();
          if (data.error) {
            setSaveStatus("error");
            saveStatus.textContent = `Error: ${data.error}`;
            saveStatus.title = data.error;
            console.error("Save error:", data.error);
            return;
          }
        }
        throw new Error(`Save failed: ${response.status}`);
      }

      await saveTokenValues();

      isDirty = false;
      setSaveStatus("saved");
      refreshPreview(true);
    } catch (error) {
      setSaveStatus("error");
      console.error(error);
    }
  });

  setSaveStatus("ready");
  refreshPreview();
  activateTab("html");
}

initSiteEditor();
