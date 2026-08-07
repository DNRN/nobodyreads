import { defineComponent } from "../component-definition.js";

const BASE_CSS = `.post-header {
  margin-bottom: 2rem;
}

.post-body,
.page-body,
.home-intro {
  display: flow-root;
  font-size: 0.97rem;
  color: var(--body-text);
}

.post-header .post-title {
  font-size: 1.875rem;
  line-height: 1.15;
}

/* On a post page the date is a byline under the title, not an eyebrow above
   it — unlike in the post-preview listing, where .post-date leads. */
.post-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
  margin-top: 0.75rem;
}

.post-meta .post-date {
  margin: 0;
}

/* Fades the truncated body into the page above a paywall. The one gradient the
   design allows, and functional rather than decorative — it says "this stops
   mid-sentence" in a way a hard cut cannot. */
.post-body--teaser {
  position: relative;
}

.post-body--teaser::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  /* Capped at half the teaser: a short one would otherwise be faded away in
     its entirety, leaving a paywall over nothing the reader can read. */
  height: min(6rem, 50%);
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--bg), transparent 100%),
    var(--bg)
  );
  pointer-events: none;
}

.post-body p {
  margin-bottom: 1.2rem;
}

.post-body h2 {
  font-size: 1.25rem;
  margin-top: 2rem;
  margin-bottom: 0.75rem;
}

.post-body code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: var(--bg-tint);
  padding: 0.15em 0.35em;
  border-radius: var(--radius-sm);
}

.post-body pre {
  background: var(--bg-tint);
  padding: 1rem 1.25rem;
  border-radius: var(--radius);
  overflow-x: auto;
  margin-bottom: 1.2rem;
  font-size: 0.8rem;
  line-height: 1.6;
}

.post-body pre code {
  background: none;
  padding: 0;
}

.post-body img,
.page-body img,
.home-intro img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  display: block;
  margin: 0 auto 1.2rem;
}

.post-body img.nbr-img-center,
.page-body img.nbr-img-center,
.home-intro img.nbr-img-center {
  margin-left: auto;
  margin-right: auto;
}

.post-body img.nbr-img-left,
.page-body img.nbr-img-left,
.home-intro img.nbr-img-left {
  float: left;
  max-width: 50%;
  margin: 0.3rem 1.4rem 0.8rem 0;
}

.post-body img.nbr-img-right,
.page-body img.nbr-img-right,
.home-intro img.nbr-img-right {
  float: right;
  max-width: 50%;
  margin: 0.3rem 0 0.8rem 1.4rem;
}

@media (max-width: 640px) {
  .post-body img.nbr-img-left,
  .page-body img.nbr-img-left,
  .home-intro img.nbr-img-left,
  .post-body img.nbr-img-right,
  .page-body img.nbr-img-right,
  .home-intro img.nbr-img-right {
    float: none;
    max-width: 100%;
    margin-left: auto;
    margin-right: auto;
  }
}

.post-body blockquote {
  border-left: 3px solid var(--border);
  padding-left: 1rem;
  color: var(--muted);
  font-style: italic;
  margin-bottom: 1.2rem;
}

.back-link {
  display: inline-block;
  margin-top: 2rem;
  font-size: 0.8rem;
  font-family: var(--font-mono);
  color: var(--muted);
  text-decoration: none;
}

.back-link:hover {
  color: var(--text);
}

.nb-subscribe {
  display: flex;
  gap: 0.5rem;
  margin-top: 2rem;
  margin-bottom: 3rem;
  max-width: 24rem;
}

.nb-subscribe .site-input {
  flex: 1;
  min-width: 0;
}

.nb-subscribe .site-button {
  flex-shrink: 0;
}`;

export const postBodyComponent = defineComponent({
  name: "postBody",
  label: "Post body",
  defaultVariant: "default",
  tokens: [],
  variants: {
    default: { label: "Default", css: "" },
  },
  baseCss: BASE_CSS,
});

/** @deprecated Use postBodyComponent.css() via the registry */
export function postBodyCss(): string {
  return postBodyComponent.css("default");
}
