<script lang="ts">
  import { onMount, tick } from "svelte";
  import { fade } from "svelte/transition";
  import { Crepe } from "@milkdown/crepe";
  import { upload, uploadConfig } from "@milkdown/kit/plugin/upload";
  import { nobodyreadsMilkdownPlugins } from "nobodyreads/editor/milkdown";
  import "@milkdown/crepe/theme/common/style.css";
  import "@milkdown/crepe/theme/frame.css";
  import type { Page, PageKind } from "nobodyreads";

  interface Props {
    page?: Page;
    editorBase?: string;
    adminBase?: string;
    kind?: PageKind;
  }

  let {
    page,
    editorBase = "/admin/editor",
    adminBase = "/admin",
    kind: kindProp,
  }: Props = $props();

  const isNew = !page;
  const kind: PageKind = page?.kind ?? kindProp ?? "post";
  const kindLabel = kind === "home" ? "Home" : kind === "page" ? "Page" : "Post";

  const uploadUrl = `${adminBase}/media/upload`;
  const saveUrl = `${editorBase}/save`;

  const p: Page = page ?? ({
    id: "",
    slug: kind === "home" ? "home" : "",
    title: "",
    content: "",
    excerpt: "",
    tags: [],
    date: new Date().toISOString().slice(0, 10),
    published: false,
    kind,
    nav: undefined,
  } as Page);

  // --- Form state ---
  let currentId = $state(p.id);
  let title = $state(p.title);
  let slug = $state(p.slug);
  let excerpt = $state(p.excerpt ?? "");
  let tags = $state((p.tags ?? []).join(", "));
  let date = $state((p.date ?? "").slice(0, 10));
  let published = $state(p.published);
  let navLabel = $state(p.nav?.label ?? "");
  let navOrder = $state(p.nav?.order != null ? String(p.nav.order) : "");
  let content = $state(p.content ?? "");
  let slugManuallyEdited = false;

  let editorReady = $state(false);
  let sourceMode = $state(false);

  let formEl: HTMLFormElement;
  let crepeMount: HTMLElement;
  let crepe: Crepe | null = null;

  function onTitleInput() {
    if (isNew && kind !== "home" && !slugManuallyEdited) {
      slug = title
        .toLowerCase().trim()
        .replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-").replace(/^-|-$/g, "");
    }
  }

  // --- Save / autosave / toast ---------------------------------------------
  let saving = false;
  let baselineInitialized = false;
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let toast = $state<{ message: string; type: "info" | "success" | "error" } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string, type: "info" | "success" | "error" = "info", duration = 2500) {
    toast = { message, type };
    if (toastTimer) clearTimeout(toastTimer);
    if (duration > 0) toastTimer = setTimeout(() => (toast = null), duration);
  }

  // Snapshot used to tell whether anything changed since the last save, so
  // autosave only fires on real edits (not on load-time Markdown normalization).
  function snapshot() {
    return JSON.stringify({ content, title, slug, excerpt, tags, date, navLabel, navOrder, published });
  }
  let baseline = snapshot();

  function isValid() {
    return title.trim().length > 0 && (kind === "home" || slug.trim().length > 0);
  }

  function buildBody(): URLSearchParams {
    const body = new URLSearchParams();
    body.set("id", currentId ?? "");
    body.set("kind", kind);
    body.set("title", title);
    body.set("slug", kind === "home" ? slug || "home" : slug);
    body.set("excerpt", excerpt);
    body.set("tags", tags);
    body.set("date", date);
    if (published) body.set("published", "on");
    body.set("nav_label", navLabel);
    body.set("nav_order", navOrder);
    body.set("content", content);
    return body;
  }

  async function save(opts: { silent?: boolean; label?: string } = {}) {
    const { silent = false, label } = opts;
    if (saving) return;
    if (!isValid()) {
      if (!silent) showToast("Add a title and slug before saving", "error");
      return;
    }
    saving = true;
    if (!silent) showToast("Saving…", "info", 0);
    try {
      const res = await fetch(saveUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body: buildBody(),
      });
      if (res.redirected && res.url.includes("/admin/login")) {
        window.location.assign(res.url);
        return;
      }
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      // A freshly-created page: adopt its id so later saves update it, and
      // reflect the canonical URL without a reload.
      if (data.id && !currentId) {
        currentId = data.id;
        history.replaceState(null, "", `${editorBase}/${data.id}`);
      }
      baseline = snapshot();
      showToast(label ?? (silent ? "Draft saved" : "Saved"), "success");
    } catch {
      showToast("Save failed", "error", 4000);
    } finally {
      saving = false;
    }
  }

  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      if (saving || snapshot() === baseline || !isValid()) return;
      save({ silent: true });
    }, 2500);
  }

  // Any edit to content or metadata (re)arms the autosave timer. The baseline
  // check inside keeps load-time and no-op changes from saving.
  $effect(() => {
    void [title, slug, excerpt, tags, date, navLabel, navOrder, content, published];
    if (editorReady) scheduleAutosave();
  });

  function togglePublish() {
    published = !published;
    save({ label: published ? "Published" : "Unpublished" });
  }

  // Save button submits the form; intercept for AJAX. Delete keeps its normal
  // POST navigation. Without JS, the form posts and the server redirects.
  function onFormSubmit(e: SubmitEvent) {
    const submitter = e.submitter as HTMLElement | null;
    if (submitter?.getAttribute("formaction")?.includes("/delete/")) return;
    e.preventDefault();
    save();
  }

  async function uploadImage(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      body: fd,
    });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.url as string;
  }

  async function createCrepe(initial: string) {
    crepe = new Crepe({
      root: crepeMount,
      defaultValue: initial,
      features: {
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.AI]: false,
        // ImageBlock rewrites the image alt slot (for its aspect ratio), which
        // destroys our `![alt|400px|right]` size/align hints. Use plain
        // commonmark images so the alt text round-trips verbatim.
        [Crepe.Feature.ImageBlock]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: { text: "Write your post… type / for commands" },
      },
    });
    crepe.editor
      .config((ctx) => {
        ctx.update(uploadConfig.key, (prev) => ({
          ...prev,
          uploader: async (files: FileList, schema: any) => {
            const image = schema.nodes.image;
            if (!image) return [];
            const nodes: any[] = [];
            for (const file of Array.from(files)) {
              if (!file.type.startsWith("image/")) continue;
              const url = await uploadImage(file);
              nodes.push(image.create({ src: url, alt: file.name.replace(/\.[^.]+$/, "") }));
            }
            return nodes;
          },
        }));
      })
      .use(upload)
      .use(nobodyreadsMilkdownPlugins);
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        content = markdown;
      });
    });
    await crepe.create();
    // Sync state to the editor's normalized output and treat that as the
    // clean baseline (only on first load, so a Source-toggle keeps dirtiness).
    content = crepe.getMarkdown();
    if (!baselineInitialized) {
      baseline = snapshot();
      baselineInitialized = true;
    }
    editorReady = true;
  }

  async function toggleSource() {
    if (!sourceMode) {
      if (crepe) {
        content = crepe.getMarkdown();
        await crepe.destroy();
        crepe = null;
      }
      sourceMode = true;
    } else {
      sourceMode = false;
      await tick();
      await createCrepe(content);
    }
  }

  onMount(() => {
    createCrepe(content);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (autosaveTimer) clearTimeout(autosaveTimer);
      if (toastTimer) clearTimeout(toastTimer);
      crepe?.destroy();
    };
  });
