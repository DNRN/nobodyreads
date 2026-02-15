import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { sql, SQLite } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

function isDarkMode() {
  return document.documentElement.dataset.theme === "dark";
}

/**
 * Replace a <textarea> with a CodeMirror editor.
 * The textarea must be visible (not inside display:none) at init time.
 */
function createEditor(textarea, extensions) {
  textarea.style.display = "none";
  const parent = textarea.parentElement;
  if (!parent) return null;

  const themeExtensions = isDarkMode() ? [oneDark] : [];

  const state = EditorState.create({
    doc: textarea.value,
    extensions: [basicSetup, ...themeExtensions, EditorView.lineWrapping, ...extensions],
  });

  const view = new EditorView({ state, parent });
  return { view, textarea };
}

function getEditorValue(editor) {
  if (!editor) return "";
  return editor.view.state.doc.toString();
}

function initViewEditor() {
  const form = document.getElementById("view-editor-form");
  const kindSelect = document.getElementById("kind");
  const queryTextarea = document.getElementById("query");
  const templateTextarea = document.getElementById("template");

  if (!form || !kindSelect) return;

  let queryEditor = null;
  let templateEditor = null;
  let cmInitialized = false;

  /** Create CodeMirror instances (call only when custom fields are visible). */
  function initCodeMirror() {
    if (cmInitialized) return;
    cmInitialized = true;

    if (queryTextarea) {
      queryEditor = createEditor(queryTextarea, [sql({ dialect: SQLite })]);
    }
    if (templateTextarea) {
      templateEditor = createEditor(templateTextarea, [javascript()]);
    }
  }

  // Toggle visibility based on kind
  const postListFields = document.getElementById("field-limit");
  const customFields = document.getElementById("custom-fields");
  const hintPostList = document.getElementById("kind-hint-post-list");
  const hintCustom = document.getElementById("kind-hint-custom");

  function toggleFields() {
    const isCustom = kindSelect.value === "custom";
    if (postListFields) postListFields.style.display = isCustom ? "none" : "";
    if (customFields) customFields.style.display = isCustom ? "" : "none";
    if (hintPostList) hintPostList.style.display = isCustom ? "none" : "";
    if (hintCustom) hintCustom.style.display = isCustom ? "" : "none";

    if (isCustom) {
      // Defer CM init to next frame so the container is visible and measurable
      requestAnimationFrame(() => {
        initCodeMirror();
      });
    }
  }

  kindSelect.addEventListener("change", toggleFields);

  // If already on "custom" kind (editing existing custom view), init CM immediately
  if (kindSelect.value === "custom") {
    initCodeMirror();
  }

  // Sync CodeMirror content back to hidden textareas on form submit
  form.addEventListener("submit", () => {
    if (queryEditor && queryTextarea) {
      queryTextarea.value = getEditorValue(queryEditor);
    }
    if (templateEditor && templateTextarea) {
      templateTextarea.value = getEditorValue(templateEditor);
    }
  });
}

initViewEditor();
