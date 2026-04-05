import { EditorView } from "@codemirror/view";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { replaceTextarea } from "./core/create-editor.js";
import type { EditorInstance } from "./types.js";
import type { SiteEditorOptions, SiteEditorInstance } from "./types.js";

/**
 * Create a site/template editor with multiple CodeMirror panes
 * (HTML, CSS, JS, advanced JSON), tabbed navigation, live preview,
 * and custom token management.
 */
export function createSiteEditor(options: SiteEditorOptions): SiteEditorInstance {
  const {
    formElement,
    tabs,
    panes,
    htmlInput,
    cssInput,
    tsInput,
    jsonInput,
    templateHidden,
    preview,
    saveStatus,
    customTokensEditor,
    addTokenBtn,
  } = options;
  const tokenSaveUrl = options.tokenSaveUrl ?? "/admin/settings/tokens";

  let isDirty = false;
  let editMode: "tabs" | "advanced" = "tabs";

  function setSaveStatus(state: string) {
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
    if (update.docChanged) markDirty();
  });

  const htmlEditor = replaceTextarea(htmlInput, [html(), changeListener])!;
  const cssEditor = replaceTextarea(cssInput, [css(), changeListener])!;
  const tsEditor = replaceTextarea(tsInput, [javascript({ typescript: true }), changeListener])!;
  const jsonEditor: EditorInstance | null = jsonInput
    ? replaceTextarea(jsonInput, [json(), changeListener])
    : null;

  const previewUrl = preview.getAttribute("data-preview-url") || "/preview";

  function buildPreviewUrl(forceRefresh = false): string {
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

  function getCurrentTemplate(): Record<string, unknown> {
    try {
      return JSON.parse(templateHidden.value);
    } catch {
      return {};
    }
  }

  function getCustomTokensFromUI(): Array<{ key: string; label: string; type: string; defaultValue: string }> {
    const container = customTokensEditor ?? document.getElementById("custom-tokens-editor");
    if (!container) return [];
    const rows = container.querySelectorAll("tr[data-token-key]");
    const tokens: Array<{ key: string; label: string; type: string; defaultValue: string }> = [];
    for (const row of rows) {
      const key = row.getAttribute("data-token-key") ?? "";
      const label = row.querySelector("td:nth-child(2)")?.textContent?.trim() ?? key;
      const type = row.querySelector("td:nth-child(3)")?.textContent?.trim() ?? "text";
      const input = row.querySelector(`input[name="tokenval:${key}"]`) as HTMLInputElement | null;
      const defaultValue = input?.value ?? "";
      tokens.push({ key, label, type, defaultValue });
    }
    return tokens;
  }

  function getTokenValuesFromUI(): Record<string, string> {
    const values: Record<string, string> = {};
    const inputs = document.querySelectorAll('input[name^="tokenval:"]') as NodeListOf<HTMLInputElement>;
    for (const input of inputs) {
      const key = input.name.slice("tokenval:".length);
      values[key] = input.value;
    }
    return values;
  }

  function buildTemplateJson(): string {
    if (editMode === "advanced" && jsonEditor) {
      return jsonEditor.getValue();
    }

    const base = getCurrentTemplate();
    const layoutHtml = htmlEditor.getValue().trim();
    const customCss = cssEditor.getValue().trim();
    const customJs = tsEditor.getValue().trim();
    const customTokens = getCustomTokensFromUI();

    if (layoutHtml) base.layoutHtml = layoutHtml;
    else delete base.layoutHtml;

    if (customCss) base.customCss = customCss;
    else delete base.customCss;

    if (customJs) base.customJs = customJs;
    else delete base.customJs;

    if (customTokens.length > 0) base.customTokens = customTokens;
    else delete base.customTokens;

    return JSON.stringify(base, null, 2);
  }

  function activateTab(target: string) {
    tabs.querySelectorAll(".editor-tab").forEach((t) => t.classList.remove("active"));
    tabs.querySelector(`.editor-tab[data-tab="${target}"]`)?.classList.add("active");
    const paneList = Array.from(panes);
    paneList.forEach((pane) => {
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
    const tab = (e.target as HTMLElement)?.closest(".editor-tab") as HTMLElement | null;
    if (!tab) return;
    const target = tab.dataset.tab;
    if (target) activateTab(target);
  });

  // Custom token management
  if (addTokenBtn) {
    addTokenBtn.addEventListener("click", () => {
      const keyInput = document.getElementById("new-token-key") as HTMLInputElement | null;
      const labelInput = document.getElementById("new-token-label") as HTMLInputElement | null;
      const typeSelect = document.getElementById("new-token-type") as HTMLSelectElement | null;
      const defaultInput = document.getElementById("new-token-default") as HTMLInputElement | null;

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

      const container = customTokensEditor ?? document.getElementById("custom-tokens-editor");
      let tbody = container?.querySelector("tbody");
      if (!tbody) {
        const emptyMsg = container?.querySelector(".editor-empty");
        if (emptyMsg) {
          const table = document.createElement("table");
          table.className = "editor-table";
          table.innerHTML = `<thead><tr><th>Key</th><th>Label</th><th>Type</th><th>Value</th><th></th></tr></thead><tbody></tbody>`;
          emptyMsg.replaceWith(table);
        }
        tbody = container?.querySelector("tbody") ?? null;
      }

      if (!tbody) return;

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
      tbody.appendChild(tr);

      if (keyInput) keyInput.value = "";
      if (labelInput) labelInput.value = "";
      if (defaultInput) defaultInput.value = "";
      markDirty();
    });
  }

  const onRemoveToken = (e: Event) => {
    const btn = (e.target as HTMLElement)?.closest("[data-remove-token]");
    if (!btn) return;
    const row = btn.closest("tr");
    if (row) {
      row.remove();
      markDirty();
    }
  };
  document.addEventListener("click", onRemoveToken);

  async function saveTokenValues() {
    const values = getTokenValuesFromUI();
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      body.append(`token:${key}`, value);
    }

    try {
      await fetch(tokenSaveUrl, {
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

  formElement.addEventListener("submit", async (event) => {
    event.preventDefault();

    setSaveStatus("saving");

    const templateJson = buildTemplateJson();
    templateHidden.value = templateJson;

    const body = new URLSearchParams();
    body.append("template", templateJson);

    try {
      const response = await fetch(formElement.action, {
        method: formElement.method || "POST",
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
            if (saveStatus) {
              saveStatus.textContent = `Error: ${data.error}`;
              saveStatus.title = data.error;
            }
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

  return {
    destroy() {
      document.removeEventListener("click", onRemoveToken);
      htmlEditor.destroy();
      cssEditor.destroy();
      tsEditor.destroy();
      jsonEditor?.destroy();
    },
  };
}
