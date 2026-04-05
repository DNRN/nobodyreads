import { createSiteEditor } from "../site-editor.js";

const form = document.getElementById("site-editor-form") as HTMLFormElement | null;
const tabs = document.getElementById("site-editor-tabs");
const htmlInput = document.getElementById("site-html") as HTMLTextAreaElement | null;
const cssInput = document.getElementById("site-css") as HTMLTextAreaElement | null;
const tsInput = document.getElementById("site-ts") as HTMLTextAreaElement | null;
const templateHidden = document.getElementById("site-template-hidden") as HTMLInputElement | null;
const preview = document.getElementById("site-preview") as HTMLIFrameElement | null;

if (form && tabs && htmlInput && cssInput && tsInput && templateHidden && preview) {
  createSiteEditor({
    formElement: form,
    tabs,
    panes: document.querySelectorAll(".site-editor-pane"),
    htmlInput,
    cssInput,
    tsInput,
    jsonInput: (document.getElementById("site-json") as HTMLTextAreaElement) ?? undefined,
    templateHidden,
    preview,
    saveStatus: document.getElementById("site-save-status") ?? undefined,
    customTokensEditor: document.getElementById("custom-tokens-editor") ?? undefined,
    addTokenBtn: document.getElementById("add-token-btn") ?? undefined,
  });
}
