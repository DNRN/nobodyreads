import type { SiteTemplateDefinition } from "../../template/types.js";
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
  /** Hidden input carrying the published flag (disabled = draft). */
  publishedField?: HTMLInputElement;
  /** Badge element reflecting the current published status. */
  publishStatus?: HTMLElement;
  /** Button that toggles published state and submits the form. */
  publishToggle?: HTMLButtonElement;
  /** URL for media uploads (default: "/admin/media/upload"). */
  uploadUrl?: string;
  /** URL for media list API (default: "/admin/media/list"). */
  mediaListUrl?: string;
  /**
   * URL for the server-side preview render API (default:
   * "/admin/editor/preview"). Used to resolve {{collection:slug}} embeds and
   * [[id]] links, which the client-side markdown pass cannot.
   */
  previewUrl?: string;
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
  /**
   * Extra template fields contributed by controls outside this module — the
   * Design tabs' visual editors, which own their state in Svelte rather than
   * in the DOM this module reads.
   *
   * Receives the template as assembled so far — including the components read
   * back out of the DOM — so a tab can compose with those rather than replacing
   * them wholesale. Merged over the base on every serialise.
   */
  templatePatch?: (base: Record<string, unknown>) => Record<string, unknown>;
  /**
   * Ran before the template is posted. Where a tab has state that is not part
   * of the template — Brand writes site settings, not the theme — it saves
   * here so one Save button still means one save.
   */
  beforeSave?: () => Promise<void>;
  /** Components tab pane for variant/token controls. */
  componentsPane?: HTMLElement;
  /** "Add token" button. */
  addTokenBtn?: HTMLElement;
  /** URL for saving token values (default: "/admin/settings/tokens"). */
  tokenSaveUrl?: string;
}

export interface SiteEditorInstance {
  destroy(): void;
  /** Flag unsaved work — for controls that live outside this module's DOM. */
  markDirty(): void;
  /** Save a draft revision; resolves with its id, or null if the save failed. */
  save(): Promise<number | null>;
  /** Replace the code panes and hidden template with a stored template. */
  loadTemplate(template: Record<string, unknown>): void;
  /** Render a template into the preview without adopting it. */
  previewTemplate(template: SiteTemplateDefinition): void;
  /**
   * The template as it currently stands, serialised.
   *
   * The only correct assembly of it: code panes, component DOM and the tabs'
   * own state all feed in, and a caller that rebuilds it by hand will quietly
   * miss whichever of those it forgot.
   */
  getTemplateJson(): string;
  /** Re-generate and inject the preview stylesheet now. */
  refreshPreviewCss(): void;
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
