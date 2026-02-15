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

// Image size extension: ![alt|size](/url)
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

  // --- Image upload helper ---

  function insertTextAtCursor(text) {
    const { state } = editorView;
    const pos = state.selection.main.head;
    editorView.dispatch({
      changes: { from: pos, to: pos, insert: text },
      selection: { anchor: pos + text.length },
    });
    editorView.focus();
    schedulePreview();
  }

  async function uploadFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    // Insert a placeholder while uploading
    const placeholder = `![Uploading ${file.name}...]()`;
    insertTextAtCursor(placeholder);

    try {
      const resp = await fetch("/admin/media/upload", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });

      if (!resp.ok) throw new Error("Upload failed");
      const data = await resp.json();

      // Replace placeholder with actual markdown image
      const content = getContent();
      const markdown = `![${file.name}](${data.url})`;
      const idx = content.indexOf(placeholder);
      if (idx !== -1) {
        editorView.dispatch({
          changes: { from: idx, to: idx + placeholder.length, insert: markdown },
        });
      }
    } catch (err) {
      // Remove placeholder on error
      const content = getContent();
      const idx = content.indexOf(placeholder);
      if (idx !== -1) {
        editorView.dispatch({
          changes: { from: idx, to: idx + placeholder.length, insert: "" },
        });
      }
      alert("Image upload failed: " + err.message);
    }
    schedulePreview();
  }

  function openImagePicker() {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*,video/*,audio/*,.pdf";
    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files.length > 0) {
        for (const file of fileInput.files) {
          uploadFile(file);
        }
      }
    });
    fileInput.click();
  }

  // --- Media picker modal ---

  // Inject modal styles once
  if (!document.getElementById("media-modal-styles")) {
    const style = document.createElement("style");
    style.id = "media-modal-styles";
    style.textContent = `
      .media-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
      }
      .media-modal {
        background: var(--bg, #fff);
        color: var(--text, #2c2c2c);
        border: 1px solid var(--border, #e0e0e0);
        border-radius: 12px;
        width: 100%;
        max-width: 720px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      }
      .media-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid var(--border, #e0e0e0);
      }
      .media-modal-header h3 {
        margin: 0;
        font-size: 1.1rem;
      }
      .media-modal-header-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .media-modal-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: var(--text, #2c2c2c);
        padding: 0 0.25rem;
        line-height: 1;
        opacity: 0.6;
      }
      .media-modal-close:hover { opacity: 1; }
      .media-modal-body {
        padding: 1.25rem;
        overflow-y: auto;
        flex: 1;
        min-height: 200px;
      }
      .media-modal-loading,
      .media-modal-empty {
        text-align: center;
        padding: 2rem;
        opacity: 0.6;
      }
      .media-modal-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: 0.75rem;
      }
      .media-modal-card {
        all: unset;
        cursor: pointer;
        border: 2px solid var(--border, #e0e0e0);
        border-radius: 8px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transition: border-color 0.15s, box-shadow 0.15s;
        box-sizing: border-box;
      }
      .media-modal-card:hover,
      .media-modal-card:focus-visible {
        border-color: var(--accent, #555);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #555) 25%, transparent);
      }
      .media-modal-card-preview {
        aspect-ratio: 1;
        background: color-mix(in srgb, var(--border, #e0e0e0) 40%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .media-modal-card-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .media-modal-card-type {
        text-transform: uppercase;
        font-size: 0.8rem;
        font-weight: 600;
        opacity: 0.4;
      }
      .media-modal-card-name {
        display: block;
        font-size: 0.75rem;
        padding: 0.35rem 0.5rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `;
    document.head.appendChild(style);
  }

  let mediaModal = null;

  function createMediaModal() {
    if (mediaModal) return mediaModal;

    const overlay = document.createElement("div");
    overlay.className = "media-modal-overlay";
    overlay.innerHTML = `
      <div class="media-modal">
        <div class="media-modal-header">
          <h3>Media Library</h3>
          <div class="media-modal-header-actions">
            <button type="button" class="btn btn-primary media-modal-upload-btn">Upload new</button>
            <button type="button" class="media-modal-close">&times;</button>
          </div>
        </div>
        <div class="media-modal-body">
          <div class="media-modal-loading">Loading...</div>
          <div class="media-modal-empty" style="display:none">No media uploaded yet. Upload your first file!</div>
          <div class="media-modal-grid" style="display:none"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Close handlers
    overlay.querySelector(".media-modal-close").addEventListener("click", closeMediaModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeMediaModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && mediaModal && overlay.style.display !== "none") {
        closeMediaModal();
      }
    });

    // Upload button inside modal
    overlay.querySelector(".media-modal-upload-btn").addEventListener("click", () => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*,video/*,audio/*,.pdf";
      fileInput.addEventListener("change", async () => {
        if (fileInput.files && fileInput.files.length > 0) {
          for (const file of fileInput.files) {
            const formData = new FormData();
            formData.append("file", file);
            try {
              await fetch("/admin/media/upload", {
                method: "POST",
                headers: { Accept: "application/json" },
                body: formData,
              });
            } catch { /* ignore */ }
          }
          // Refresh the grid after upload
          loadMediaGrid();
        }
      });
      fileInput.click();
    });

    mediaModal = overlay;
    return overlay;
  }

  async function loadMediaGrid() {
    const overlay = createMediaModal();
    const loading = overlay.querySelector(".media-modal-loading");
    const empty = overlay.querySelector(".media-modal-empty");
    const grid = overlay.querySelector(".media-modal-grid");

    loading.style.display = "";
    empty.style.display = "none";
    grid.style.display = "none";
    grid.innerHTML = "";

    try {
      const resp = await fetch("/admin/media/list", {
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) throw new Error("Failed to load media");
      const items = await resp.json();

      loading.style.display = "none";

      if (items.length === 0) {
        empty.style.display = "";
        return;
      }

      grid.style.display = "";

      for (const item of items) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "media-modal-card";
        card.title = item.originalName;

        const isImg = item.mimeType && item.mimeType.startsWith("image/");

        card.innerHTML = `
          <div class="media-modal-card-preview">
            ${isImg
              ? `<img src="${item.url}" alt="${item.originalName}" loading="lazy" />`
              : `<span class="media-modal-card-type">${item.mimeType ? item.mimeType.split("/")[0] : "file"}</span>`
            }
          </div>
          <span class="media-modal-card-name">${item.originalName}</span>
        `;

        card.addEventListener("click", () => {
          const alt = item.originalName.replace(/\.[^.]+$/, "");
          insertTextAtCursor(`![${alt}](${item.url})`);
          closeMediaModal();
        });

        grid.appendChild(card);
      }
    } catch (err) {
      loading.textContent = "Failed to load media library.";
    }
  }

  function openMediaModal() {
    const overlay = createMediaModal();
    overlay.style.display = "";
    loadMediaGrid();
  }

  function closeMediaModal() {
    if (mediaModal) {
      mediaModal.style.display = "none";
    }
    editorView.focus();
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
    image: () => openImagePicker(),
    media: () => openMediaModal(),
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

  // --- Drag-and-drop image upload on the editor ---
  const editorDom = editorView.dom;

  editorDom.addEventListener("dragover", (e) => {
    if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  });

  editorDom.addEventListener("drop", (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    const files = Array.from(e.dataTransfer.files);
    const mediaFiles = files.filter((f) =>
      f.type.startsWith("image/") ||
      f.type.startsWith("video/") ||
      f.type.startsWith("audio/") ||
      f.type === "application/pdf"
    );
    if (mediaFiles.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    for (const file of mediaFiles) {
      uploadFile(file);
    }
  });

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
