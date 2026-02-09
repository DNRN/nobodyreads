import type { Page } from "../content/types.js";
import type { SiteBundle } from "../shared/site-bundle.js";
import { DEFAULT_SITE_TEMPLATE } from "../shared/site-template.js";
import { escapeHtml } from "../shared/http.js";

const IS_DEV = process.env.NODE_ENV !== "production";

const devReload = IS_DEV
  ? `<script>new EventSource("/__reload").onmessage = e => { if (e.data === "reload") location.reload(); };</script>`
  : "";

// --- Shared editor layout shell ---

function editorShell(
  title: string,
  content: string,
  opts?: { scripts?: string; editorBase?: string; siteBase?: string }
): string {
  const editorBase = opts?.editorBase ?? "/admin/editor";
  const siteBase = opts?.siteBase ?? "/";
  const logoutBase = editorBase.replace(/\/editor$/, "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <script>
    (function () {
      try {
        const stored = localStorage.getItem("theme");
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const theme = (stored === "system" || !stored) ? (prefersDark ? "dark" : "light") : (stored === "dark" || stored === "light" ? stored : (prefersDark ? "dark" : "light"));
        document.documentElement.dataset.theme = theme;
      } catch {
        document.documentElement.dataset.theme = "light";
      }
    })();
  </script>
  <link rel="stylesheet" href="/style.css">
  ${devReload}
</head>
<body>
  <header class="editor-header">
    <div class="editor-header-inner">
      <a class="editor-logo" href="${escapeHtml(editorBase)}">Editor</a>
      <nav class="editor-nav">
        <a href="${escapeHtml(logoutBase)}">Admin</a>
        <form method="POST" action="${escapeHtml(logoutBase)}/logout" class="editor-nav-form">
          <button type="submit" class="btn btn-ghost">Sign out</button>
        </form>
        <a href="${escapeHtml(siteBase)}" target="_blank">View site</a>
      </nav>
    </div>
  </header>
  ${content}
  <script src="/site.js" defer></script>
  ${opts?.scripts ?? ""}
</body>
</html>`;
}

// --- Login page ---

export function editorLoginPage(error?: string, urlPrefix: string = ""): string {
  const editorBase = `${urlPrefix}/admin/editor`;
  const adminBase = `${urlPrefix}/admin`;
  const errorHtml = error
    ? `<ul class="form-errors"><li>${escapeHtml(error)}</li></ul>`
    : "";

  return editorShell("Login — Editor", `
  <main class="container">
    <div class="auth-form">
      <h2>Editor Login</h2>
      <p>Enter the editor password to continue.</p>
      ${errorHtml}
      <form method="POST" action="${escapeHtml(adminBase)}/login">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autofocus>
        <button type="submit">Sign in</button>
      </form>
    </div>
  </main>`, { editorBase, siteBase: urlPrefix || "/" });
}

// --- Admin overview page ---

export function adminOverviewPage(urlPrefix: string = ""): string {
  const editorBase = `${urlPrefix}/admin/editor`;
  return editorShell("Admin — Overview", `
  <main class="container">
    <div class="editor-list">
      <div class="editor-list-header">
        <h2>Admin</h2>
      </div>
      <div class="editor-list-section">
        <h3>Site</h3>
        <p><a class="btn btn-primary" href="${escapeHtml(`${urlPrefix}/admin/site`)}">Edit site</a></p>
      </div>
      <div class="editor-list-section">
        <h3>Content</h3>
        <p><a class="btn btn-primary" href="${escapeHtml(editorBase)}">Open editor</a></p>
      </div>
    </div>
  </main>`, { editorBase, siteBase: urlPrefix || "/" });
}

// --- Site editor (HTML/CSS/JS bundle) ---

export function siteEditorPage(bundle: SiteBundle | null, urlPrefix: string = ""): string {
  const adminBase = `${urlPrefix}/admin`;
  const editorBase = `${adminBase}/editor`;
  const htmlValue = bundle?.html?.trim() ? bundle.html : DEFAULT_SITE_TEMPLATE;
  const cssValue = bundle?.css ?? "";
  const jsValue = bundle?.js ?? "";

  return editorShell("Site — Admin", `
  <main class="editor-main editor-main--site">
    <form method="POST" action="${escapeHtml(adminBase)}/site/save" class="editor-form editor-form--site" id="site-editor-form">
      <div class="editor-list-header">
        <h2>Site</h2>
        <button type="submit" class="btn btn-primary">Save &amp; build</button>
      </div>

      <div class="editor-tabs editor-tabs--site" id="site-editor-tabs">
        <button type="button" class="editor-tab active" data-tab="html">HTML</button>
        <button type="button" class="editor-tab" data-tab="css">CSS</button>
        <button type="button" class="editor-tab" data-tab="js">JS</button>
        <button type="button" class="editor-tab" data-tab="preview">Preview</button>
      </div>

      <div class="site-editor">
        <div class="site-editor-pane site-editor-pane--html" data-pane="html">
          <label for="site-html">HTML template</label>
          <p class="hint">Tokens: <code>{{content}}</code>, <code>{{nav}}</code>, <code>{{siteTagline}}</code>, <code>{{homeHref}}</code>, <code>{{year}}</code>, <code>{{authLinksBlock}}</code>, <code>{{navToggle}}</code>.</p>
          <textarea id="site-html" name="html" rows="14" class="editor-textarea" spellcheck="false">${escapeHtml(htmlValue)}</textarea>
        </div>

        <div class="site-editor-pane site-editor-pane--css hidden" data-pane="css">
          <label for="site-css">CSS</label>
          <textarea id="site-css" name="css" rows="14" class="editor-textarea" spellcheck="false">${escapeHtml(cssValue)}</textarea>
        </div>

        <div class="site-editor-pane site-editor-pane--js hidden" data-pane="js">
          <label for="site-js">JavaScript (module)</label>
          <textarea id="site-js" name="js" rows="14" class="editor-textarea" spellcheck="false">${escapeHtml(jsValue)}</textarea>
        </div>

        <div class="site-editor-pane site-editor-pane--preview hidden" data-pane="preview">
          <div class="editor-preview-label">Preview</div>
          <iframe id="site-preview" title="Site preview"></iframe>
        </div>
      </div>
    </form>
  </main>`, {
    editorBase,
    siteBase: urlPrefix || "/",
    scripts: `<script src="/site-editor.js"></script>`,
  });
}

// --- Page listing dashboard ---

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function kindLabel(kind: string): string {
  if (kind === "home") return "Home";
  if (kind === "post") return "Post";
  return "Page";
}

function statusBadge(published: boolean): string {
  return published
    ? `<span class="badge badge-published">published</span>`
    : `<span class="badge badge-draft">draft</span>`;
}

export function editorListPage(pages: Page[], urlPrefix: string = ""): string {
  const editorBase = `${urlPrefix}/admin/editor`;

  // Group pages by kind
  const groups: Record<string, Page[]> = { home: [], page: [], post: [] };
  for (const page of pages) {
    const bucket = groups[page.kind] ?? [];
    bucket.push(page);
    groups[page.kind] = bucket;
  }

  const sections: string[] = [];
  for (const kind of ["home", "page", "post"] as const) {
    const items = groups[kind];
    if (items.length === 0) continue;
    const rows = items
      .map(
        (p) => `
        <tr>
          <td><a href="${escapeHtml(editorBase)}/${escapeHtml(p.id)}">${escapeHtml(p.title)}</a></td>
          <td class="cell-slug">/${escapeHtml(p.kind === "post" ? `posts/${p.slug}` : p.kind === "home" ? "" : p.slug)}</td>
          <td class="cell-status">${statusBadge(p.published)}</td>
          <td class="cell-date">${formatDate(p.date)}</td>
        </tr>`
      )
      .join("");

    sections.push(`
      <div class="editor-list-section">
        <h3>${kindLabel(kind)}s</h3>
        <table class="editor-table">
          <thead>
            <tr><th>Title</th><th>URL</th><th>Status</th><th>Date</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`);
  }

  const empty =
    pages.length === 0 ? `<p class="editor-empty">No pages yet. Create your first one!</p>` : "";

  return editorShell("Pages — Editor", `
  <main class="container">
    <div class="editor-list">
      <div class="editor-list-header">
        <h2>Pages</h2>
        <a href="${escapeHtml(editorBase)}/new" class="btn btn-primary">New page</a>
      </div>
      ${empty}
      ${sections.join("")}
    </div>
  </main>`, { editorBase, siteBase: urlPrefix || "/" });
}

// --- Editor form (new + edit) ---

export function editorPage(page?: Page, urlPrefix: string = ""): string {
  const editorBase = `${urlPrefix}/admin/editor`;
  const isNew = !page;
  const title = isNew ? "New Page" : `Edit: ${page.title}`;

  const p = page ?? {
    id: "",
    slug: "",
    title: "",
    content: "",
    excerpt: "",
    tags: [] as string[],
    date: new Date().toISOString().slice(0, 10),
    published: false,
    kind: "post" as const,
    nav: undefined,
  };

  const deleteBtn = !isNew
    ? `<form method="POST" action="${escapeHtml(editorBase)}/delete/${escapeHtml(p.id)}" class="editor-delete-form" onsubmit="return confirm('Delete this page permanently?')">
        <button type="submit" class="btn btn-danger">Delete</button>
       </form>`
    : "";

  return editorShell(
    `${title} — Editor`,
    `
  <main class="editor-main">
    <form method="POST" action="${escapeHtml(editorBase)}/save" class="editor-form" id="editor-form">
      <input type="hidden" name="id" value="${escapeHtml(p.id)}">
      <input type="hidden" name="content" id="content-field" value="">

      <!-- Split pane: editable content (textarea has no name; value synced to #content-field on submit) -->
      <div class="editor-split">
        <div class="editor-pane editor-pane-write">
          <div class="editor-toolbar" id="editor-toolbar">
            <button type="button" data-action="bold" title="Bold (Ctrl+B)"><b>B</b></button>
            <button type="button" data-action="italic" title="Italic (Ctrl+I)"><i>I</i></button>
            <button type="button" data-action="heading" title="Heading">H</button>
            <button type="button" data-action="link" title="Link">Link</button>
            <button type="button" data-action="code" title="Inline code">Code</button>
            <button type="button" data-action="codeblock" title="Code block">Block</button>
            <button type="button" data-action="ul" title="Bullet list">List</button>
            <button type="button" data-action="quote" title="Blockquote">Quote</button>
          </div>
          <textarea
            id="content"
            class="editor-textarea"
            placeholder="Write your markdown here..."
            spellcheck="true"
          >${escapeHtml(p.content)}</textarea>
        </div>
        <div class="editor-pane editor-pane-preview">
          <div class="editor-preview-label">Preview</div>
          <div id="preview" class="editor-preview post-body"></div>
        </div>
      </div>

      <!-- Sidebar: metadata (order: 1 so it still appears first visually) -->
      <aside class="editor-sidebar">
        <div class="field">
          <label for="title">Title</label>
          <input type="text" id="title" name="title" value="${escapeHtml(p.title)}" required>
        </div>

        <div class="field">
          <label for="slug">Slug</label>
          <input type="text" id="slug" name="slug" value="${escapeHtml(p.slug)}" required pattern="[a-z0-9-]+"
                 title="Lowercase letters, numbers, and hyphens only">
        </div>

        <div class="field">
          <label for="kind">Kind</label>
          <select id="kind" name="kind">
            <option value="post"${p.kind === "post" ? " selected" : ""}>Post</option>
            <option value="page"${p.kind === "page" ? " selected" : ""}>Page</option>
            <option value="home"${p.kind === "home" ? " selected" : ""}>Home</option>
          </select>
        </div>

        <div class="field">
          <label for="excerpt">Excerpt</label>
          <textarea id="excerpt" name="excerpt" rows="3">${escapeHtml(p.excerpt)}</textarea>
        </div>

        <div class="field">
          <label for="tags">Tags <span class="hint">(comma-separated)</span></label>
          <input type="text" id="tags" name="tags" value="${escapeHtml(p.tags.join(", "))}">
        </div>

        <div class="field">
          <label for="date">Date</label>
          <input type="date" id="date" name="date" value="${escapeHtml(p.date.slice(0, 10))}">
        </div>

        <div class="field field-row">
          <label for="published">
            <input type="checkbox" id="published" name="published" ${p.published ? "checked" : ""}>
            Published
          </label>
        </div>

        <details class="field">
          <summary>Navigation</summary>
          <div class="field">
            <label for="nav_label">Nav label</label>
            <input type="text" id="nav_label" name="nav_label" value="${escapeHtml(p.nav?.label ?? "")}">
          </div>
          <div class="field">
            <label for="nav_order">Nav order</label>
            <input type="number" id="nav_order" name="nav_order" value="${p.nav?.order ?? ""}">
          </div>
        </details>

        <div class="editor-actions">
          <button type="submit" class="btn btn-primary">Save</button>
          ${deleteBtn}
        </div>
      </aside>

      <!-- Mobile: tab switcher -->
      <div class="editor-tabs" id="editor-tabs">
        <button type="button" class="editor-tab active" data-tab="write">Write</button>
        <button type="button" class="editor-tab" data-tab="preview">Preview</button>
      </div>
    </form>
  </main>`,
    {
      editorBase,
      siteBase: urlPrefix || "/",
      scripts: `
  <script src="https://cdn.jsdelivr.net/npm/marked@15/marked.min.js"></script>
  <script src="/editor.js"></script>`,
    }
  );
}
