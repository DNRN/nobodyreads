import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { sql, SQLite } from "@codemirror/lang-sql";
import { LanguageDescription } from "@codemirror/language";
import { Marked } from "marked";
import { createEditor } from "./core/create-editor.js";
import {
  wrapSelection,
  insertAtLineStart,
  buildToolbarActions,
  attachToolbar,
} from "./core/toolbar.js";
import {
  openFilePicker,
  attachDragDrop,
  createMediaModal,
} from "./core/media.js";
import type { PageEditorOptions, PageEditorInstance } from "./types.js";

const markedInstance = new Marked({ gfm: true, breaks: false });

markedInstance.use({
  renderer: {
    image({ href, title, text }) {
      const sizeMatch = text.match(/^(.*?)\|(\d+(?:px|%|em|rem|vw))$/);
      const dimMatch = text.match(/^(.*?)\|(\d+)x(\d+)$/);

      let alt = text;
      let style = "";

      if (dimMatch) {
        alt = dimMatch[1];
        style = ` style="width: ${dimMatch[2]}px; height: ${dimMatch[3]}px; object-fit: cover"`;
      } else if (sizeMatch) {
        alt = sizeMatch[1];
        style = ` style="max-width: ${sizeMatch[2]}"`;
      }

      const titleAttr = title ? ` title="${title}"` : "";
      return `<img src="${href}" alt="${alt}"${titleAttr}${style} />`;
    },
  },
});

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Create a page editor with CodeMirror markdown editing, live preview,
 * toolbar actions, media upload, and slug auto-generation.
 *
 * All DOM references and API URLs are injected via options, making
 * this reusable across standalone and multi-tenant deployments.
 */
export function createPageEditor(options: PageEditorOptions): PageEditorInstance {
  const {
    contentElement,
    previewElement,
    formElement,
    titleInput,
    slugInput,
    toolbar,
    tabs,
    contentField,
    initialValue = "",
    isNewPage = false,
  } = options;
  const uploadUrl = options.uploadUrl ?? "/admin/media/upload";
  const mediaListUrl = options.mediaListUrl ?? "/admin/media/list";

  let previewTimer: ReturnType<typeof setTimeout> | null = null;

  function schedulePreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 150);
  }

  function updatePreview() {
    const text = editor.getValue();
    const rendered = markedInstance.parse(text);
    previewElement.innerHTML = typeof rendered === "string" ? rendered : text;
  }

  const previewUpdater = EditorView.updateListener.of((update) => {
    if (update.docChanged) schedulePreview();
  });

  const editorKeymap = Prec.high(
    keymap.of([
      {
        key: "Mod-b",
        run(view) {
          wrapSelection(view, "**", "**", "bold text");
          schedulePreview();
          return true;
        },
      },
      {
        key: "Mod-i",
        run(view) {
          wrapSelection(view, "_", "_", "italic text");
          schedulePreview();
          return true;
        },
      },
      {
        key: "Mod-s",
        run() {
          formElement?.requestSubmit();
          return true;
        },
      },
    ])
  );

  const editor = createEditor({
    parent: contentElement,
    initialValue,
    extensions: [
      markdown({
        codeLanguages: [
          LanguageDescription.of({ name: "javascript", alias: ["js", "ts", "typescript", "jsx", "tsx"], support: javascript() }),
          LanguageDescription.of({ name: "html", alias: ["htm"], support: html() }),
          LanguageDescription.of({ name: "css", alias: ["scss", "less"], support: css() }),
          LanguageDescription.of({ name: "sql", alias: ["sqlite"], support: sql({ dialect: SQLite }) }),
        ],
      }),
      previewUpdater,
      editorKeymap,
    ],
  });

  updatePreview();

  // Form submit: sync CodeMirror content to hidden field
  if (formElement) {
    formElement.addEventListener("submit", () => {
      if (contentField) {
        (contentField as HTMLInputElement).value = editor.getValue();
      }
    });
  }

  // Slug auto-generation for new pages
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

  // Media modal
  const modal = createMediaModal({
    view: editor.view,
    uploadUrl,
    mediaListUrl,
  });

  // Toolbar
  if (toolbar) {
    const actions = buildToolbarActions(editor.view, {
      image: () => openFilePicker(editor.view, uploadUrl),
      media: () => modal.open(),
    });
    // Wrap each action to also schedule preview
    const wrappedActions: Record<string, () => void> = {};
    for (const [key, fn] of Object.entries(actions)) {
      wrappedActions[key] = () => {
        fn();
        schedulePreview();
      };
    }
    attachToolbar(toolbar, wrappedActions);
  }

  // Drag-and-drop
  attachDragDrop(editor.view, uploadUrl);

  // Mobile tab switching
  if (tabs) {
    const writePane = document.querySelector(".editor-pane-write");
    const previewPane = document.querySelector(".editor-pane-preview");

    tabs.addEventListener("click", (e) => {
      const tab = (e.target as HTMLElement).closest(".editor-tab") as HTMLElement | null;
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

  return {
    editor,
    destroy() {
      modal.destroy();
      editor.destroy();
      if (previewTimer) clearTimeout(previewTimer);
    },
  };
}
