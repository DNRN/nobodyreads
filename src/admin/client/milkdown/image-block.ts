/**
 * The image block's contextual controls (docs/designs/admin-editor.md §6.04).
 *
 * A hover bar on the image itself — alignment, width, replace, alt text,
 * delete — rather than a global toolbar, plus a soft nudge when alt text is
 * missing. This is the grammar the other block types (embeds, code, callouts)
 * are meant to reuse, so the bar is built from the shared `.nr-ctxbar`
 * primitive rather than styling of its own.
 *
 * Why a NodeView instead of Crepe's ImageBlock feature: that feature stores its
 * aspect ratio *in the alt slot*, which is where our size/align hints live
 * (`![alt|400px|right]`), so enabling it destroys them. See `features` in
 * PageEditor.svelte.
 *
 * Size and alignment are read and written through `parseImageAlt` /
 * `formatImageAlt` so the editor and the server renderer cannot disagree about
 * the hint grammar.
 */
import { $view } from "@milkdown/kit/utils";
import { imageSchema } from "@milkdown/kit/preset/commonmark";
import type { NodeViewConstructor } from "@milkdown/kit/prose/view";
import {
  formatImageAlt,
  parseImageAlt,
  type ImageAlign,
} from "../../../shared/image-markdown.js";

/** Width presets offered in the bar. `undefined` means "fill the column". */
const WIDTHS: { label: string; value: string | undefined }[] = [
  { label: "S", value: "300px" },
  { label: "M", value: "600px" },
  { label: "Full", value: undefined },
];

const ALIGNMENTS: { label: string; value: ImageAlign | undefined; icon: string }[] = [
  { label: "Align left", value: "left", icon: "M3 5h18M3 10h10M3 15h18M3 20h10" },
  { label: "Centre", value: "center", icon: "M3 5h18M7 10h10M3 15h18M7 20h10" },
  { label: "Align right", value: "right", icon: "M3 5h18M11 10h10M3 15h18M11 20h10" },
];

function svg(path: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export interface ImageBlockOptions {
  /**
   * Opens the host's media picker and resolves to a URL, or null if the author
   * backed out. Supplied by the editor island so this module stays unaware of
   * how media is stored or browsed.
   */
  onReplace?: () => Promise<string | null>;
}

let options: ImageBlockOptions = {};

/** Wire the host's media picker into the Replace button. */
export function configureImageBlock(next: ImageBlockOptions): void {
  options = next;
}

const imageNodeView: NodeViewConstructor = (node, view, getPos) => {
  let current = node;

  const dom = el("figure", "nbr-image");
  const img = el("img", "nbr-image-img");
  const bar = el("div", "nbr-image-bar nr-ctxbar");
  const altRow = el("div", "nbr-image-altrow");
  const altInput = el("input", "nbr-image-altinput");
  const nudge = el("p", "nbr-image-nudge");

  altInput.type = "text";
  altInput.placeholder = "Describe this image for screen readers";
  altRow.append(altInput);
  nudge.textContent = "No alt text — screen readers will skip this image.";

  dom.append(img, bar, altRow, nudge);

  function parsed() {
    return parseImageAlt(String(current.attrs.alt ?? ""));
  }

  /** Write a new alt slot back into the document. */
  function patch(next: Partial<ReturnType<typeof parsed>>) {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const merged = { ...parsed(), ...next };
    view.dispatch(
      view.state.tr.setNodeMarkup(pos, undefined, {
        ...current.attrs,
        alt: formatImageAlt(merged),
      }),
    );
  }

  function iconButton(label: string, icon: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "nr-ctxbar-btn");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = icon;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onClick();
    });
    return button;
  }

  function textButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", "nr-ctxbar-btn");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onClick();
    });
    return button;
  }

  // --- bar contents, built once ---
  const alignButtons = ALIGNMENTS.map((a) => {
    const button = iconButton(a.label, svg(a.icon), () =>
      patch({ align: parsed().align === a.value ? undefined : a.value }),
    );
    button.dataset.align = a.value ?? "";
    return button;
  });
  for (const button of alignButtons) bar.append(button);

  bar.append(el("span", "nr-ctxbar-sep"));

  const widthButtons = WIDTHS.map((w) =>
    textButton(w.label, () => patch({ size: w.value })),
  );
  for (const button of widthButtons) bar.append(button);

  bar.append(el("span", "nr-ctxbar-sep"));

  const replaceButton = textButton("Replace", async () => {
    const url = await options.onReplace?.();
    if (!url) return;
    const pos = getPos();
    if (typeof pos !== "number") return;
    view.dispatch(
      view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, src: url }),
    );
  });
  bar.append(replaceButton);

  const altButton = textButton("Alt", () => {
    dom.classList.toggle("is-editing-alt");
    if (dom.classList.contains("is-editing-alt")) altInput.focus();
  });
  bar.append(altButton);

  bar.append(el("span", "nr-ctxbar-sep"));

  const deleteButton = iconButton("Delete image", svg("M6 6l12 12M18 6 6 18"), () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    view.dispatch(view.state.tr.delete(pos, pos + current.nodeSize));
    view.focus();
  });
  deleteButton.classList.add("is-danger");
  bar.append(deleteButton);

  altInput.addEventListener("input", () => patch({ alt: altInput.value }));
  altInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      dom.classList.remove("is-editing-alt");
      view.focus();
    }
  });

  function render() {
    const { alt, size, align } = parsed();
    img.src = String(current.attrs.src ?? "");
    img.alt = alt;

    // Mirror the published rendering closely enough that the author is judging
    // the real thing, not an approximation.
    const dim = size?.match(/^(\d+)x(\d+)$/);
    img.style.width = dim ? `${dim[1]}px` : "";
    img.style.height = dim ? `${dim[2]}px` : "";
    img.style.objectFit = dim ? "cover" : "";
    img.style.maxWidth = size && !dim ? size : "";

    dom.dataset.align = align ?? "";
    for (const button of alignButtons) {
      button.classList.toggle("is-active", (button.dataset.align || "") === (align ?? ""));
    }
    widthButtons.forEach((button, i) => {
      button.classList.toggle("is-active", WIDTHS[i]!.value === size);
    });

    if (document.activeElement !== altInput) altInput.value = alt;
    // A nudge, never a blocker: it never prevents saving or publishing.
    dom.classList.toggle("has-no-alt", alt.trim().length === 0);
  }

  render();

  return {
    dom,
    update(updated) {
      if (updated.type !== current.type) return false;
      current = updated;
      render();
      return true;
    },
    selectNode() {
      dom.classList.add("is-selected");
    },
    deselectNode() {
      dom.classList.remove("is-selected");
      dom.classList.remove("is-editing-alt");
    },
    // The bar and the alt input are chrome, not document content — without
    // this ProseMirror treats a click on them as a selection change and the
    // input can never hold focus.
    stopEvent: (event) => {
      const target = event.target as Node | null;
      return !!target && (bar.contains(target) || altRow.contains(target));
    },
    ignoreMutation: () => true,
    destroy() {
      dom.remove();
    },
  };
};

/** The image NodeView plugin, for `editor.use(...)`. */
export const nobodyreadsImageBlock = $view(imageSchema.node, () => imageNodeView);
