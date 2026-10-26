<script lang="ts">
  import { onMount } from "svelte";

  interface LinkItem {
    id: string;
    title: string;
    slug: string;
    kind: "post" | "page";
    published: boolean;
    date: string;
  }

  interface Props {
    /** `${editorBase}/link-targets` — tenant-scoped by the server. */
    listUrl: string;
    /** Which tab is active on open — the kind chosen in the slash menu. */
    initialKind?: "post" | "page";
    onSelect: (item: { id: string; title: string }) => void;
    onClose: () => void;
  }

  let { listUrl, initialKind = "post", onSelect, onClose }: Props = $props();

  let items = $state<LinkItem[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let kind = $state<"post" | "page">(initialKind);
  let query = $state("");
  let searchEl = $state<HTMLInputElement | undefined>();

  const visible = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (item.kind !== kind) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || item.slug.toLowerCase().includes(q);
    });
  });

  onMount(() => {
    searchEl?.focus();
    (async () => {
      try {
        const res = await fetch(listUrl, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`Failed to load pages (${res.status})`);
        items = (await res.json()) as LinkItem[];
      } catch {
        failed = true;
      } finally {
        loading = false;
      }
    })();
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
    aria-label="Insert a link"
    tabindex="-1"
  >
    <div class="media-modal-header">
      <h3>Insert a link</h3>
      <div class="media-modal-header-actions">
        <button type="button" class="media-modal-close" aria-label="Close" onclick={onClose}>
          &times;
        </button>
      </div>
    </div>

    <div class="media-modal-body">
      <div class="nbr-link-controls">
        <div class="nr-segmented" role="radiogroup" aria-label="Link to a post or a page">
          <label class="nr-segmented-option">
            <input type="radio" name="nbr-link-kind" value="post" bind:group={kind} />
            Posts
          </label>
          <label class="nr-segmented-option">
            <input type="radio" name="nbr-link-kind" value="page" bind:group={kind} />
            Pages
          </label>
        </div>
        <label class="nbr-field nbr-link-search">
          <span class="visually-hidden">Search by title or address</span>
          <input
            type="text"
            bind:this={searchEl}
            bind:value={query}
            placeholder={kind === "post" ? "Search posts…" : "Search pages…"}
          />
        </label>
      </div>

      {#if loading}
        <div class="media-modal-loading">Loading…</div>
      {:else if failed}
        <div class="media-modal-loading">Failed to load posts and pages.</div>
      {:else if visible.length === 0}
        <div class="media-modal-empty">
          {#if items.filter((i) => i.kind === kind).length === 0}
            {kind === "post" ? "No posts yet." : "No pages yet."}
          {:else}
            Nothing matches “{query.trim()}”.
          {/if}
        </div>
      {:else}
        <div class="nbr-link-list">
          {#each visible as item (item.id)}
            <button
              type="button"
              class="nbr-link-row"
              onclick={() => onSelect({ id: item.id, title: item.title })}
            >
              <span class="nbr-link-row-main">
                <span class="nbr-link-row-title">{item.title}</span>
                <span class="nbr-link-row-slug">/{item.kind === "post" ? "posts/" : ""}{item.slug}</span>
              </span>
              <span class="nbr-link-row-meta">
                {item.date.slice(0, 10)}
                {#if !item.published}
                  <span class="nbr-link-row-draft">Draft — broken for readers until published</span>
                {/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}

      <p class="hint nbr-collection-footnote">
        The link keeps working when the target is renamed or moved — it points at the page, not its address.
      </p>
    </div>
  </div>
</div>
