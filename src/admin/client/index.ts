export { createPageEditor } from "./page-editor.js";
export { createSiteEditor } from "./site-editor.js";
export { createViewEditor } from "./view-editor.js";

export { createEditor, replaceTextarea, isDarkMode } from "./core/create-editor.js";
export type { CreateEditorOptions } from "./core/create-editor.js";

export {
  wrapSelection,
  insertAtLineStart,
  insertTextAtCursor,
  buildToolbarActions,
  attachToolbar,
} from "./core/toolbar.js";

export {
  uploadFile,
  openFilePicker,
  attachDragDrop,
  createMediaModal,
} from "./core/media.js";
export type { MediaModalOptions } from "./core/media.js";

export type {
  EditorInstance,
  PageEditorOptions,
  PageEditorInstance,
  SiteEditorOptions,
  SiteEditorInstance,
  ViewEditorOptions,
  ViewEditorInstance,
} from "./types.js";
