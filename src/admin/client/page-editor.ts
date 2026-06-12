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
import { renderImage } from "../../shared/image-markdown.js";
import type { PageEditorOptions, PageEditorInstance } from "./types.js";

const markedInstance = new Marked({ gfm: true, breaks: false });

markedInstance.use({
  renderer: {
    image: ({ href, title, text }) => renderImage({ href, title, text }),
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
    publishedField,
    publishStatus,
    publishToggle,
    initialValue = "",
    isNewPage = false,
  } = options;
  const uploadUrl = options.uploadUrl ?? "/admin/media/upload";
  const mediaListUrl = options.mediaListUrl ?? "/admin/media/list";
  const previewUrl = options.previewUrl ?? "/admin/editor/preview";

  let previewTimer: ReturnType<typeof setTimeout> | null = null;
  // Monotonic token so out-of-order async preview responses can't clobber a
  // newer render (fetch responses may resolve in a different order than sent).
  let previewSeq = 0;

  function schedulePreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 150);
  }

  function renderLocal(text: string) {
    const rendered = markedInstance.parse(text);
    previewElement.innerHTML = typeof rendered === "string" ? rendered : text;
  }

  // {{view:slug}} content views and [[id]] links can only be resolved by the
  // server (DB lookups, custom SQL/JS). When the content contains them we round
  // trip to the preview endpoint; otherwise we render locally for snappy typing.
  function needsServerRender(text: string): boolean {
    return /\{\{view:[a-z0-9-]+\}\}/.test(text) || /\[\[[a-z0-9-]+(?:\|[^\]]+)?\]\]/.test(text);
  }

  async function updatePreview() {
    const text = editor.getValue();

    if (!needsServerRender(text)) {
      renderLocal(text);
      return;
    }

    const seq = ++previewSeq;
    try {
      const resp = await fetch(previewUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!resp.ok) throw new Error(`Preview request failed: ${resp.status}`);
      const data = (await resp.json()) as { html?: string };
      if (seq !== previewSeq) return; // a newer render superseded this one
      previewElement.innerHTML = data.html ?? "";
    } catch {
      // Fall back to the local render so the preview still shows something
      // useful (tokens stay as literal text) if the server is unreachable.
      if (seq !== previewSeq) return;
      renderLocal(text);
    }
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

  // Publish / unpublish: flip the hidden flag and submit. A disabled hidden
  // input is omitted from the POST body (draft); enabling it sends "on".
  if (publishToggle && publishedField && formElement) {
    publishToggle.addEventListener("click", () => {
      const willPublish = publishedField.disabled; // currently draft → publish
      publishedField.disabled = !willPublish;
      if (publishStatus) {
        publishStatus.textContent = willPublish ? "Publishing…" : "Unpublishing…";
      }
      publishToggle.disabled = true;
      formElement.requestSubmit();
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
