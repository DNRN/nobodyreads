import { createViewEditor } from "../view-editor.js";

const form = document.getElementById("view-editor-form") as HTMLFormElement | null;
const kindSelect = document.getElementById("kind") as HTMLSelectElement | null;

if (form && kindSelect) {
  createViewEditor({
    formElement: form,
    kindSelect,
    queryTextarea: (document.getElementById("query") as HTMLTextAreaElement) ?? undefined,
    templateTextarea: (document.getElementById("template") as HTMLTextAreaElement) ?? undefined,
    postListFields: document.getElementById("field-limit") ?? undefined,
    customFields: document.getElementById("custom-fields") ?? undefined,
    hintPostList: document.getElementById("kind-hint-post-list") ?? undefined,
    hintCustom: document.getElementById("kind-hint-custom") ?? undefined,
  });
}
