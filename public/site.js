const root = document.documentElement;
const themeToggle = document.querySelector("[data-theme-toggle]");
const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");

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

if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.matches("a")) {
      document.body.classList.remove("nav-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("click", (event) => {
    if (!document.body.classList.contains("nav-open")) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (nav.contains(target) || navToggle.contains(target)) return;
    document.body.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
  });
}
