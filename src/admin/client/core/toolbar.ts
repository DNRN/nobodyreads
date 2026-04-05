import type { EditorView } from "@codemirror/view";

/**
 * Wrap the current selection (or insert a placeholder) with before/after strings.
 */
export function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  placeholder?: string,
): void {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to) || placeholder || "text";
  const replacement = before + selected + after;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: replacement },
    selection: {
      anchor: range.from + before.length,
      head: range.from + before.length + selected.length,
    },
  });
  view.focus();
}

/**
 * Insert a prefix at the start of the line containing the cursor.
 */
export function insertAtLineStart(view: EditorView, prefix: string): void {
  const { state } = view;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);

  view.dispatch({
    changes: { from: line.from, to: line.from, insert: prefix },
  });
  view.focus();
}

/**
 * Insert text at the current cursor position.
 */
export function insertTextAtCursor(view: EditorView, text: string): void {
  const { state } = view;
  const pos = state.selection.main.head;
  view.dispatch({
    changes: { from: pos, to: pos, insert: text },
    selection: { anchor: pos + text.length },
  });
  view.focus();
}

export type ToolbarAction =
  | "bold"
  | "italic"
  | "heading"
  | "link"
  | "code"
  | "codeblock"
  | "ul"
  | "quote"
  | "image"
  | "media";

/**
 * Build the default set of toolbar action handlers.
 * The `image` and `media` callbacks are injected by the caller.
 */
export function buildToolbarActions(
  view: EditorView,
  extra: { image?: () => void; media?: () => void } = {},
): Record<string, () => void> {
  return {
    bold: () => wrapSelection(view, "**", "**", "bold text"),
    italic: () => wrapSelection(view, "_", "_", "italic text"),
    heading: () => insertAtLineStart(view, "## "),
    link: () => wrapSelection(view, "[", "](url)", "link text"),
    code: () => wrapSelection(view, "`", "`", "code"),
    codeblock: () => wrapSelection(view, "\n```\n", "\n```\n", "code here"),
    ul: () => insertAtLineStart(view, "- "),
    quote: () => insertAtLineStart(view, "> "),
    image: extra.image ?? (() => {}),
    media: extra.media ?? (() => {}),
  };
}

/**
 * Wire up a toolbar container so clicks on `button[data-action]` trigger
 * the corresponding action handler.
 */
export function attachToolbar(
  toolbar: HTMLElement,
  actions: Record<string, () => void>,
): void {
  toolbar.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("button[data-action]") as HTMLElement | null;
    if (!btn) return;
    const action = btn.dataset.action;
    if (action && actions[action]) {
      actions[action]();
    }
  });
}
