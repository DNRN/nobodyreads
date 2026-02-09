// --- Editor: live markdown preview, toolbar, slug generation, tab handling ---
(function () {
  "use strict";

  const textarea = document.getElementById("content");
  const preview = document.getElementById("preview");
  const titleInput = document.getElementById("title");
  const slugInput = document.getElementById("slug");
  const toolbar = document.getElementById("editor-toolbar");
  const tabs = document.getElementById("editor-tabs");
  const form = document.getElementById("editor-form");

  if (!textarea || !preview) return;

  // --- Sync content into hidden field on submit (ensures body is always sent) ---
  if (form) {
    form.addEventListener("submit", function () {
      const contentField = document.getElementById("content-field");
      if (contentField) contentField.value = textarea.value;
    });
  }

  // --- Live preview ---

  /** @type {typeof import('marked')} */
  const { marked } = window;

  if (marked) {
    marked.setOptions({ gfm: true, breaks: false });
  }

  let previewTimer = null;

  function updatePreview() {
    if (!marked) {
      preview.textContent = textarea.value;
      return;
    }
    preview.innerHTML = marked.parse(textarea.value);
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 120);
  }

  textarea.addEventListener("input", schedulePreview);

  // Initial render
  updatePreview();

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

    slugInput.addEventListener("input", function () {
      slugManuallyEdited = true;
    });

    titleInput.addEventListener("input", function () {
      if (!slugManuallyEdited) {
        slugInput.value = toSlug(titleInput.value);
      }
    });
  }

  // --- Tab key inserts spaces ---

  textarea.addEventListener("keydown", function (e) {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = this.selectionStart;
      const end = this.selectionEnd;

      if (e.shiftKey) {
        // Unindent: remove leading 2 spaces from selected lines
        const before = this.value.slice(0, start);
        const selected = this.value.slice(start, end);
        const after = this.value.slice(end);

        const lineStart = before.lastIndexOf("\n") + 1;
        const prefix = this.value.slice(lineStart, start);
        const block = prefix + selected;
        const unindented = block.replace(/^  /gm, "");
        const diff = block.length - unindented.length;

        this.value = this.value.slice(0, lineStart) + unindented + after;
        this.selectionStart = Math.max(lineStart, start - (prefix.length - prefix.replace(/^  /, "").length));
        this.selectionEnd = end - diff;
      } else {
        // Indent: insert 2 spaces
        this.value = this.value.slice(0, start) + "  " + this.value.slice(end);
        this.selectionStart = this.selectionEnd = start + 2;
      }
      schedulePreview();
    }
  });

  // --- Keyboard shortcuts ---

  textarea.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;

    switch (e.key.toLowerCase()) {
      case "b":
        e.preventDefault();
        wrapSelection("**", "**");
        break;
      case "i":
        e.preventDefault();
        wrapSelection("_", "_");
        break;
      case "s":
        e.preventDefault();
        form?.requestSubmit();
        break;
    }
  });

  // --- Toolbar actions ---

  function wrapSelection(before, after, placeholder) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end) || placeholder || "text";
    const replacement = before + selected + after;

    textarea.setRangeText(replacement, start, end, "select");
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length + selected.length;
    textarea.focus();
    schedulePreview();
  }

  function insertAtLineStart(prefix) {
    const start = textarea.selectionStart;
    const before = textarea.value.slice(0, start);
    const lineStart = before.lastIndexOf("\n") + 1;

    textarea.setRangeText(prefix, lineStart, lineStart, "end");
    textarea.focus();
    schedulePreview();
  }

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
    toolbar.addEventListener("click", function (e) {
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

    tabs.addEventListener("click", function (e) {
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
})();
