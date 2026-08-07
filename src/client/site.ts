// Site chrome: theme application + the account/nav menu toggle. Loaded on
// every page (public site and admin). No widgets, no framework.

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

declare global {
  interface Window {
    applyTheme: (theme: Theme) => void;
    getStoredTheme: () => Theme;
  }
}

const root = document.documentElement;
const themeToggle = document.querySelector<HTMLElement>("[data-theme-toggle]");

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // ignore write errors (private mode, etc.)
  }
  const resolved = resolveTheme(theme);
  root.dataset.theme = resolved;
  if (themeToggle) {
    const isDark = resolved === "dark";
    // Icon toggles (e.g. the admin header, with moon/sun SVGs) manage their
    // own visuals via CSS keyed on [data-theme]; only rewrite the label for
    // plain text toggles so we don't clobber inline markup.
    if (!themeToggle.querySelector("svg")) {
      themeToggle.textContent = isDark ? "Light" : "Dark";
    }
    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.setAttribute(
      "aria-label",
      isDark ? "Switch to light mode" : "Switch to dark mode",
    );
  }
}

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // ignore read errors
  }
  return "system";
}

applyTheme((root.dataset.theme as Theme) || getStoredTheme());

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const resolved = resolveTheme(getStoredTheme());
    applyTheme(resolved === "dark" ? "light" : "dark");
  });
}

// Expose for Settings > Appearance (theme is changed there, not in header).
window.applyTheme = applyTheme;
window.getStoredTheme = getStoredTheme;

// Account/nav menu toggle. Bound to `document` via delegation (not to the
// header elements directly) so it keeps working after Astro's ClientRouter
// swaps the page — those swaps replace the header DOM and drop any listeners
// attached straight to it.
function closeNavMenu(): void {
  document.body.classList.remove("nav-open");
  const toggle = document.querySelector("[data-nav-toggle]");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const toggle = target.closest("[data-nav-toggle]");
  if (toggle) {
    const isOpen = document.body.classList.toggle("nav-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    return;
  }

  if (!document.body.classList.contains("nav-open")) return;

  // A link inside the menu closes it (the navigation itself still proceeds);
  // any click outside the menu closes it too.
  if (target.closest("[data-nav] a") || !target.closest("[data-nav]")) {
    closeNavMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeNavMenu();
});

// Reset the menu state when a client-side navigation completes.
document.addEventListener("astro:after-swap", closeNavMenu);

// Post listing: tag filter + load more.
//
// Every post the view queried is already in the DOM — the server hides the
// overflow with the `hidden` attribute and this reveals it a page at a time.
// A fetch-per-page would need an endpoint, a loading state and a way to keep
// the filter in step with posts it has never seen, all to page a list the
// query already capped.
const POST_PAGE_SIZE = 12;

function postListState(list: HTMLElement): { tag: string; shown: number } {
  return {
    tag: list.dataset.filterTag ?? "",
    shown: Number(list.dataset.shown ?? POST_PAGE_SIZE),
  };
}

function applyPostList(list: HTMLElement): void {
  const { tag, shown } = postListState(list);
  const items = [...list.querySelectorAll<HTMLElement>("[data-post-item]")];

  let matched = 0;
  for (const item of items) {
    const tags = item.dataset.tags ?? "";
    const inFilter = tag === "" || tags.includes(`|${tag}|`);
    if (inFilter) matched += 1;
    item.hidden = !inFilter || matched > shown;
  }

  const more = list.querySelector<HTMLElement>("[data-post-more]");
  if (more) {
    const visible = Math.min(matched, shown);
    more.hidden = matched <= shown;
    const shownEl = more.querySelector("[data-post-shown]");
    const totalEl = more.querySelector("[data-post-total]");
    if (shownEl) shownEl.textContent = String(visible);
    if (totalEl) totalEl.textContent = String(matched);
  }
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const chip = target.closest<HTMLElement>("[data-filter-tag]");
  const more = target.closest<HTMLElement>("[data-post-more-button]");
  if (!chip && !more) return;

  const list = (chip ?? more)?.closest<HTMLElement>("[data-post-list]");
  if (!list) return;

  if (chip) {
    list.dataset.filterTag = chip.dataset.filterTag ?? "";
    // A new filter starts a new list, not page four of the old one.
    list.dataset.shown = String(POST_PAGE_SIZE);
    for (const other of list.querySelectorAll("[data-filter-tag]")) {
      other.classList.toggle("post-chip--active", other === chip);
    }
  } else {
    list.dataset.shown = String(postListState(list).shown + POST_PAGE_SIZE);
  }

  applyPostList(list);
});

// Marks this file as a module so the `declare global` augmentation above is
// valid. The bundle is still emitted as a side-effecting IIFE.
export {};
