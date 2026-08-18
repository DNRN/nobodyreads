<script lang="ts">
  import { onMount } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { sql, SQLite } from "@codemirror/lang-sql";
  import { html } from "@codemirror/lang-html";
  import { replaceTextarea, type EditorInstance } from "nobodyreads/editor";
  import {
    DEFAULT_COLLECTION_TEMPLATE,
    validateCollectionTemplate,
  } from "nobodyreads/collection-template";
  import { embedToken } from "nobodyreads/embed-token";
  import { slugify } from "nobodyreads/slugify";
  import { COLLECTION_PRESETS } from "nobodyreads/collection-presets";
  import type { ContentView, CustomViewConfig, PostListViewConfig } from "nobodyreads";

  interface Props {
    view?: ContentView;
    collectionsBase?: string;
    adminBase?: string;
    /** Whether the host has an AI provider configured. */
    aiEnabled?: boolean;
  }

  let {
    view,
    collectionsBase = "/admin/collections",
    adminBase = "/admin",
    aiEnabled = false,
  }: Props = $props();

  const isNew = !view;
  const v = view ?? ({
    id: "",
    slug: "",
    title: "",
    // A new collection starts as a custom one: the presets write a real query
    // and template, so there is something to preview immediately.
    kind: "custom",
    config: { query: "", template: "" },
    published: false,
  } as ContentView);

  const startsCustom = v.kind === "custom";
  const customConfig = (startsCustom ? v.config : { query: "", template: "" }) as CustomViewConfig;
  const postListConfig = (startsCustom ? { order: "newest" } : v.config) as PostListViewConfig;

  // --- State ---------------------------------------------------------------
  let title = $state(v.title);
  let slug = $state(v.slug);
  let kind = $state<"post_list" | "custom">(startsCustom ? "custom" : "post_list");
  let limit = $state(typeof postListConfig.limit === "number" ? String(postListConfig.limit) : "");
  let published = $state(v.published);
  let query = $state(customConfig.query || COLLECTION_PRESETS[0]!.query);
  let template = $state(customConfig.template || DEFAULT_COLLECTION_TEMPLATE);
  let prompt = $state("");
  let slugTouched = !isNew;

  let saving = $state(false);
  let advancedOpen = $state(!isNew && startsCustom);
  let previewHtml = $state("");
  let previewError = $state("");
  let previewing = $state(false);
  let rowCount = $state<number | null>(null);
  let dirty = $state(false);

  const isCustom = $derived(kind === "custom");
  const token = $derived(embedToken(slug || "your-collection"));

  const status = $derived(
    saving
      ? { tone: "", text: "Saving…" }
      : dirty
        ? { tone: "is-unsaved", text: "Unsaved" }
        : published
          ? { tone: "is-live", text: "Live" }
          : { tone: "is-saved", text: "Draft" },
  );

  function touched() {
    dirty = true;
  }

  function onTitleInput() {
    if (slugTouched) return;
    slug = slugify(title);
  }

  /** Picking a preset fills every field it owns — including the prompt box. */
  function applyPreset(id: string) {
    const preset = COLLECTION_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    kind = "custom";
    query = preset.query;
    template = preset.template;
    prompt = preset.prompt;
    queryEditor?.setValue(preset.query);
    templateEditor?.setValue(preset.template);
    if (!title.trim()) {
      title = preset.label;
      onTitleInput();
    }
    touched();
    void refreshPreview();
  }

  /**
   * Render the current query and template without saving.
   *
   * The server runs the same checks a save does, so the preview can never show
   * something the saved collection would not.
   */
  async function refreshPreview() {
    if (previewing) return;
    previewing = true;
    previewError = "";
    try {
      const res = await fetch(`${collectionsBase}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(
          isCustom
            ? { kind: "custom", query, template }
            : { kind: "post_list", limit: limit ? Number(limit) : undefined },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        previewError = data.error ?? `Preview failed (${res.status})`;
        previewHtml = "";
        rowCount = null;
        return;
      }
      previewHtml = data.html ?? "";
      rowCount = data.rowCount ?? null;
    } catch (err) {
      previewError = err instanceof Error ? err.message : "Preview failed";
    } finally {
      previewing = false;
    }
  }

  /** Turn a built-in post list into an editable query, keeping what it showed. */
  function convertToCustom() {
    const preset = COLLECTION_PRESETS[0]!;
    kind = "custom";
    query = limit
      ? preset.query.replace(/LIMIT \d+/, `LIMIT ${Number(limit)}`)
      : preset.query;
    template = DEFAULT_COLLECTION_TEMPLATE;
    advancedOpen = true;
    touched();
    queueMicrotask(() => {
      queryEditor?.setValue(query);
      templateEditor?.setValue(template);
      void refreshPreview();
    });
  }

  const templateError = $derived(isCustom ? validateCollectionTemplate(template) : null);

  // --- Build it ------------------------------------------------------------
  let building = $state(false);
  let buildError = $state("");

  /**
   * Ask the AI for a query and a template from the description.
   *
   * What comes back has already been through the same validators a save runs,
   * so it lands in the editor as ordinary unsaved work — the author reviews it
   * in the preview and in the Advanced panel like anything else.
   */
  async function buildIt() {
    const description = prompt.trim();
    if (!description || building) return;
    building = true;
    buildError = "";
    try {
      const res = await fetch(`${adminBase}/ai/collection`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.collection) {
        buildError = data.error ?? `Could not build that (${res.status})`;
        return;
      }

      kind = "custom";
      query = data.collection.query;
      template = data.collection.template;
      if (!title.trim() && data.collection.name) {
        title = data.collection.name;
        onTitleInput();
      }
      advancedOpen = true;
      touched();
      queueMicrotask(() => {
        queryEditor?.setValue(query);
        templateEditor?.setValue(template);
        void refreshPreview();
      });
    } catch (err) {
      buildError = err instanceof Error ? err.message : "Could not build that";
    } finally {
      building = false;
    }
  }

  // --- CodeMirror ----------------------------------------------------------
  let queryEl: HTMLTextAreaElement;
  let templateEl: HTMLTextAreaElement;
  let queryEditor: (EditorInstance & { setValue(v: string): void }) | null = null;
  let templateEditor: (EditorInstance & { setValue(v: string): void }) | null = null;

  function withSetValue(editor: EditorInstance | null) {
    if (!editor) return null;
    return Object.assign(editor, {
      setValue(value: string) {
        editor.view.dispatch({
          changes: { from: 0, to: editor.view.state.doc.length, insert: value },
        });
      },
    });
  }

  // Built lazily the first time the Advanced panel is opened — a collection
  // nobody opens the code for never pays for two CodeMirror instances.
  function ensureEditors() {
    if (queryEditor || !queryEl) return;
    queryEditor = withSetValue(
      replaceTextarea(queryEl, [
        sql({ dialect: SQLite }),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          query = queryEditor!.getValue();
          touched();
        }),
      ]),
    );
    templateEditor = withSetValue(
      replaceTextarea(templateEl, [
        html(),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          template = templateEditor!.getValue();
          touched();
        }),
      ]),
    );
  }

  $effect(() => {
    if (advancedOpen && isCustom) ensureEditors();
  });

  async function save(publish: boolean) {
    if (saving) return;
    if (!title.trim() || !slug.trim()) return;
    saving = true;
    try {
      const body = new URLSearchParams();
      body.set("id", v.id);
      body.set("title", title);
      body.set("slug", slug);
      body.set("kind", kind);
      body.set("limit", limit);
      body.set("query", query);
      body.set("template", template);
      if (publish || published) body.set("published", "on");

      const res = await fetch(`${collectionsBase}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        previewError = data.details?.[0]?.message ?? data.error ?? `Save failed (${res.status})`;
        return;
      }
      if (publish) published = true;
      dirty = false;
      // A new collection has just been given an id server-side; land on its
      // own URL so a reload does not create a second one.
      if (isNew) window.location.assign(collectionsBase);
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    void refreshPreview();
    return () => {
      queryEditor?.destroy();
      templateEditor?.destroy();
    };
  });
