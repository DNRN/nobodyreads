// --- Page editor: CodeMirror markdown with live preview, toolbar, slug generation ---
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { sql, SQLite } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { Marked } from "marked";

function isDarkMode() {
  return document.documentElement.dataset.theme === "dark";
}

const markedInstance = new Marked({ gfm: true, breaks: false });

function initPageEditor() {
  const textarea = document.getElementById("content");
  const preview = document.getElementById("preview");
  const titleInput = document.getElementById("title");
  const slugInput = document.getElementById("slug");
  const toolbar = document.getElementById("editor-toolbar");
  const tabs = document.getElementById("editor-tabs");
  const form = document.getElementById("editor-form");

  if (!textarea || !preview) return;

  // --- Create CodeMirror ---

  textarea.style.display = "none";
  const parent = textarea.parentElement;

  let previewTimer = null;

  function getContent() {
    return editorView.state.doc.toString();
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 150);
  }

  function updatePreview() {
    const text = getContent();
    const html = markedInstance.parse(text);
    preview.innerHTML = typeof html === "string" ? html : text;
  }

  // Preview update on every document change
  const previewUpdater = EditorView.updateListener.of((update) => {
    if (update.docChanged) schedulePreview();
  });

  // Toolbar helper: wrap selection or insert at cursor
  function wrapSelection(before, after, placeholder) {
    const { state } = editorView;
    const range = state.selection.main;
    const selected = state.sliceDoc(range.from, range.to) || placeholder || "text";
    const replacement = before + selected + after;

    editorView.dispatch({
      changes: { from: range.from, to: range.to, insert: replacement },
      selection: {
        anchor: range.from + before.length,
        head: range.from + before.length + selected.length,
      },
    });
    editorView.focus();
    schedulePreview();
  }

  function insertAtLineStart(prefix) {
    const { state } = editorView;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);

    editorView.dispatch({
      changes: { from: line.from, to: line.from, insert: prefix },
    });
    editorView.focus();
    schedulePreview();
  }

  // Keyboard shortcuts (Ctrl/Cmd + B, I, S)
  const editorKeymap = Prec.high(
    keymap.of([
      {
        key: "Mod-b",
        run() {
          wrapSelection("**", "**", "bold text");
          return true;
        },
      },
      {
        key: "Mod-i",
        run() {
          wrapSelection("_", "_", "italic text");
          return true;
        },
      },
      {
        key: "Mod-s",
        run() {
          form?.requestSubmit();
          return true;
        },
      },
    ])
  );

  const themeExtensions = isDarkMode() ? [oneDark] : [];

  const state = EditorState.create({
    doc: textarea.value,
    extensions: [
      basicSetup,
      ...themeExtensions,
      markdown({
        codeLanguages: [
          { name: "javascript", alias: ["js", "ts", "typescript", "jsx", "tsx"], support: javascript() },
          { name: "html", alias: ["htm"], support: html() },
          { name: "css", alias: ["scss", "less"], support: css() },
          { name: "sql", alias: ["sqlite"], support: sql({ dialect: SQLite }) },
        ],
      }),
      EditorView.lineWrapping,
      previewUpdater,
      editorKeymap,
    ],
  });

  const editorView = new EditorView({ state, parent });

  // Initial preview render
  updatePreview();

  // --- Form sync: write CodeMirror content back to hidden field on submit ---
  if (form) {
    form.addEventListener("submit", () => {
      const contentField = document.getElementById("content-field");
      if (contentField) contentField.value = getContent();
    });
  }

  // --- Slug auto-generation ---
  const isNewPage = form && form.querySelector('input[name="id"]')?.value === "";

  function toSlug(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  if (isNewPage && titleInput && slugInput) {
    let slugManuallyEdited = false;

    slugInput.addEventListener("input", () => {
      slugManuallyEdited = true;
    });

    titleInput.addEventListener("input", () => {
      if (!slugManuallyEdited) {
        slugInput.value = toSlug(titleInput.value);
      }
    });
  }

  // --- Toolbar actions ---
  const toolbarActions = {
    bold: () => wrapSelection("**", "**", "bold text"),
    italic: () => wrapSelection("_", "_", "italic text"),
    heading: () => insertAtLineStart("## "),
    link: () => wrapSelection("[", "](url)", "link text"),
    code: () => wrapSelection("`", "`", "code"),
    codeblock: () => wrapSelection("\n```\n", "\n```\n", "code here"),
    ul: () => insertAtLineStart("- "),
    quote: () => insertAtLineStart("> "),
  };

  if (toolbar) {
    toolbar.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (toolbarActions[action]) {
        toolbarActions[action]();
      }
    });
  }

  // --- Mobile tab switching ---
  if (tabs) {
    const writePane = document.querySelector(".editor-pane-write");
    const previewPane = document.querySelector(".editor-pane-preview");

    tabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".editor-tab");
      if (!tab) return;

      const target = tab.dataset.tab;
      tabs.querySelectorAll(".editor-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      if (target === "write") {
        writePane?.classList.remove("hidden");
        previewPane?.classList.add("hidden");
      } else {
        writePane?.classList.add("hidden");
        previewPane?.classList.remove("hidden");
        updatePreview();
      }
    });
  }
}

initPageEditor();
