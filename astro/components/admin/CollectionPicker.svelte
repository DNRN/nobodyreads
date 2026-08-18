<script lang="ts">
  import { onMount } from "svelte";
  import { slugify } from "nobodyreads/slugify";

  interface CollectionItem {
    id: string;
    slug: string;
    title: string;
    kind: "post_list" | "custom";
    published: boolean;
  }

  interface Props {
    /** `${adminBase}/collections/list` — tenant-scoped by the server. */
    listUrl: string;
    /** `${adminBase}/collections` — used to save a new list and to link out. */
    collectionsBase: string;
    onSelect: (item: { slug: string }) => void;
    onClose: () => void;
    onError?: (message: string) => void;
  }

  let { listUrl, collectionsBase, onSelect, onClose, onError }: Props = $props();

  let items = $state<CollectionItem[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let dialogEl: HTMLElement;

  // --- Inline "new list" ---------------------------------------------------
  let creating = $state(false);
  let saving = $state(false);
  let newTitle = $state("");
  let newLimit = $state("10");
  let createError = $state("");
  let titleEl = $state<HTMLInputElement | undefined>();

  const newSlug = $derived(slugify(newTitle));

  async function load() {
    loading = true;
    failed = false;
    try {
      const res = await fetch(listUrl, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`Failed to load collections (${res.status})`);
      items = (await res.json()) as CollectionItem[];
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }

  async function openCreate() {
    creating = true;
    createError = "";
    await Promise.resolve();
    titleEl?.focus();
  }

  /**
   * Save a simple post list and insert it in one step.
   *
   * Published on purpose: it was created to go on the page being edited, and a
   * draft collection renders as nothing at all for a reader.
   */
  async function createList() {
    const title = newTitle.trim();
    if (!title || saving) return;
    if (!newSlug) {
      createError = "Give it a name with some letters or numbers in it.";
      return;
    }

    saving = true;
    createError = "";
    try {
      const body = new URLSearchParams();
      body.set("id", "");
      body.set("title", title);
      body.set("slug", newSlug);
      body.set("kind", "post_list");
      body.set("limit", newLimit);
      body.set("published", "on");

      const res = await fetch(`${collectionsBase}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body,
      });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) {
        // A duplicate slug lands here; the clashing collection is in the list
        // above, so the author can just pick it instead.
        createError =
          (data as any).details?.[0]?.message ?? (data as any).error ?? `Could not save (${res.status})`;
        return;
      }
      onSelect({ slug: (data as any).slug ?? newSlug });
    } catch {
      onError?.("Could not save the collection");
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    load();
    dialogEl?.focus();
  });
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape") onClose();
  }}
/>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="media-modal-overlay"
  onclick={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
>
  <div
    class="media-modal"
    role="dialog"
    aria-modal="true"
    aria-label="Insert a collection"
    tabindex="-1"
    bind:this={dialogEl}
  >
    <div class="media-modal-header">
      <h3>Insert a collection</h3>
      <div class="media-modal-header-actions">
        {#if !creating}
          <button type="button" class="btn btn-primary" onclick={openCreate}>New list</button>
        {/if}
        <button type="button" class="media-modal-close" aria-label="Close" onclick={onClose}>
          &times;
        </button>
      </div>
    </div>

    <div class="media-modal-body">
      {#if creating}
        <div class="nbr-collection-create">
          <div class="nbr-field">
            <label for="new-collection-title">Name</label>
            <input
              id="new-collection-title"
              type="text"
              bind:this={titleEl}
              bind:value={newTitle}
              placeholder="Latest posts"
              disabled={saving}
            />
            {#if newSlug}
              <p class="hint">Slug: <code>{newSlug}</code></p>
            {/if}
          </div>
          <div class="nbr-field">
            <label for="new-collection-limit">How many posts</label>
            <input
              id="new-collection-limit"
              type="number"
              min="1"
              max="200"
              bind:value={newLimit}
              disabled={saving}
            />
          </div>
          <p class="hint">Shows your newest posts. Publishes straight away.</p>
          {#if createError}
            <p class="nbr-nudge">{createError}</p>
          {/if}
          <div class="nbr-ai-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              onclick={createList}
              disabled={saving || !newTitle.trim()}
            >
              {saving ? "Saving…" : "Create and insert"}
            </button>
            <button type="button" class="btn btn-sm" onclick={() => (creating = false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      {:else if loading}
        <div class="media-modal-loading">Loading…</div>
      {:else if failed}
        <div class="media-modal-loading">Failed to load collections.</div>
      {:else if items.length === 0}
        <div class="media-modal-empty">
          No collections yet. Create a list of your posts with “New list”.
        </div>
      {:else}
        <div class="nbr-collection-list">
          {#each items as item (item.id)}
            <button
              type="button"
              class="nbr-collection-row"
              onclick={() => onSelect({ slug: item.slug })}
            >
              <span class="nbr-collection-row-main">
                <span class="nbr-collection-row-title">{item.title}</span>
                <span class="nbr-collection-row-slug">{item.slug}</span>
              </span>
              <span class="nbr-collection-row-meta">
                {item.kind === "custom" ? "Custom" : "Post list"}
                {#if !item.published}
                  <span class="nbr-collection-row-draft">Draft — won’t show on the page</span>
                {/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}

      {#if !creating}
        <p class="hint nbr-collection-footnote">
          Need a custom query or AI help?
          <a href={`${collectionsBase}/new`}>Open the collections editor</a>.
        </p>
      {/if}
    </div>
  </div>
</div>
