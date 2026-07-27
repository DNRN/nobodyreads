<script lang="ts">
  import { onMount } from "svelte";

  interface MediaItem {
    id: string;
    url: string;
    originalName: string;
    mimeType?: string;
  }

  interface Props {
    /** `${adminBase}/media/list` — tenant-scoped by the server. */
    listUrl: string;
    /** Uploads one file and resolves to its public URL. */
    upload: (file: File) => Promise<string>;
    onSelect: (item: { url: string; name: string }) => void;
    onClose: () => void;
    onError?: (message: string) => void;
  }

  let { listUrl, upload, onSelect, onClose, onError }: Props = $props();

  let items = $state<MediaItem[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let uploading = $state(false);
  let dialogEl: HTMLElement;

  async function load() {
    loading = true;
    failed = false;
    try {
      const res = await fetch(listUrl, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`Failed to load media (${res.status})`);
      const all = (await res.json()) as MediaItem[];
      // The endpoint returns every upload (PDFs, video, audio). Only images can
      // be inserted as `![...]`, so anything else would produce a broken tag.
      items = all.filter((i) => i.mimeType?.startsWith("image/"));
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }

  async function onFilesChosen(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (files.length === 0) return;

    uploading = true;
    let lastUrl = "";
    let lastName = "";
    try {
      for (const file of files) {
        lastUrl = await upload(file);
        lastName = file.name;
      }
    } catch {
      onError?.("Image upload failed");
      return;
    } finally {
      uploading = false;
    }

    // Uploading a single file reads as "insert this one"; a batch just stocks
    // the library, so stay open and let the author pick.
    if (files.length === 1) onSelect({ url: lastUrl, name: lastName });
    else await load();
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
    aria-label="Media library"
    tabindex="-1"
    bind:this={dialogEl}
  >
    <div class="media-modal-header">
      <h3>Media Library</h3>
      <div class="media-modal-header-actions">
        <label class="btn btn-primary" aria-busy={uploading}>
          {uploading ? "Uploading…" : "Upload new"}
          <input type="file" accept="image/*" multiple hidden onchange={onFilesChosen} />
        </label>
        <button type="button" class="media-modal-close" aria-label="Close" onclick={onClose}>
          &times;
        </button>
      </div>
    </div>

    <div class="media-modal-body">
      {#if loading}
        <div class="media-modal-loading">Loading…</div>
      {:else if failed}
        <div class="media-modal-loading">Failed to load media library.</div>
      {:else if items.length === 0}
        <div class="media-modal-empty">No images uploaded yet. Upload your first one!</div>
      {:else}
        <div class="media-modal-grid">
          {#each items as item (item.id)}
            <button
              type="button"
              class="media-modal-card"
              title={item.originalName}
              onclick={() => onSelect({ url: item.url, name: item.originalName })}
            >
              <div class="media-modal-card-preview">
                <img src={item.url} alt={item.originalName} loading="lazy" />
              </div>
              <span class="media-modal-card-name">{item.originalName}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
