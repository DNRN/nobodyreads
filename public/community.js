/**
 * Community widget: join/leave a space and like posts.
 *
 * Usage: <div data-community data-api-base="/api" data-login-href="/login"
 *             data-slug="my-post"></div>
 * The slug attribute is optional; when present a like button is rendered.
 */
(function () {
  var STYLE_ID = "nb-community-style";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".nb-community{display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;margin:1.25rem 0;}",
      ".nb-community--topbar{display:inline-flex;margin:0;gap:0.5rem;}",
      ".nb-community button{cursor:pointer;}",
      ".nb-community .nb-like{display:inline-flex;align-items:center;gap:0.4rem;border:1px solid currentColor;border-radius:999px;background:transparent;color:inherit;padding:0.3rem 0.85rem;font:inherit;}",
      ".nb-community .nb-like.liked .nb-like-heart{color:#e0245e;}",
      ".nb-community .site-button.joined{opacity:0.7;}",
      ".nb-community--topbar .site-button{padding:0.3rem 0.7rem;font-size:0.82rem;}",
    ].join("\n");
    document.head.appendChild(style);
  }

  function loginUrl(loginHref) {
    var sep = loginHref.indexOf("?") >= 0 ? "&" : "?";
    return (
      loginHref + sep + "next=" + encodeURIComponent(location.pathname)
    );
  }

  async function request(url, method) {
    var res = await fetch(url, {
      method: method || "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    var body = null;
    try {
      body = await res.json();
    } catch (_) {
      /* non-JSON response */
    }
    return { ok: res.ok, status: res.status, body: body };
  }

  async function init(root) {
    injectStyles();

    var apiBase = root.getAttribute("data-api-base") || "/api";
    var loginHref = root.getAttribute("data-login-href") || "/login";
    var slug = root.getAttribute("data-slug") || "";
    var likesOnly = root.hasAttribute("data-likes-only");
    var joinOnly = root.hasAttribute("data-join-only");
    var compact = root.classList.contains("nb-community--topbar");

    var membership = await request(apiBase + "/membership");
    if (!membership.ok || !membership.body) return;
    var state = membership.body;

    var joinBtn = null;
    if (!likesOnly && state.member) {
      joinBtn = document.createElement("button");
      joinBtn.type = "button";
      joinBtn.className = "site-button";
    }

    var likeBtn = null;
    var likes = { count: 0, likedByMe: false };
    if (slug && !joinOnly) {
      var likesRes = await request(
        apiBase + "/posts/" + encodeURIComponent(slug) + "/likes"
      );
      if (likesRes.ok && likesRes.body) likes = likesRes.body;
      likeBtn = document.createElement("button");
      likeBtn.type = "button";
      likeBtn.className = "nb-like";
    }

    function render() {
      if (joinBtn) {
        joinBtn.textContent = state.joined
          ? "Joined \u2713"
          : compact
            ? "Join"
            : "Join this space";
        joinBtn.classList.toggle("joined", !!state.joined);
        joinBtn.title = state.joined ? "Click to leave this space" : "";
      }
      if (likeBtn) {
        likeBtn.innerHTML =
          '<span class="nb-like-heart">' +
          (likes.likedByMe ? "\u2665" : "\u2661") +
          "</span><span>" +
          likes.count +
          "</span>";
        likeBtn.classList.toggle("liked", !!likes.likedByMe);
        likeBtn.title = likes.likedByMe ? "Unlike" : "Like this post";
      }
    }

    if (joinBtn) {
      joinBtn.addEventListener("click", async function () {
        if (!state.member) {
          location.href = loginUrl(loginHref);
          return;
        }
        var res = await request(
          apiBase + (state.joined ? "/leave" : "/join"),
          "POST"
        );
        if (res.status === 401) {
          location.href = loginUrl(loginHref);
          return;
        }
        if (res.ok && res.body) {
          state.joined = res.body.joined;
          state.memberCount += state.joined ? 1 : -1;
          render();
        }
      });
    }

    if (likeBtn) {
      likeBtn.addEventListener("click", async function () {
        if (!state.member) {
          location.href = loginUrl(loginHref);
          return;
        }
        var action = likes.likedByMe ? "/unlike" : "/like";
        var url = apiBase + "/posts/" + encodeURIComponent(slug) + action;
        var res = await request(url, "POST");
        if (res.status === 401) {
          location.href = loginUrl(loginHref);
          return;
        }
        // Liking requires membership; join transparently and retry once.
        if (res.status === 403 && res.body && res.body.error === "not_member") {
          var joined = await request(apiBase + "/join", "POST");
          if (!joined.ok) return;
          state.joined = true;
          state.memberCount += 1;
          res = await request(url, "POST");
        }
        if (res.ok && res.body) {
          likes = res.body;
          render();
        }
      });
    }

    render();
    if (joinBtn) root.appendChild(joinBtn);
    if (likeBtn) root.appendChild(likeBtn);
  }

  function start() {
    document.querySelectorAll("[data-community]").forEach(function (el) {
      if (el.hasAttribute("data-nb-init")) return;
      el.setAttribute("data-nb-init", "1");
      init(el).catch(function (err) {
        console.warn("community widget failed:", err);
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
