import { sql, SQLite } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import { replaceTextarea } from "./core/create-editor.js";
import type { EditorInstance } from "./types.js";
import type { ViewEditorOptions, ViewEditorInstance } from "./types.js";

/**
 * Create a view editor with SQL and JS/template CodeMirror panes,
 * kind-based field toggling, and form submit syncing.
 */
export function createViewEditor(options: ViewEditorOptions): ViewEditorInstance {
  const {
    formElement,
    kindSelect,
    queryTextarea,
    templateTextarea,
    postListFields,
    customFields,
    hintPostList,
    hintCustom,
  } = options;

  let queryEditor: EditorInstance | null = null;
  let templateEditor: EditorInstance | null = null;
  let cmInitialized = false;

  function initCodeMirror() {
    if (cmInitialized) return;
    cmInitialized = true;

    if (queryTextarea) {
      queryEditor = replaceTextarea(queryTextarea, [sql({ dialect: SQLite })]);
    }
    if (templateTextarea) {
      templateEditor = replaceTextarea(templateTextarea, [javascript()]);
    }
  }

  function toggleFields() {
    const isCustom = kindSelect.value === "custom";
    if (postListFields) postListFields.style.display = isCustom ? "none" : "";
    if (customFields) customFields.style.display = isCustom ? "" : "none";
    if (hintPostList) hintPostList.style.display = isCustom ? "none" : "";
    if (hintCustom) hintCustom.style.display = isCustom ? "" : "none";

    if (isCustom) {
      requestAnimationFrame(() => {
        initCodeMirror();
      });
    }
  }

  kindSelect.addEventListener("change", toggleFields);

  if (kindSelect.value === "custom") {
    initCodeMirror();
  }

  formElement.addEventListener("submit", () => {
    if (queryEditor && queryTextarea) {
      queryTextarea.value = queryEditor.getValue();
    }
    if (templateEditor && templateTextarea) {
      templateTextarea.value = templateEditor.getValue();
    }
  });

  return {
    destroy() {
      queryEditor?.destroy();
      templateEditor?.destroy();
    },
  };
}
