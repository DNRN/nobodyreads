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

export { renderImage, DEFAULT_IMAGE_WIDTH } from "../../shared/image-markdown.js";

// Client-safe template helpers for admin islands (no server/node deps).
export { generateCss } from "../../template/generate.js";
export {
  TYPE_PAIRINGS,
  DENSITY_STEPS,
  CORNER_STEPS,
  COLOR_SLOTS,
  matchTypePairing,
  matchDensityStep,
  matchCornerStep,
} from "../../template/presets.js";
export type {
  TypePairing,
  DensityStep,
  CornerStep,
  ColorSlot,
} from "../../template/presets.js";
export type { SiteTemplateDefinition, TokenSet } from "../../template/types.js";

export type {
  EditorInstance,
  PageEditorOptions,
  PageEditorInstance,
  SiteEditorOptions,
  SiteEditorInstance,
  ViewEditorOptions,
  ViewEditorInstance,
} from "./types.js";
