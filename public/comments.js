/**
 * Comment thread widget: list, post, reply to, and delete comments on a post.
 *
 * Usage:
 *   <section data-comments data-api-base="/api" data-login-href="/login"
 *            data-slug="my-post" data-enabled="true"></section>
 *
 * Reads identity from the same /membership endpoint the community widget uses,
 * so a signed-in reader sees the composer and an anonymous reader sees a
 * sign-in prompt. Talks to:
 *   GET  {apiBase}/posts/{slug}/comments
 *   POST {apiBase}/posts/{slug}/comments   { body, parentId? }
 *   POST {apiBase}/comments/{id}/delete
 */
(function () {
  var STYLE_ID = "nb-comments-style";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
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
    ].join("\n");
    document.head.appendChild(style);
  }

  function loginUrl(loginHref) {
    var sep = loginHref.indexOf("?") >= 0 ? "&" : "?";
    return loginHref + sep + "next=" + encodeURIComponent(location.pathname);
  }

  async function request(url, method, jsonBody) {
    var opts = {
      method: method || "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    };
    if (jsonBody !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(jsonBody);
    }
    var res = await fetch(url, opts);
    var body = null;
    try {
      body = await res.json();
    } catch (_) {
      /* non-JSON response */
    }
    return { ok: res.ok, status: res.status, body: body };
  }

  function formatDate(iso) {
    // Stored as "YYYY-MM-DD HH:MM:SS" (UTC). Make it a real Date.
    var d = new Date(iso.replace(" ", "T") + "Z");
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function buildTree(comments) {
    var byId = {};
    var roots = [];
    comments.forEach(function (c) {
      c.children = [];
      byId[c.id] = c;
    });
    comments.forEach(function (c) {
      if (c.parentId && byId[c.parentId]) {
        byId[c.parentId].children.push(c);
      } else {
        roots.push(c);
      }
    });
    return roots;
  }

  function Widget(root) {
    var apiBase = root.getAttribute("data-api-base") || "/api";
    var loginHref = root.getAttribute("data-login-href") || "/login";
    var slug = root.getAttribute("data-slug") || "";
    var enabledAttr = root.getAttribute("data-enabled");
    var canModerate = root.getAttribute("data-can-moderate") === "true";
    var threadUrl = apiBase + "/posts/" + encodeURIComponent(slug) + "/comments";

    var signedIn = false;
    var comments = [];

    function commentForm(parentId, onDone) {
      var form = el("form", "nb-comment-form");
      if (!signedIn) {
        var link = el("a", null, "Log in to comment");
        link.href = loginUrl(loginHref);
        form.appendChild(link);
        return form;
      }
      var textarea = el("textarea");
      textarea.required = true;
      textarea.placeholder = parentId ? "Write a reply…" : "Add a comment…";
      var rowEl = el("div", "nb-comment-form-row");
      var submit = el("button", "site-button");
      submit.type = "submit";
      submit.textContent = parentId ? "Reply" : "Comment";
      rowEl.appendChild(submit);
      if (parentId) {
        var cancel = el("button", "site-button-secondary", "Cancel");
        cancel.type = "button";
        cancel.addEventListener("click", function () {
          if (onDone) onDone();
        });
        rowEl.appendChild(cancel);
      }
      var error = el("div", "nb-comment-error");
      error.style.display = "none";
      form.appendChild(textarea);
      form.appendChild(rowEl);
      form.appendChild(error);

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var body = textarea.value.trim();
        if (!body) return;
        submit.disabled = true;
        error.style.display = "none";
        var payload = { body: body };
        if (parentId) payload.parentId = parentId;
        var res = await request(threadUrl, "POST", payload);
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

    function renderComment(c) {
      var li = el("li", "nb-comment" + (c.deleted ? " nb-comment-deleted" : ""));
      var meta = el("div", "nb-comment-meta");
      meta.appendChild(el("span", "nb-comment-author", c.deleted ? "—" : c.authorName));
      meta.appendChild(el("span", "nb-comment-date", formatDate(c.createdAt)));
      li.appendChild(meta);
      li.appendChild(el("div", "nb-comment-body", c.deleted ? "[deleted]" : c.body));

      var actions = el("div", "nb-comment-actions");
      var replyOpen = false;
      var replySlot = el("div");

      if (!c.deleted) {
        var replyBtn = el("button", null, "Reply");
        replyBtn.type = "button";
        replyBtn.addEventListener("click", function () {
          if (replyOpen) return;
          replyOpen = true;
          var f = commentForm(c.id, function () {
            replySlot.innerHTML = "";
            replyOpen = false;
          });
          replySlot.appendChild(f);
        });
        actions.appendChild(replyBtn);
      }

      if (!c.deleted && (c.mine || canModerate)) {
        var delBtn = el("button", null, "Delete");
        delBtn.type = "button";
        delBtn.addEventListener("click", async function () {
          if (!confirm("Delete this comment?")) return;
          var res = await request(apiBase + "/comments/" + encodeURIComponent(c.id) + "/delete", "POST");
          if (res.ok) await reload();
        });
        actions.appendChild(delBtn);
      }
      li.appendChild(actions);
      li.appendChild(replySlot);

      if (c.children && c.children.length) {
        var childList = el("ul", "nb-comment-children");
        c.children.forEach(function (child) {
          childList.appendChild(renderComment(child));
        });
        li.appendChild(childList);
      }
      return li;
    }

    function render() {
      root.innerHTML = "";
      root.className = "nb-comments";

      var count = comments.filter(function (c) {
        return !c.deleted;
      }).length;
      root.appendChild(el("h2", null, count === 1 ? "1 comment" : count + " comments"));

      // Top-level composer first, so the call to action is visible.
      root.appendChild(commentForm(null, null));

      var list = el("ul", "nb-comments-list");
      buildTree(comments).forEach(function (c) {
        list.appendChild(renderComment(c));
      });
      root.appendChild(list);
    }

    async function reload() {
      var res = await request(threadUrl);
      if (!res.ok || !res.body) return;
      comments = res.body.comments || [];
      render();
    }

    async function init() {
      injectStyles();
      if (enabledAttr === "false") {
        root.className = "nb-comments";
        root.innerHTML = "";
        root.appendChild(el("p", "nb-comments-closed", "Comments are closed for this post."));
        return;
      }
      var membership = await request(apiBase + "/membership");
      signedIn = !!(membership.ok && membership.body && membership.body.member);
      await reload();
    }

    return { init: init };
  }

  function start() {
    document.querySelectorAll("[data-comments]").forEach(function (root) {
      if (root.hasAttribute("data-nb-init")) return;
      root.setAttribute("data-nb-init", "1");
      Widget(root)
        .init()
        .catch(function (err) {
          console.warn("comments widget failed:", err);
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
  document.addEventListener("astro:page-load", start);
})();
