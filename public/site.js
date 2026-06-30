const root = document.documentElement;
const themeToggle = document.querySelector("[data-theme-toggle]");

function resolveTheme(theme) {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme === "dark" || theme === "light" ? theme : "light";
}

function applyTheme(theme) {
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // ignore write errors (private mode, etc.)
  }
  const resolved = resolveTheme(theme);
  root.dataset.theme = resolved;
  if (themeToggle) {
    const isDark = resolved === "dark";
    themeToggle.textContent = isDark ? "Light" : "Dark";
    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.setAttribute(
      "aria-label",
      isDark ? "Switch to light mode" : "Switch to dark mode"
    );
  }
}

function getInitialTheme() {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // ignore read errors
  }
  return "system";
}

applyTheme(root.dataset.theme || getInitialTheme());

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const stored = localStorage.getItem("theme") || "system";
    const resolved = resolveTheme(stored);
    const next = resolved === "dark" ? "light" : "dark";
    applyTheme(next);
  });
}

// Expose for Settings > Appearance (theme is changed there, not in header)
window.applyTheme = applyTheme;
window.getStoredTheme = function () {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" || t === "system" ? t : "system";
  } catch {
    return "system";
  }
};

// Account/nav menu toggle. Bound to `document` via delegation (not to the
// header elements directly) so it keeps working after Astro's ClientRouter
// swaps the page — those swaps replace the header DOM and drop any listeners
// attached straight to it.
function closeNavMenu() {
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
