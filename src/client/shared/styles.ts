// Widget styles, injected at runtime so the scripts are drop-in (no separate
// stylesheet link to wire up). Each constant is the textContent of a single
// <style> element; see injectStyles() in ./api.ts.

export const COMMUNITY_STYLE_ID = "nb-community-style";

export const COMMUNITY_CSS = [
  ".nb-community{display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;margin:1.25rem 0;}",
  ".nb-community--topbar{display:inline-flex;margin:0;gap:0.5rem;}",
  ".nb-community button{cursor:pointer;}",
  ".nb-community .nb-like{display:inline-flex;align-items:center;gap:0.4rem;border:1px solid currentColor;border-radius:999px;background:transparent;color:inherit;padding:0.3rem 0.85rem;font:inherit;}",
  ".nb-community .nb-like.liked .nb-like-heart{color:#e0245e;}",
  ".nb-community .site-button.joined{opacity:0.7;}",
  ".nb-community--topbar .site-button{padding:0.3rem 0.7rem;font-size:0.82rem;}",
].join("\n");

export const COMMENTS_STYLE_ID = "nb-comments-style";

export const COMMENTS_CSS = [
  ".nb-comments{margin:2.5rem 0;}",
  ".nb-comments h2{font-size:1.15rem;margin:0 0 1rem;}",
  ".nb-comments-list{list-style:none;margin:0;padding:0;}",
  ".nb-comment{margin:0 0 1rem;padding:0.75rem 0 0;border-top:1px solid rgba(127,127,127,0.2);}",
  ".nb-comment-meta{font-size:0.82rem;opacity:0.7;display:flex;gap:0.5rem;align-items:baseline;}",
  ".nb-comment-author{font-weight:600;opacity:1;}",
  ".nb-comment-body{margin:0.35rem 0 0.5rem;white-space:pre-wrap;overflow-wrap:anywhere;}",
  ".nb-comment-deleted .nb-comment-body{opacity:0.55;font-style:italic;}",
  ".nb-comment-actions{display:flex;gap:0.75rem;font-size:0.82rem;}",
  ".nb-comment-actions button{background:none;border:none;padding:0;cursor:pointer;color:inherit;opacity:0.7;font:inherit;text-decoration:underline;}",
  ".nb-comment-actions button:hover{opacity:1;}",
  ".nb-comment-children{list-style:none;margin:0.5rem 0 0;padding:0 0 0 1.25rem;border-left:2px solid rgba(127,127,127,0.15);}",
  ".nb-comment-form{margin:0.75rem 0 0;}",
  ".nb-comment-form textarea{width:100%;box-sizing:border-box;min-height:4.5rem;font:inherit;padding:0.5rem;resize:vertical;}",
  ".nb-comment-form-row{display:flex;gap:0.5rem;align-items:center;margin-top:0.4rem;}",
  ".nb-comment-error{color:#e0245e;font-size:0.85rem;margin-top:0.4rem;}",
  ".nb-comments-closed{opacity:0.7;font-style:italic;}",
  ".nb-comment-pinned{background:rgba(127,127,127,0.06);border-radius:4px;padding:0.5rem 0.75rem 0.75rem;margin-bottom:0.25rem;}",
  ".nb-comment-pinned-badge{font-size:0.72rem;font-weight:700;letter-spacing:0.04em;opacity:0.65;margin-right:0.4rem;}",
].join("\n");
