<script lang="ts">
  import MediaPicker from "./MediaPicker.svelte";

  interface Props {
    adminBase: string;
    /** Stored values (media key or URL), and their resolved display URLs. */
    favicon: string;
    faviconUrl: string | null;
    ogImage: string;
    ogImageUrl: string | null;
    /** Shown in the previews so they look like the real thing. */
    siteName: string;
    siteTagline: string;
    siteHost: string;
  }

  let {
    adminBase,
    favicon,
    faviconUrl,
    ogImage,
    ogImageUrl,
    siteName,
    siteTagline,
    siteHost,
  }: Props = $props();

  let faviconValue = $state(favicon);
  let faviconPreview = $state(faviconUrl);
  let ogValue = $state(ogImage);
  let ogPreview = $state(ogImageUrl);

  let picking = $state<"favicon" | "og" | null>(null);
  let status = $state<"" | "saving" | "saved" | "error">("");
  let statusTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * These are not versioned the way a theme is, so they save the moment they
   * change rather than waiting for a button. The status line is the receipt.
   */
  async function save() {
    status = "saving";
    if (statusTimer) clearTimeout(statusTimer);
    try {
      const body = new URLSearchParams();
      body.set("site:favicon", faviconValue);
      body.set("site:og_image", ogValue);

      const res = await fetch(`${adminBase}/editor/site/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body,
      });
      status = res.ok ? "saved" : "error";
    } catch {
      status = "error";
    } finally {
      statusTimer = setTimeout(() => (status = ""), 2200);
    }
  }

  async function upload(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${adminBase}/media/upload`, {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      body: fd,
    });
    if (!res.ok) throw new Error("Upload failed");
    return (await res.json()).url as string;
  }

  function onPicked({ url }: { url: string; name: string }) {
    if (picking === "favicon") {
      faviconValue = url;
      faviconPreview = url;
    } else {
      ogValue = url;
      ogPreview = url;
    }
    picking = null;
    void save();
  }

  function clearFavicon() {
    faviconValue = "";
    faviconPreview = null;
    void save();
  }

  function clearOg() {
    ogValue = "";
    ogPreview = null;
    void save();
  }

  const statusText = $derived(
    status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Save failed" : "",
  );
</script>

<section class="nbr-sharing">
  <div class="nbr-sharing-fields">
    <div class="nbr-control">
      <span class="nr-eyebrow">Favicon</span>
      <div class="nbr-logo-row">
        <div class="nbr-logo-thumb nbr-favicon-thumb">
          {#if faviconPreview}
            <img src={faviconPreview} alt="" />
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.4"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4 17 4.5-4 3.5 3L16 12l4 4"/></svg>
          {/if}
        </div>
        <div class="nbr-logo-actions">
          <button type="button" class="btn btn-primary btn-sm" onclick={() => (picking = "favicon")}>
            {faviconValue ? "Replace" : "Upload"}
          </button>
          {#if faviconValue}
            <button type="button" class="btn btn-sm" onclick={clearFavicon}>Remove</button>
          {/if}
          <p class="hint">The little icon in the browser tab.</p>
        </div>
      </div>
    </div>

    <div class="nbr-control">
      <span class="nr-eyebrow">Default social image</span>
      {#if ogPreview}
        <div class="nbr-og-set">
          <img src={ogPreview} alt="Default social image" />
          <div class="nbr-og-set-actions">
            <button type="button" class="btn btn-sm" onclick={() => (picking = "og")}>Replace</button>
            <button type="button" class="btn btn-sm" onclick={clearOg}>Remove</button>
          </div>
        </div>
      {:else}
        <button type="button" class="nbr-og-drop" onclick={() => (picking = "og")}>
          + Add an image (1200×630)
        </button>
      {/if}
      <p class="hint">Shown when a link to your site is shared. Feeds the Open Graph tags.</p>
    </div>

    {#if statusText}
      <p class={`nr-status ${status === "error" ? "is-unsaved" : "is-saved"}`}>
        <i class="nr-status-dot"></i>{statusText}
      </p>
    {/if}
  </div>

  <!--
    Both previews are the reason these two fields live together: neither is
    visible on the site itself, so the only way to judge them is to see where
    they actually turn up.
  -->
  <div class="nbr-sharing-preview">
    <span class="nr-eyebrow">Preview</span>

    <div class="nbr-tabchrome">
      <span class="nbr-tabchrome-icon">
        {#if faviconPreview}
          <img src={faviconPreview} alt="" />
        {/if}
      </span>
      <span class="nbr-tabchrome-title">{siteName || "Your site"}</span>
      <span class="nbr-tabchrome-close">×</span>
    </div>

    <div class="nbr-sharecard">
      <div class="nbr-sharecard-img">
        {#if ogPreview}
          <img src={ogPreview} alt="" />
        {/if}
      </div>
      <div class="nbr-sharecard-body">
        <span class="nbr-sharecard-host">{siteHost}</span>
        <strong class="nbr-sharecard-title">{siteName || "Your site"}</strong>
        {#if siteTagline}
          <span class="nbr-sharecard-desc">{siteTagline}</span>
        {/if}
      </div>
    </div>
  </div>
</section>

{#if picking}
  <MediaPicker
    listUrl={`${adminBase}/media/list`}
    {upload}
    onSelect={onPicked}
    onClose={() => (picking = null)}
    onError={(m: string) => console.error(m)}
  />
{/if}
