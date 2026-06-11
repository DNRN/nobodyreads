import { defineComponent } from "../component-definition.js";

const BASE_CSS = `.post-preview {
  padding: var(--post-preview-padding-block, 1.75rem) 0;
  border-bottom: 1px solid var(--border);
}

.post-preview:first-child {
  padding-top: 0;
}

.post-preview:last-child {
  border-bottom: none;
}

.post-date {
  display: block;
  font-size: var(--post-preview-date-size, 0.75rem);
  font-family: var(--font-mono);
  color: var(--muted);
  margin-bottom: 0.25rem;
}

.post-title {
  font-size: var(--post-preview-title-size, 1.2rem);
  font-weight: 700;
  line-height: 1.3;
}

.post-title a {
  color: var(--text);
  text-decoration: none;
}

.post-title a:hover {
  text-decoration: underline;
}

.post-excerpt {
  margin-top: 0.5rem;
  color: var(--post-preview-excerpt-color, var(--accent));
  font-size: var(--post-preview-excerpt-size, 0.9rem);
}

.read-more {
  display: inline-block;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  font-family: var(--font-mono);
  color: var(--muted);
  text-decoration: none;
  transition: color 0.15s;
}

.read-more:hover {
  color: var(--text);
}`;

const COMPACT_CSS = `.post-preview {
  padding: 0.75rem 0;
}

.post-title {
  font-size: 1rem;
}

.post-excerpt,
.read-more {
  display: none;
}`;

const CARD_CSS = `.post-preview {
  padding: 1.25rem;
  margin-bottom: 1rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.02);
}

:root[data-theme="dark"] .post-preview {
  background: rgba(255, 255, 255, 0.03);
}

.post-preview:last-child {
  border-bottom: 1px solid var(--border);
}`;

export const postPreviewComponent = defineComponent({
  name: "postPreview",
  label: "Post preview",
  defaultVariant: "default",
  tokens: [
    {
      key: "titleSize",
      cssVar: "--post-preview-title-size",
      label: "Title size",
      type: "size",
      defaultValue: "1.2rem",
    },
    {
      key: "paddingBlock",
      cssVar: "--post-preview-padding-block",
      label: "Vertical padding",
      type: "size",
      defaultValue: "1.75rem",
    },
    {
      key: "excerptSize",
      cssVar: "--post-preview-excerpt-size",
      label: "Excerpt size",
      type: "size",
      defaultValue: "0.9rem",
    },
    {
      key: "excerptColor",
      cssVar: "--post-preview-excerpt-color",
      label: "Excerpt color",
      type: "color",
      defaultValue: "var(--accent)",
    },
  ],
  variants: {
    default: { label: "Default", css: "" },
    compact: { label: "Compact", css: COMPACT_CSS },
    card: { label: "Card", css: CARD_CSS },
  },
  baseCss: BASE_CSS,
});

/** @deprecated Use postPreviewComponent.css() via the registry */
export function postPreviewCss(): string {
  return postPreviewComponent.css("default");
}
