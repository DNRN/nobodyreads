<script lang="ts">
  import { onMount } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { sql, SQLite } from "@codemirror/lang-sql";
  import { javascript } from "@codemirror/lang-javascript";
  import { replaceTextarea, type EditorInstance } from "nobodyreads/editor";
  import type { ContentView, CustomViewConfig, PostListViewConfig } from "nobodyreads";

  interface Props {
    view?: ContentView;
    viewsBase?: string;
  }

  let { view, viewsBase = "/admin/views" }: Props = $props();

  const isNew = !view;
  const v = view ?? ({
    id: "",
    slug: "",
    title: "",
    kind: "post_list",
    config: { order: "newest" },
    published: false,
  } as ContentView);

  const startsCustom = v.kind === "custom";
  const customConfig = (startsCustom ? v.config : { query: "", template: "" }) as CustomViewConfig;
  const postListConfig = (startsCustom ? { order: "newest" } : v.config) as PostListViewConfig;

  const defaultQuery = `SELECT slug, title, excerpt, date
FROM page
WHERE published = 1
  AND kind = 'post'
  AND tenant_id = :tenant_id
ORDER BY date DESC
LIMIT 5`;

  const defaultTemplate = `// rows: array of objects from your SQL query
// urlPrefix: URL prefix for building links (e.g. "" or "/dennis")
// escapeHtml: utility to escape HTML entities

return rows.map(row => \`
  <article class="post-preview">
    <time class="post-date">\${row.date}</time>
    <h2 class="post-title">
      <a href="\${urlPrefix}/posts/\${row.slug}">\${escapeHtml(String(row.title))}</a>
    </h2>
    <p class="post-excerpt">\${escapeHtml(String(row.excerpt || ''))}</p>
  </article>
\`).join('\\n');`;

  // --- Form state ---
  let title = $state(v.title);
  let slug = $state(v.slug);
  let kind = $state<"post_list" | "custom">(v.kind === "custom" ? "custom" : "post_list");
  let limit = $state(typeof postListConfig.limit === "number" ? String(postListConfig.limit) : "");
  let published = $state(v.published);
  let query = $state(customConfig.query || defaultQuery);
  let template = $state(customConfig.template || defaultTemplate);

  const isCustom = $derived(kind === "custom");
  const embedToken = $derived(`{{view:${slug || "your-view-slug"}}}`);

  let queryEl: HTMLTextAreaElement;
  let templateEl: HTMLTextAreaElement;
  let queryEditor: EditorInstance | null = null;
  let templateEditor: EditorInstance | null = null;

  // CodeMirror is created lazily the first time the custom panes are shown — a
  // post-list view never pays for the SQL/JS editors.
  function ensureEditors() {
    if (queryEditor || !queryEl) return;
    queryEditor = replaceTextarea(queryEl, [
      sql({ dialect: SQLite }),
      EditorView.updateListener.of((u) => { if (u.docChanged) query = queryEditor!.getValue(); }),
    ]);
    templateEditor = replaceTextarea(templateEl, [
      javascript(),
      EditorView.updateListener.of((u) => { if (u.docChanged) template = templateEditor!.getValue(); }),
    ]);
  }

  $effect(() => {
    if (isCustom) ensureEditors();
  });

  onMount(() => {
    return () => {
      queryEditor?.destroy();
      templateEditor?.destroy();
    };
  });
</script>

<main class="editor-main">
  <form method="POST" action={`${viewsBase}/save`} class="editor-form view-editor-form">
    <input type="hidden" name="id" value={v.id} />

    <aside class="editor-sidebar">
      <div class="editor-list-header">
        <h2>{isNew ? "New View" : `Edit: ${v.title}`}</h2>
      </div>

      <div class="field">
        <label for="title">Title</label>
        <input type="text" id="title" name="title" bind:value={title} required />
      </div>

      <div class="field">
        <label for="slug">Slug</label>
        <input
          type="text"
          id="slug"
          name="slug"
          bind:value={slug}
          required
          pattern="[a-z0-9-]+"
          title="Lowercase letters, numbers, and hyphens only"
        />
      </div>

      <div class="field">
        <label for="kind">Kind</label>
        <select id="kind" name="kind" bind:value={kind}>
          <option value="post_list">Post list</option>
          <option value="custom">Custom query</option>
        </select>
        {#if isCustom}
          <div class="hint">Write a SQL SELECT query and a template to render the results.</div>
        {:else}
          <div class="hint">Shows posts sorted by newest, with optional limit.</div>
        {/if}
      </div>

      {#if !isCustom}
        <div class="field">
          <label for="limit">Limit <span class="hint">(optional)</span></label>
          <input type="number" id="limit" name="limit" min="1" max="200" bind:value={limit} />
        </div>
      {/if}

      <div class="field field-row">
        <label for="published">
          <input type="checkbox" id="published" name="published" bind:checked={published} />
          Published
        </label>
      </div>

      <div class="field">
        <label for="embed_token">Embed token</label>
        <input type="text" id="embed_token" value={embedToken} readonly />
        <div class="hint">Use this token in any page markdown. You can add more than one per page.</div>
      </div>

      <div class="editor-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        {#if !isNew}
          <button
            type="submit"
            formaction={`${viewsBase}/delete/${v.id}`}
            class="btn btn-danger"
            onclick={(e) => { if (!confirm("Delete this view permanently?")) e.preventDefault(); }}
          >Delete</button>
        {/if}
      </div>
    </aside>

    <!-- Custom query fields (kept mounted so the editors persist; hidden for post-list) -->
    <div class="editor-content" class:hidden={!isCustom}>
      <div class="field">
        <label for="query">SQL Query</label>
        <textarea
          bind:this={queryEl}
          id="query"
          name="query"
          class="code-editor"
          rows="10"
          spellcheck="false"
          bind:value={query}
        ></textarea>
        <div class="hint">
          Write a <code>SELECT</code> query. Use <code>:tenant_id</code> as a parameter for tenant scoping.
          Only <code>SELECT</code> statements are allowed.
        </div>
      </div>

      <div class="field">
        <label for="template">Template <span class="hint">(JavaScript function body)</span></label>
        <textarea
          bind:this={templateEl}
          id="template"
          name="template"
          class="code-editor"
          rows="16"
          spellcheck="false"
          bind:value={template}
        ></textarea>
        <div class="hint">
          Function signature: <code>(rows, urlPrefix, escapeHtml) =&gt; string</code><br />
          <code>rows</code> is an array of objects with columns from your query.
          Return an HTML string.
        </div>
      </div>
    </div>
  </form>
</main>