</script>

<main class="editor-main">
  <form method="POST" action={saveUrl} class="editor-form" bind:this={formEl} onsubmit={onFormSubmit}>
    <input type="hidden" name="id" value={currentId} />
    <input type="hidden" name="kind" value={kind} />
    {#if published}
      <input type="hidden" name="published" value="on" />
    {/if}

    <div class="editor-split">
      <div class="editor-pane editor-pane-write">
        <div class="editor-toolbar editor-toolbar--wysiwyg">
          <span class="editor-mode-label">{sourceMode ? "Markdown source" : "Visual editor"}</span>
          <button type="button" class="btn btn-sm btn-ghost" onclick={toggleSource}>
            {sourceMode ? "Visual" : "Source"}
          </button>
        </div>

        <div bind:this={crepeMount} class="nbr-milkdown" class:hidden={sourceMode}></div>

        <!-- Markdown source view + no-JS fallback; carries the form value. -->
        <textarea
          name="content"
          class="editor-textarea"
          class:hidden={editorReady && !sourceMode}
          placeholder="Write your markdown here..."
          spellcheck="true"
          bind:value={content}
        ></textarea>
      </div>
    </div>

    <aside class="editor-sidebar">
      <div class="field">
        <label for="title">Title</label>
        <input type="text" id="title" name="title" bind:value={title} oninput={onTitleInput} required />
      </div>

      {#if kind === "home"}
        <input type="hidden" name="slug" value={slug || "home"} />
      {:else}
        <div class="field">
          <label for="slug">Slug</label>
          <input
            type="text"
            id="slug"
            name="slug"
            bind:value={slug}
            oninput={() => (slugManuallyEdited = true)}
            required
            pattern="[a-z0-9-]+"
            title="Lowercase letters, numbers, and hyphens only"
          />
        </div>
      {/if}

      <div class="field">
        <label>Kind</label>
        <p class="editor-kind-display">{kindLabel}</p>
      </div>

      <div class="field">
        <label for="excerpt">Excerpt</label>
        <textarea id="excerpt" name="excerpt" rows="3" bind:value={excerpt}></textarea>
      </div>

      <div class="field">
        <label for="tags">Tags <span class="hint">(comma-separated)</span></label>
        <input type="text" id="tags" name="tags" bind:value={tags} />
      </div>

      <div class="field">
        <label for="date">Date</label>
        <input type="date" id="date" name="date" bind:value={date} />
      </div>

      <div class="field">
        <label>Status</label>
        <div class="publish-control">
          <span class={`badge ${published ? "badge-published" : "badge-draft"}`}>
            {published ? "Published" : "Draft"}
          </span>
          <button type="button" class="btn btn-sm" onclick={togglePublish}>
            {published ? "Unpublish" : "Publish"}
          </button>
        </div>
        <p class="hint">
          {published ? "Live and visible to readers." : "Saved as a draft. Not visible to readers."}
        </p>
      </div>

      <details class="field">
        <summary>Navigation</summary>
        <div class="field">
          <label for="nav_label">Nav label</label>
          <input type="text" id="nav_label" name="nav_label" bind:value={navLabel} />
        </div>
        <div class="field">
          <label for="nav_order">Nav order</label>
          <input type="number" id="nav_order" name="nav_order" bind:value={navOrder} />
        </div>
      </details>

      <details class="field">
        <summary>Markdown reference</summary>
        <div class="editor-help">
          <p class="editor-help-note">
            Type <code>/</code> for the command menu, or write Markdown directly. Special tokens:
          </p>
          <table class="editor-help-table">
            <tbody>
              <tr><td><code>[[page-id]]</code></td><td>Internal link (by page ID)</td></tr>
              <tr><td><code>[[page-id|text]]</code></td><td>Internal link with custom text</td></tr>
              <tr><td><code>{"{{view:slug}}"}</code></td><td>Embed a content view</td></tr>
            </tbody>
          </table>
        </div>
      </details>

      <div class="editor-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        {#if !isNew}
          <button
            type="submit"
            formaction={`${editorBase}/delete/${currentId}`}
            class="btn btn-danger"
            onclick={(e) => { if (!confirm("Delete this page permanently?")) e.preventDefault(); }}
          >Delete</button>
        {/if}
      </div>
    </aside>
  </form>

  {#if toast}
    <div class={`nbr-toast nbr-toast--${toast.type}`} role="status" aria-live="polite" transition:fade={{ duration: 150 }}>
      <span class="nbr-toast-dot"></span>{toast.message}
    </div>
  {/if}
</main>
