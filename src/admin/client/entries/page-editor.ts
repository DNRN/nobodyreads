import { createPageEditor } from "../page-editor.js";

const textarea = document.getElementById("content") as HTMLTextAreaElement | null;
const preview = document.getElementById("preview");
if (textarea && preview) {
  const form = document.getElementById("editor-form") as HTMLFormElement | null;
  const isNewPage = form?.querySelector('input[name="id"]') as HTMLInputElement | null;

  createPageEditor({
    contentElement: textarea.parentElement!,
    previewElement: preview,
    formElement: form ?? undefined,
    titleInput: (document.getElementById("title") as HTMLInputElement) ?? undefined,
    slugInput: (document.getElementById("slug") as HTMLInputElement) ?? undefined,
    toolbar: document.getElementById("editor-toolbar") ?? undefined,
    tabs: document.getElementById("editor-tabs") ?? undefined,
    contentField: (document.getElementById("content-field") as HTMLInputElement) ?? undefined,
    initialValue: textarea.value,
    isNewPage: isNewPage?.value === "",
  });

  textarea.style.display = "none";
}
