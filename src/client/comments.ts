// Comment thread widget: list, post, reply to, and delete comments on a post.
//
// Usage:
//   <section data-comments data-api-base="/api" data-login-href="/login"
//            data-slug="my-post" data-enabled="true"></section>
//
// Reads identity from the same /membership endpoint the community widget uses,
// so a signed-in reader sees the composer and an anonymous reader sees a
// sign-in prompt. Talks to:
//   GET  {apiBase}/posts/{slug}/comments
//   POST {apiBase}/posts/{slug}/comments   { body, parentId? }
//   POST {apiBase}/comments/{id}/delete

import { injectStyles, loginUrl, onReady, request } from "./shared/api.js";
import { COMMENTS_CSS, COMMENTS_STYLE_ID } from "./shared/styles.js";
import type {
  CommentNode,
  CommentThread,
  MembershipState,
} from "./shared/types.js";

function formatDate(iso: string): string {
  // Stored as "YYYY-MM-DD HH:MM:SS" (UTC). Make it a real Date.
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string | null,
  text?: string | null,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildTree(comments: CommentNode[]): CommentNode[] {
  const byId: Record<string, CommentNode> = {};
  const roots: CommentNode[] = [];
  comments.forEach((c) => {
    c.children = [];
    byId[c.id] = c;
  });
  comments.forEach((c) => {
    const parent = c.parentId ? byId[c.parentId] : undefined;
    if (parent) {
      parent.children!.push(c);
    } else {
      roots.push(c);
    }
  });
  return roots;
}

function createWidget(root: HTMLElement): { init: () => Promise<void> } {
  const apiBase = root.getAttribute("data-api-base") || "/api";
  const loginHref = root.getAttribute("data-login-href") || "/login";
  const slug = root.getAttribute("data-slug") || "";
  const enabledAttr = root.getAttribute("data-enabled");
  const canModerate = root.getAttribute("data-can-moderate") === "true";
  const threadUrl = apiBase + "/posts/" + encodeURIComponent(slug) + "/comments";

  let signedIn = false;
  let comments: CommentNode[] = [];

  function commentForm(
    parentId: string | null,
    onDone: (() => void) | null,
  ): HTMLFormElement {
    const form = el("form", "nb-comment-form");
    if (!signedIn) {
      const link = el("a", null, "Log in to comment");
      link.href = loginUrl(loginHref);
      form.appendChild(link);
      return form;
    }
    const textarea = el("textarea");
    textarea.required = true;
    textarea.placeholder = parentId ? "Write a reply…" : "Add a comment…";
    const rowEl = el("div", "nb-comment-form-row");
    const submit = el("button", "site-button");
    submit.type = "submit";
    submit.textContent = parentId ? "Reply" : "Comment";
    rowEl.appendChild(submit);
    if (parentId) {
      const cancel = el("button", "site-button-secondary", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", () => {
        if (onDone) onDone();
      });
      rowEl.appendChild(cancel);
    }
    const error = el("div", "nb-comment-error");
    error.style.display = "none";
    form.appendChild(textarea);
    form.appendChild(rowEl);
    form.appendChild(error);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = textarea.value.trim();
      if (!body) return;
      submit.disabled = true;
      error.style.display = "none";
      const payload: { body: string; parentId?: string } = { body };
      if (parentId) payload.parentId = parentId;
      const res = await request(threadUrl, "POST", payload);
      submit.disabled = false;
      if (res.status === 401) {
        location.href = loginUrl(loginHref);
        return;
      }
      if (res.status === 429) {
        error.textContent = "You're commenting too fast — try again shortly.";
        error.style.display = "block";
        return;
      }
      if (!res.ok) {
        error.textContent = "Could not post your comment.";
        error.style.display = "block";
        return;
      }
      textarea.value = "";
      if (onDone) onDone();
      await reload();
    });
    return form;
  }

  function renderComment(c: CommentNode): HTMLLIElement {
    let cls = "nb-comment";
    if (c.deleted) cls += " nb-comment-deleted";
    if (c.pinned) cls += " nb-comment-pinned";
    const li = el("li", cls);
    const meta = el("div", "nb-comment-meta");
    if (c.pinned) {
      meta.appendChild(el("span", "nb-comment-pinned-badge", "Pinned"));
    }
    meta.appendChild(
      el("span", "nb-comment-author", c.deleted ? "—" : c.authorName),
    );
    meta.appendChild(el("span", "nb-comment-date", formatDate(c.createdAt)));
    li.appendChild(meta);
    li.appendChild(
      el("div", "nb-comment-body", c.deleted ? "[deleted]" : c.body),
    );

    const actions = el("div", "nb-comment-actions");
    let replyOpen = false;
    const replySlot = el("div");

    if (!c.deleted) {
      const replyBtn = el("button", null, "Reply");
      replyBtn.type = "button";
      replyBtn.addEventListener("click", () => {
        if (replyOpen) return;
        replyOpen = true;
        const f = commentForm(c.id, () => {
          replySlot.innerHTML = "";
          replyOpen = false;
        });
        replySlot.appendChild(f);
      });
      actions.appendChild(replyBtn);
    }

    if (!c.deleted && (c.mine || canModerate)) {
      const delBtn = el("button", null, "Delete");
      delBtn.type = "button";
      delBtn.addEventListener("click", async () => {
        if (!confirm("Delete this comment?")) return;
        const res = await request(
          apiBase + "/comments/" + encodeURIComponent(c.id) + "/delete",
          "POST",
        );
        if (res.ok) await reload();
      });
      actions.appendChild(delBtn);
    }
<<<<<<< HEAD

    if (!c.deleted && canModerate) {
      const pinBtn = el("button", null, c.pinned ? "Unpin" : "Pin");
      pinBtn.type = "button";
      pinBtn.addEventListener("click", async () => {
        const res = await request(
          apiBase + "/comments/" + encodeURIComponent(c.id) + "/pin",
          "POST",
        );
        if (res.ok) await reload();
      });
      actions.appendChild(pinBtn);
    }
=======
>>>>>>> 568d054afd55a1b7ea2c5832be8d33210789ddc8
    li.appendChild(actions);
    li.appendChild(replySlot);

    if (c.children && c.children.length) {
      const childList = el("ul", "nb-comment-children");
      c.children.forEach((child) => {
        childList.appendChild(renderComment(child));
      });
      li.appendChild(childList);
    }
    return li;
  }

  function render(): void {
    root.innerHTML = "";
    root.className = "nb-comments";

    const count = comments.filter((c) => !c.deleted).length;
    root.appendChild(
      el("h2", null, count === 1 ? "1 comment" : count + " comments"),
    );

    // Top-level composer first, so the call to action is visible.
    root.appendChild(commentForm(null, null));

    const list = el("ul", "nb-comments-list");
    buildTree(comments).forEach((c) => {
      list.appendChild(renderComment(c));
    });
    root.appendChild(list);
  }

  async function reload(): Promise<void> {
    const res = await request<CommentThread>(threadUrl);
    if (!res.ok || !res.body) return;
    comments = res.body.comments || [];
    render();
  }

  async function init(): Promise<void> {
    injectStyles(COMMENTS_STYLE_ID, COMMENTS_CSS);
    if (enabledAttr === "false") {
      root.className = "nb-comments";
      root.innerHTML = "";
      root.appendChild(
        el("p", "nb-comments-closed", "Comments are closed for this post."),
      );
      return;
    }
    const membership = await request<MembershipState>(apiBase + "/membership");
    signedIn = !!(membership.ok && membership.body && membership.body.member);
    await reload();
  }

  return { init };
}

function start(): void {
  document
    .querySelectorAll<HTMLElement>("[data-comments]")
    .forEach((root) => {
      if (root.hasAttribute("data-nb-init")) return;
      root.setAttribute("data-nb-init", "1");
      createWidget(root)
        .init()
        .catch((err) => {
          console.warn("comments widget failed:", err);
        });
    });
}

onReady(start);
