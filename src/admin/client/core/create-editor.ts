import { EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import type { EditorInstance } from "../types.js";

export function isDarkMode(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

export interface CreateEditorOptions {
  /** Parent element to mount the CodeMirror instance into. */
  parent: HTMLElement;
  /** Initial document content. */
  initialValue?: string;
  /** Additional CodeMirror extensions. */
  extensions?: Extension[];
  /** Force dark/light mode instead of auto-detecting. */
  darkMode?: boolean;
  /** Enable line wrapping (default: true). */
  lineWrapping?: boolean;
}

/**
 * Create a CodeMirror 6 editor instance with sensible defaults.
 * Shared across all editor types to eliminate duplication.
 */
export function createEditor(options: CreateEditorOptions): EditorInstance {
  const {
    parent,
    initialValue = "",
    extensions = [],
    lineWrapping = true,
  } = options;
  const dark = options.darkMode ?? isDarkMode();

  const themeExtensions: Extension[] = dark ? [oneDark] : [];
  const wrapping: Extension[] = lineWrapping ? [EditorView.lineWrapping] : [];

  const state = EditorState.create({
    doc: initialValue,
    extensions: [basicSetup, ...themeExtensions, ...wrapping, ...extensions],
  });

  const view = new EditorView({ state, parent });

  return {
    view,
    getValue: () => view.state.doc.toString(),
    destroy: () => view.destroy(),
  };
}

/**
 * Replace a <textarea> with a CodeMirror editor, using the textarea's
 * value as the initial content and its parent as the mount point.
 */
export function replaceTextarea(
  textarea: HTMLTextAreaElement,
  extensions: Extension[] = [],
  opts?: { lineWrapping?: boolean; darkMode?: boolean },
): EditorInstance | null {
  const parent = textarea.parentElement;
  if (!parent) return null;
  textarea.style.display = "none";

  return createEditor({
    parent,
    initialValue: textarea.value,
    extensions,
    lineWrapping: opts?.lineWrapping,
    darkMode: opts?.darkMode,
  });
}
