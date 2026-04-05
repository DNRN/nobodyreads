import type { EditorView } from "@codemirror/view";

export interface EditorInstance {
  view: EditorView;
  getValue(): string;
  destroy(): void;
}

export interface PageEditorOptions {
  /** Parent element where the CodeMirror editor will be mounted. */
  contentElement: HTMLElement;
  /** Element where the markdown preview HTML is rendered. */
  previewElement: HTMLElement;
  /** The form wrapping the editor (for submit handling and Cmd+S). */
  formElement?: HTMLFormElement;
  /** Title input for auto-slug generation on new pages. */
  titleInput?: HTMLInputElement;
  /** Slug input for auto-slug generation on new pages. */
  slugInput?: HTMLInputElement;
  /** Toolbar container with data-action buttons. */
  toolbar?: HTMLElement;
  /** Mobile tab bar for write/preview switching. */
  tabs?: HTMLElement;
  /** Hidden input that receives the content on form submit. */
  contentField?: HTMLInputElement;
  /** URL for media uploads (default: "/admin/media/upload"). */
  uploadUrl?: string;
  /** URL for media list API (default: "/admin/media/list"). */
  mediaListUrl?: string;
  /** Initial markdown content. */
  initialValue?: string;
  /** Whether this is a new page (enables slug auto-generation). */
  isNewPage?: boolean;
}

export interface PageEditorInstance {
  editor: EditorInstance;
  destroy(): void;
}

export interface SiteEditorOptions {
  /** The form element wrapping the site editor. */
  formElement: HTMLFormElement;
  /** Tab bar for switching between HTML/CSS/JS/Advanced/Preview panes. */
  tabs: HTMLElement;
  /** All pane elements (matched via data-pane attribute). */
  panes: NodeListOf<HTMLElement> | HTMLElement[];
  /** Textarea for the HTML editor. */
  htmlInput: HTMLTextAreaElement;
  /** Textarea for the CSS editor. */
  cssInput: HTMLTextAreaElement;
  /** Textarea for the JS/TS editor. */
  tsInput: HTMLTextAreaElement;
  /** Optional textarea for the advanced JSON editor. */
  jsonInput?: HTMLTextAreaElement;
  /** Hidden input holding the serialised template JSON. */
  templateHidden: HTMLInputElement;
  /** Preview iframe. */
  preview: HTMLIFrameElement;
  /** Status indicator element. */
  saveStatus?: HTMLElement;
  /** Container for the custom token editor table. */
  customTokensEditor?: HTMLElement;
  /** "Add token" button. */
  addTokenBtn?: HTMLElement;
  /** URL for saving token values (default: "/admin/settings/tokens"). */
  tokenSaveUrl?: string;
}

export interface SiteEditorInstance {
  destroy(): void;
}

export interface ViewEditorOptions {
  /** The form element wrapping the view editor. */
  formElement: HTMLFormElement;
  /** The <select> element for choosing the view kind. */
  kindSelect: HTMLSelectElement;
  /** Textarea for the SQL query editor. */
  queryTextarea?: HTMLTextAreaElement;
  /** Textarea for the template/JS editor. */
  templateTextarea?: HTMLTextAreaElement;
  /** Container shown for post-list kind fields. */
  postListFields?: HTMLElement;
  /** Container shown for custom kind fields. */
  customFields?: HTMLElement;
  /** Hint shown for post-list kind. */
  hintPostList?: HTMLElement;
  /** Hint shown for custom kind. */
  hintCustom?: HTMLElement;
}

export interface ViewEditorInstance {
  destroy(): void;
}
