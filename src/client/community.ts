// Community widget: join/leave a space and like posts.
//
// Usage: <div data-community data-api-base="/api" data-login-href="/login"
//             data-slug="my-post"></div>
// The slug attribute is optional; when present a like button is rendered.

import { injectStyles, loginUrl, onReady, request } from "./shared/api.js";
import { COMMUNITY_CSS, COMMUNITY_STYLE_ID } from "./shared/styles.js";
import type { LikeState, MembershipState } from "./shared/types.js";

async function init(root: HTMLElement): Promise<void> {
  injectStyles(COMMUNITY_STYLE_ID, COMMUNITY_CSS);

  const apiBase = root.getAttribute("data-api-base") || "/api";
  const loginHref = root.getAttribute("data-login-href") || "/login";
  const slug = root.getAttribute("data-slug") || "";
  const likesOnly = root.hasAttribute("data-likes-only");
  const joinOnly = root.hasAttribute("data-join-only");
  const compact = root.classList.contains("nb-community--topbar");

  const membership = await request<MembershipState>(apiBase + "/membership");
  if (!membership.ok || !membership.body) return;
  const state = membership.body;

  // The join button is shown to everyone, including signed-out visitors:
  // clicking it while not a member redirects to login (see handler below).
  let joinBtn: HTMLButtonElement | null = null;
  if (!likesOnly) {
    joinBtn = document.createElement("button");
    joinBtn.type = "button";
    joinBtn.className = "site-button";
  }

  let likeBtn: HTMLButtonElement | null = null;
  let likes: LikeState = { count: 0, likedByMe: false };
  if (slug && !joinOnly) {
    const likesRes = await request<LikeState>(
      apiBase + "/posts/" + encodeURIComponent(slug) + "/likes",
    );
    if (likesRes.ok && likesRes.body) likes = likesRes.body;
    likeBtn = document.createElement("button");
    likeBtn.type = "button";
    likeBtn.className = "nb-like";
  }

  function render(): void {
    if (joinBtn) {
      joinBtn.textContent = state.joined
        ? "Joined ✓"
        : compact
          ? "Join"
          : "Join this space";
      joinBtn.classList.toggle("joined", !!state.joined);
      joinBtn.title = state.joined ? "Click to leave this space" : "";
    }
    if (likeBtn) {
      likeBtn.innerHTML =
        '<span class="nb-like-heart">' +
        (likes.likedByMe ? "♥" : "♡") +
        "</span><span>" +
        likes.count +
        "</span>";
      likeBtn.classList.toggle("liked", !!likes.likedByMe);
      likeBtn.title = likes.likedByMe ? "Unlike" : "Like this post";
    }
  }

  if (joinBtn) {
    joinBtn.addEventListener("click", async () => {
      if (!state.member) {
        location.href = loginUrl(loginHref);
        return;
      }
      const res = await request<{ joined: boolean }>(
        apiBase + (state.joined ? "/leave" : "/join"),
        "POST",
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
    likeBtn.addEventListener("click", async () => {
      if (!state.member) {
        location.href = loginUrl(loginHref);
        return;
      }
      const action = likes.likedByMe ? "/unlike" : "/like";
      const url = apiBase + "/posts/" + encodeURIComponent(slug) + action;
      let res = await request<LikeState & { error?: string }>(url, "POST");
      if (res.status === 401) {
        location.href = loginUrl(loginHref);
        return;
      }
      // Liking requires membership; join transparently and retry once.
      if (res.status === 403 && res.body && res.body.error === "not_member") {
        const joined = await request(apiBase + "/join", "POST");
        if (!joined.ok) return;
        state.joined = true;
        state.memberCount += 1;
        res = await request<LikeState>(url, "POST");
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

function start(): void {
  document
    .querySelectorAll<HTMLElement>("[data-community]")
    .forEach((el) => {
      if (el.hasAttribute("data-nb-init")) return;
      el.setAttribute("data-nb-init", "1");
      init(el).catch((err) => {
        console.warn("community widget failed:", err);
      });
    });
}

onReady(start);
