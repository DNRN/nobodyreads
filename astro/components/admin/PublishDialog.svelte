<script lang="ts">
  /**
   * The publish step: what this is, who can read it, and where it goes — said
   * before it happens. Email is the author's choice here, once per post
   * (ADR 0002). After a successful publish the same dialog turns into an
   * "It's live" panel with the link and share intents.
   *
   * A native <dialog> opened with showModal(): the browser supplies the focus
   * trap, Esc, and an inert page behind it. It is rendered outside the editor's
   * <form>, so its named radios never ride along on a no-JS submit.
   */
  import type { PageKind, PostFormat } from "nobodyreads";
  import { shareIntentUrls } from "nobodyreads/share-links";

  type AccessTier = "public" | "members" | "paid";

  interface Props {
    open: boolean;
    /** "confirm" before publishing; "live" once it is out. */
    phase: "confirm" | "live";
    busy: boolean;
    /** Why the last publish attempt failed, if it did. */
    error: string;
    kind: PageKind;
    format: PostFormat;
    title: string;
    /** Absolute public URL the item will have. */
    url: string;
    subscriberCount: number;
    emailEnabled: boolean;
    /** Set when subscribers were already emailed about this post. */
    notifiedAt: string | null;
    accessTier: AccessTier;
    inFeed: boolean;
    navLabel: string;
    notify: boolean;
    /** Whether the publish that just happened emailed anyone (live phase). */
    emailed: boolean;
    onPublish: () => void;
    onClose: () => void;
  }

  let {
    open,
    phase,
    busy,
    error,
    kind,
    format,
    title,
    url,
    subscriberCount,
    emailEnabled,
    notifiedAt,
    accessTier = $bindable(),
    inFeed = $bindable(),
    navLabel = $bindable(),
    notify = $bindable(),
    emailed,
    onPublish,
    onClose,
  }: Props = $props();

  let dialogEl: HTMLDialogElement | undefined = $state();
  let copied = $state(false);

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      copied = false;
      dialogEl.showModal();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const typeLine = $derived(
    kind === "home"
      ? "Your home page — the front door of your site."
      : kind === "page"
        ? "A page — standalone, like About. Never emailed."
        : format === "audio"
          ? "An episode — dated, with a player, in your feeds."
          : "A post — dated, in your feed.",
  );
  const canEmail = $derived(kind === "post" && emailEnabled && subscriberCount > 0 && !notifiedAt);
  const intents = $derived(shareIntentUrls(url, title));
  const inMenu = $derived(navLabel.trim().length > 0);

  function setInMenu(on: boolean) {
    navLabel = on ? navLabel.trim() || title : "";
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      window.prompt("Copy the link:", url);
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
</script>

<dialog
  class="nbr-publish"
  bind:this={dialogEl}
  aria-labelledby="nbr-publish-title"
  oncancel={(e) => {
    // Esc while a publish is in flight would hide its outcome.
    if (busy) e.preventDefault();
    else onClose();
  }}
>
  {#if phase === "confirm"}
    <h2 id="nbr-publish-title" class="nbr-publish-title">Publish “{title || "Untitled"}”</h2>
    <p class="nbr-publish-type">{typeLine}</p>

    {#if kind === "post"}
      <fieldset class="nbr-publish-section">
        <legend class="nr-eyebrow">Who can read it</legend>
        <div class="nr-segmented" role="radiogroup" aria-label="Who can read it">
          {#each [["public", "Everyone"], ["members", "Members"], ["paid", "Supporters"]] as [value, label] (value)}
            <label class="nr-segmented-option">
              <input type="radio" name="publish_access_tier" value={value} bind:group={accessTier} />
              {label}
            </label>
          {/each}
        </div>
      </fieldset>
    {/if}

    <fieldset class="nbr-publish-section">
      <legend class="nr-eyebrow">Send it out</legend>

      <label class="nbr-check">
        <input type="checkbox" checked disabled />
        <span>Publish at <code class="nbr-publish-url">{url}</code></span>
      </label>

      {#if kind === "post"}
        {#if !emailEnabled}
          <p class="hint">Email isn't set up for this site, so subscribers aren't emailed.</p>
        {:else if notifiedAt}
          <p class="hint">Subscribers were emailed about this post on {formatDate(notifiedAt)}.</p>
        {:else if subscriberCount === 0}
          <label class="nbr-check">
            <input type="checkbox" disabled />
            <span>Email subscribers — nobody has subscribed yet</span>
          </label>
          <p class="hint">You can email this post later from its settings, once people subscribe.</p>
        {:else}
          <label class="nbr-check">
            <input type="checkbox" bind:checked={notify} />
            <span>Email to {plural(subscriberCount, "subscriber")}</span>
          </label>
          <p class="hint">
            {accessTier === "public"
              ? "Goes out once. Untick to publish quietly — you can still email it later."
              : `They get the title and summary; the rest stays for ${accessTier === "paid" ? "supporters" : "members"}. Goes out once.`}
          </p>
        {/if}

        <label class="nbr-check">
          <input type="checkbox" bind:checked={inFeed} />
          <span>{format === "audio" ? "Add to your RSS and podcast feeds" : "Add to your RSS feed"}</span>
        </label>
        {#if format === "audio" && accessTier !== "public" && inFeed}
          <p class="hint">Only public episodes join the podcast feed; this one stays on your site.</p>
        {/if}
      {:else if kind === "page"}
        <label class="nbr-check">
          <input type="checkbox" checked={inMenu} onchange={(e) => setInMenu(e.currentTarget.checked)} />
          <span>Show in your site's menu{inMenu ? ` as “${navLabel}”` : ""}</span>
        </label>
      {/if}
    </fieldset>

    {#if error && !busy}
      <p class="nbr-publish-error" role="alert">{error}</p>
    {/if}

    <div class="nbr-publish-actions">
      <button type="button" class="btn btn-sm" onclick={onClose} disabled={busy}>Cancel</button>
      <button type="button" class="btn btn-primary btn-sm" onclick={onPublish} disabled={busy}>
        {busy ? "Publishing…" : canEmail && notify ? "Publish & email" : "Publish"}
      </button>
    </div>
  {:else}
    <h2 id="nbr-publish-title" class="nbr-publish-title">It's live</h2>
    <p class="nbr-publish-type">
      <a href={url} target="_blank" rel="noreferrer">{url}</a>
    </p>
    {#if emailed}
      <p class="hint">Emailing {plural(subscriberCount, "subscriber")} now.</p>
    {/if}

    <div class="nbr-publish-section">
      <div class="nr-eyebrow">Share it</div>
      <div class="nbr-publish-share">
        <button type="button" class="btn btn-sm" onclick={copyLink}>{copied ? "Copied" : "Copy link"}</button>
        <a class="btn btn-sm" href={intents.x} target="_blank" rel="noopener noreferrer">X</a>
        <a class="btn btn-sm" href={intents.bluesky} target="_blank" rel="noopener noreferrer">Bluesky</a>
        <a class="btn btn-sm" href={intents.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>
        <a class="btn btn-sm" href={intents.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
      </div>
    </div>

    <div class="nbr-publish-actions">
      <button type="button" class="btn btn-primary btn-sm" onclick={onClose}>Done</button>
    </div>
  {/if}
</dialog>