</script>

<main class="nbr-collection-editor">
  <header class="nbr-topbar">
    <a class="nbr-topbar-back" href={collectionsBase} aria-label="Back to collections">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>
    </a>
    <span class="nbr-collection-crumb">Collections</span>
    <span class="nbr-collection-heading">{isNew ? "New collection" : v.title}</span>
    <span class={`nr-status ${status.tone}`} aria-live="polite">
      <i class="nr-status-dot"></i>{status.text}
    </span>
    <span class="nbr-topbar-spacer"></span>
    <button type="button" class="btn btn-sm" onclick={() => save(false)} disabled={saving}>Save draft</button>
    <button type="button" class="btn btn-primary btn-sm" onclick={() => save(true)} disabled={saving}>
      {published ? "Update" : "Publish"}
    </button>
  </header>

  <div class="nbr-collection-split">
    <div class="nbr-collection-controls">
      <div class="nbr-control">
        <label class="nbr-collection-ask" for="collection-prompt">What do you want to show?</label>
        <textarea
          id="collection-prompt"
          class="nbr-ai-prompt"
          rows="3"
          bind:value={prompt}
          placeholder="My posts tagged fishing, newest first — each as a card with the date, title and a short excerpt."
        ></textarea>
        <!--
          The box is a description, not a command line: until AI generation
          lands it records intent and the presets below do the building.
        -->
        {#if aiEnabled}
          <div class="nbr-build-row">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              onclick={buildIt}
              disabled={building || !prompt.trim()}
            >
              {building ? "Building…" : "Build it"}
            </button>
            <span class="hint">AI writes the query &amp; layout</span>
          </div>
          {#if buildError}
            <p class="nbr-nudge">{buildError}</p>
          {/if}
        {:else}
          <p class="hint">Describes the collection for you and whoever reads this later.</p>
        {/if}
      </div>

      <div class="nbr-control">
        <span class="nr-eyebrow">Or start from</span>
        <div class="nbr-preset-row">
          {#each COLLECTION_PRESETS as preset}
            <button type="button" class="nbr-starter" title={preset.description} onclick={() => applyPreset(preset.id)}>
              {preset.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="nbr-collection-fields">
        <div class="nbr-control">
          <label class="nr-eyebrow" for="collection-title">Name</label>
          <input id="collection-title" type="text" bind:value={title} oninput={() => { onTitleInput(); touched(); }} required />
        </div>

        <div class="nbr-control">
          <label class="nr-eyebrow" for="collection-slug">Slug <span class="nbr-control-value">auto</span></label>
          <input
            id="collection-slug"
            type="text"
            bind:value={slug}
            oninput={() => { slugTouched = true; touched(); }}
            pattern="[a-z0-9-]+"
            required
          />
        </div>
      </div>

      <div class="nbr-control">
        <span class="nr-eyebrow">Embed token</span>
        <button type="button" class="nbr-collection-token" data-copy={token} onclick={(e) => {
          navigator.clipboard?.writeText(token);
          const el = e.currentTarget as HTMLElement;
          const previous = el.textContent;
          el.textContent = "copied";
          setTimeout(() => (el.textContent = previous), 1200);
        }}>{token}</button>
        <p class="hint">Paste into any page's markdown to drop this collection in.</p>
      </div>

      {#if !isCustom}
        <div class="nbr-control">
          <label class="nr-eyebrow" for="collection-limit">How many posts</label>
          <input id="collection-limit" type="number" min="1" max="200" bind:value={limit} oninput={touched} onchange={refreshPreview} />
          <p class="hint">Built-in post list. Leave empty for all of them.</p>
          <button type="button" class="btn btn-sm" style="margin-top:10px" onclick={convertToCustom}>
            Switch to a custom query
          </button>
        </div>
      {/if}

      {#if !isNew}
        <div class="nbr-collection-danger">
          <form method="POST" action={`${collectionsBase}/delete/${v.id}`} style="margin:0">
            <button
              type="submit"
              class="btn btn-danger btn-sm"
              onclick={(e) => { if (!confirm("Delete this collection permanently?")) e.preventDefault(); }}
            >Delete collection</button>
          </form>
        </div>
      {/if}
    </div>

    <aside class="nbr-collection-preview">
      <div class="nbr-design-preview-head">
        <span class="nr-eyebrow">
          Live preview{rowCount !== null ? ` · ${rowCount} ${rowCount === 1 ? "row" : "rows"}` : ""}
        </span>
        <button type="button" class="btn btn-ghost btn-sm" onclick={refreshPreview} disabled={previewing}>
          {previewing ? "Rendering…" : "Regenerate"}
        </button>
      </div>

      <div class="nbr-collection-stage">
        {#if previewError}
          <p class="nbr-nudge">{previewError}</p>
        {:else if previewHtml}
          <!-- Server-rendered from the author's own query and template; it has
               already been through the same validation a save performs. -->
          {@html previewHtml}
        {:else}
          <p class="hint">Pick a starting point, or open the query below.</p>
        {/if}
      </div>

      {#if isCustom}
        <details class="nbr-advanced nbr-collection-advanced" bind:open={advancedOpen}>
          <summary>Advanced — query &amp; template</summary>

          <div class="nbr-control">
            <label class="nr-eyebrow" for="collection-query">SQL query</label>
            <textarea bind:this={queryEl} id="collection-query" class="code-editor" rows="10" spellcheck="false">{query}</textarea>
          </div>

          <div class="nbr-control">
            <label class="nr-eyebrow" for="collection-template">Template</label>
            <textarea bind:this={templateEl} id="collection-template" class="code-editor" rows="12" spellcheck="false">{template}</textarea>
            {#if templateError}
              <p class="nbr-nudge">{templateError}</p>
            {:else}
              <p class="hint">
                Your markup, plus <code>{"{{field}}"}</code>, <code>{"{{#each rows}}"}</code>,
                <code>{"{{#if field}}"}</code> and the helpers
                <code>{"{{postUrl slug}}"}</code>, <code>{"{{url path}}"}</code>,
                <code>{"{{date date}}"}</code>. Values are escaped for you.
              </p>
            {/if}
          </div>

          <div class="nbr-collection-safety">
            Read-only tables, tenant-scoped automatically. Queries may read
            <code>page_public</code>, <code>post_like</code>, <code>comment</code>,
            <code>content_view</code> and <code>media</code>, and must include
            <code>:tenant_id</code>. Edit by hand if you like — the preview stays in sync.
          </div>

          <button type="button" class="btn btn-sm" onclick={refreshPreview} disabled={previewing}>
            Run it
          </button>
        </details>
      {/if}
    </aside>
  </div>
</main>
