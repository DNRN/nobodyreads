import { defineComponent } from "../component-definition.js";

/**
 * The post listing, at every content level.
 *
 * All three layouts ship in one stylesheet, keyed off a class the renderer puts
 * on the list. The variant recorded on a theme is an *intent* — the renderer is
 * what knows how many posts there are, and only it can honour `auto`. Emitting
 * one layout's CSS at theme-generation time would freeze that decision before
 * anyone had counted.
 */
const BASE_CSS = `.post-list {
  margin-top: 0.5rem;
}

.post-preview[hidden] {
  display: none;
}

.post-date {
  display: block;
  font-size: var(--post-preview-date-size, 0.72rem);
  font-family: var(--font-mono);
  color: var(--muted);
}

.post-title {
  font-family: var(--font);
  font-size: var(--post-preview-title-size, 1.45rem);
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: -0.015em;
}

.post-title a {
  color: var(--text);
  text-decoration: none;
}

.post-title a:hover {
  text-decoration: underline;
}

.post-excerpt {
  color: var(--post-preview-excerpt-color, var(--body-text));
  font-size: var(--post-preview-excerpt-size, 0.94rem);
  line-height: 1.6;
}

.read-more {
  display: inline-block;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--link);
  text-decoration: none;
  transition: color 0.15s;
}

.read-more:hover {
  color: var(--link-hover);
}

.post-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.post-tag {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  line-height: 1.4;
  padding: 0.19rem 0.5rem;
  border-radius: 999px;
  background: var(--chip-bg);
  color: var(--chip-fg);
}

/* --- Rows: few enough posts that each one gets its excerpt --- */

.post-list--default .post-preview,
.post-list--compact .post-preview {
  padding: var(--post-preview-padding-block, 1.6rem) 0;
  border-top: 1px solid var(--border);
}

.post-list--default .post-title {
  margin-top: 0.35rem;
}

.post-list--default .post-excerpt {
  margin-top: 0.6rem;
  max-width: 32.5rem;
}

.post-list--default .read-more {
  margin-top: 0.9rem;
}

.post-list--compact .post-preview {
  padding: 0.75rem 0;
}

.post-list--compact .post-title {
  font-size: 1rem;
}

.post-list--compact .post-excerpt,
.post-list--compact .read-more {
  display: none;
}

/* --- Cards: enough posts that scanning beats reading --- */

.post-list--card .post-list__items {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 1.375rem;
}

.post-card {
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.post-card .post-card__cover {
  display: block;
  aspect-ratio: 16 / 9;
  background: var(--bg-tint);
  border-bottom: 1px solid var(--border);
}

/* Two classes deep on purpose. A listing is rendered *inside* the home page's
   markdown wrapper, so the prose image rules (.home-intro img et al) are one
   class strong and would otherwise win on source order and un-crop the cover. */
.post-card .post-card__cover img {
  width: 100%;
  height: 100%;
  margin: 0;
  border-radius: 0;
  object-fit: cover;
  display: block;
}

.post-card__body {
  padding: 1rem 1rem 1.125rem;
}

.post-card .post-title {
  font-size: 1.2rem;
  margin-top: 0.5rem;
}

.post-card .post-date {
  margin-top: 0.4rem;
  font-size: 0.69rem;
}

.post-card .post-excerpt {
  margin-top: 0.65rem;
  font-size: 0.85rem;
  line-height: 1.55;
}

/* --- Tag filter --- */

.post-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 1.25rem;
  border-top: 1px solid var(--border);
  padding-top: 1.25rem;
}

.post-filter__label {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  margin-right: 0.25rem;
}

.post-chip {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.4;
  padding: 0.25rem 0.69rem;
  border: none;
  border-radius: 999px;
  background: var(--chip-bg);
  color: var(--chip-fg);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.post-chip--active {
  background: var(--accent);
  color: var(--accent-text);
}

/* --- Load more --- */

.post-list__more {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  margin-top: 2.25rem;
}

.post-list__count {
  font-family: var(--font-mono);
  font-size: 0.69rem;
  color: var(--muted);
}

/* --- Nothing published yet --- */

.site-empty {
  border-top: 1px solid var(--border);
  padding-top: 2.75rem;
  max-width: var(--reading-width);
}

.site-empty__eyebrow {
  font-family: var(--font-mono);
  font-size: 0.69rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.site-empty__headline {
  font-family: var(--font);
  font-size: 1.7rem;
  font-weight: 500;
  color: var(--text);
  margin-top: 0.9rem;
}

.site-empty__headline em {
  font-style: italic;
  color: var(--link);
}

.site-empty__body {
  font-size: 0.97rem;
  line-height: 1.65;
  color: var(--body-text);
  max-width: 27rem;
  margin-top: 0.9rem;
}

.site-empty__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.75rem;
}

/* Dashed, not solid: this is a note *about* the page rather than part of it,
   and only its owner can see it. */
.site-empty__note {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  margin-top: 2.25rem;
  padding: 0.75rem 1rem;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
}

.site-empty__pill {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 0.625rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.19rem 0.44rem;
  border-radius: 999px;
  background: var(--chip-bg);
  color: var(--chip-fg);
}

.site-empty__note p {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.5;
  color: var(--muted);
}

.site-empty__affordance {
  display: flex;
  flex-wrap: wrap;
  gap: 1.125rem;
  margin-top: 1.75rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--muted);
}

.site-empty__affordance a {
  color: var(--link);
}

@media (max-width: 720px) {
  .post-list--card .post-list__items {
    grid-template-columns: minmax(0, 1fr);
  }
}`;

export const postPreviewComponent = defineComponent({
  name: "postPreview",
  label: "Post preview",
  defaultVariant: "auto",
  tokens: [
    {
      key: "titleSize",
      cssVar: "--post-preview-title-size",
      label: "Title size",
      type: "size",
      defaultValue: "1.45rem",
    },
    {
      key: "paddingBlock",
      cssVar: "--post-preview-padding-block",
      label: "Vertical padding",
      type: "size",
      defaultValue: "1.6rem",
    },
    {
      key: "excerptSize",
      cssVar: "--post-preview-excerpt-size",
      label: "Excerpt size",
      type: "size",
      defaultValue: "0.94rem",
    },
    {
      key: "excerptColor",
      cssVar: "--post-preview-excerpt-color",
      label: "Excerpt color",
      type: "color",
      defaultValue: "var(--body-text)",
    },
    {
      key: "dateSize",
      cssVar: "--post-preview-date-size",
      label: "Date size",
      type: "size",
      defaultValue: "0.72rem",
    },
  ],
  variants: {
    auto: { label: "Automatic", css: "" },
    default: { label: "Rows", css: "" },
    compact: { label: "Compact", css: "" },
    card: { label: "Cards", css: "" },
  },
  baseCss: BASE_CSS,
});

/** @deprecated Use postPreviewComponent.css() via the registry */
export function postPreviewCss(): string {
  return postPreviewComponent.css("auto");
}
