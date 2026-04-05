import type { EditorView } from "@codemirror/view";
import { insertTextAtCursor } from "./toolbar.js";

/**
 * Upload a file and insert a markdown image link into the editor.
 * Shows a placeholder during upload, replaces it on success or removes it on error.
 */
export async function uploadFile(
  view: EditorView,
  file: File,
  uploadUrl: string,
): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);

  const placeholder = `![Uploading ${file.name}...]()`;
  insertTextAtCursor(view, placeholder);

  try {
    const resp = await fetch(uploadUrl, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
    });

    if (!resp.ok) throw new Error("Upload failed");
    const data = await resp.json();

    const content = view.state.doc.toString();
    const md = `![${file.name}](${data.url})`;
    const idx = content.indexOf(placeholder);
    if (idx !== -1) {
      view.dispatch({
        changes: { from: idx, to: idx + placeholder.length, insert: md },
      });
    }
  } catch (err) {
    const content = view.state.doc.toString();
    const idx = content.indexOf(placeholder);
    if (idx !== -1) {
      view.dispatch({
        changes: { from: idx, to: idx + placeholder.length, insert: "" },
      });
    }
    alert("Image upload failed: " + (err instanceof Error ? err.message : String(err)));
  }
}

/** Open a native file picker and upload each selected file. */
export function openFilePicker(
  view: EditorView,
  uploadUrl: string,
): void {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*,video/*,audio/*,.pdf";
  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length > 0) {
      for (const file of fileInput.files) {
        uploadFile(view, file, uploadUrl);
      }
    }
  });
  fileInput.click();
}

/** Attach drag-and-drop media upload to a CodeMirror editor DOM element. */
export function attachDragDrop(
  view: EditorView,
  uploadUrl: string,
): void {
  const dom = view.dom;

  dom.addEventListener("dragover", (e) => {
    if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  });

  dom.addEventListener("drop", (e) => {
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
      uploadFile(view, file, uploadUrl);
    }
  });
}

export interface MediaModalOptions {
  view: EditorView;
  uploadUrl: string;
  mediaListUrl: string;
}

/**
 * Create and manage a media library modal for picking existing uploads
 * or uploading new files directly into the CodeMirror editor.
 */
export function createMediaModal(options: MediaModalOptions): {
  open(): void;
  close(): void;
  destroy(): void;
} {
  const { view, uploadUrl, mediaListUrl } = options;
  let overlay: HTMLDivElement | null = null;

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && overlay && overlay.style.display !== "none") {
      close();
    }
  }

  function ensureOverlay(): HTMLDivElement {
    if (overlay) return overlay;

    const el = document.createElement("div");
    el.className = "media-modal-overlay";
    el.innerHTML = `
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
    document.body.appendChild(el);

    el.querySelector(".media-modal-close")!.addEventListener("click", close);
    el.addEventListener("click", (e) => {
      if (e.target === el) close();
    });
    document.addEventListener("keydown", onKeyDown);

    el.querySelector(".media-modal-upload-btn")!.addEventListener("click", () => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*,video/*,audio/*,.pdf";
      fileInput.addEventListener("change", async () => {
        if (fileInput.files && fileInput.files.length > 0) {
          for (const file of fileInput.files) {
            const fd = new FormData();
            fd.append("file", file);
            try {
              await fetch(uploadUrl, {
                method: "POST",
                headers: { Accept: "application/json" },
                body: fd,
              });
            } catch { /* ignore */ }
          }
          loadGrid();
        }
      });
      fileInput.click();
    });

    overlay = el;
    return el;
  }

  async function loadGrid() {
    const el = ensureOverlay();
    const loading = el.querySelector(".media-modal-loading") as HTMLElement;
    const empty = el.querySelector(".media-modal-empty") as HTMLElement;
    const grid = el.querySelector(".media-modal-grid") as HTMLElement;

    loading.style.display = "";
    empty.style.display = "none";
    grid.style.display = "none";
    grid.innerHTML = "";

    try {
      const resp = await fetch(mediaListUrl, {
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) throw new Error("Failed to load media");
      const items: Array<{ url: string; originalName: string; mimeType?: string }> = await resp.json();

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
          insertTextAtCursor(view, `![${alt}](${item.url})`);
          close();
        });

        grid.appendChild(card);
      }
    } catch {
      loading.textContent = "Failed to load media library.";
    }
  }

  function open() {
    const el = ensureOverlay();
    el.style.display = "";
    loadGrid();
  }

  function close() {
    if (overlay) {
      overlay.style.display = "none";
    }
    view.focus();
  }

  function destroy() {
    document.removeEventListener("keydown", onKeyDown);
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  return { open, close, destroy };
}
