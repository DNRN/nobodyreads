<script lang="ts">
  /**
   * An audio post's main content: the episode's audio file, picked from the
   * library or uploaded, shown above the show notes.
   *
   * Audio is uploaded through the chunked upload-session routes, not the
   * single-request media upload: an episode is routinely larger than a hosting
   * platform's request-body cap, and only the session path checks the bytes and
   * records the duration the podcast feed needs. The picker therefore lists
   * only audio that has a known duration — anything else could not be saved.
   */
  import { onMount } from "svelte";
  import { z } from "zod";
  import { formatDuration } from "nobodyreads/duration";

  interface Props {
    adminBase: string;
    audioMediaId: string;
    onError?: (message: string) => void;
  }

  let {
    adminBase,
    audioMediaId = $bindable(""),
    onError,
  }: Props = $props();

  const AudioItem = z.object({
    id: z.string(),
    originalName: z.string(),
    mimeType: z.string(),
    durationSeconds: z.number().nullable(),
  });
  type AudioItem = z.infer<typeof AudioItem>;
  const Started = z.object({ sessionId: z.string(), chunkBytes: z.number(), partCount: z.number() });
  const Completed = z.object({ id: z.string() });
  const Failure = z.object({ error: z.string() });

  /** Retries per part for network errors and 5xx; a 4xx is the server saying no. */
  const PART_ATTEMPTS = 3;

  let items = $state<AudioItem[]>([]);
  let loadFailed = $state(false);
  /** Upload progress 0–1, or null when nothing is uploading. */
  let progress = $state<number | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();

  const selected = $derived(items.find((i) => i.id === audioMediaId));

  async function load() {
    try {
      const res = await fetch(`${adminBase}/media/list`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`media list ${res.status}`);
      items = z
        .array(AudioItem)
        .parse(await res.json())
        .filter((i) => i.mimeType.startsWith("audio/") && i.durationSeconds !== null);
      loadFailed = false;
    } catch {
      loadFailed = true;
    }
  }

  onMount(load);

  /** The server's own explanation for a failed request, when it sent one. */
  async function failureMessage(res: Response, fallback: string): Promise<string> {
    const parsed = Failure.safeParse(await res.json().catch(() => null));
    return parsed.success ? parsed.data.error : `${fallback} (${res.status})`;
  }

  async function putPart(url: string, bytes: Blob): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      let res: Response | null = null;
      try {
        res = await fetch(url, { method: "PUT", body: bytes, credentials: "same-origin" });
      } catch {
        // Network error: retried below like a 5xx.
      }
      if (res?.ok) return;
      if (res && res.status < 500) throw new Error(await failureMessage(res, "Upload rejected"));
      if (attempt >= PART_ATTEMPTS) throw new Error("Upload interrupted — check your connection and try again");
      const backoff = Promise.withResolvers<void>();
      setTimeout(backoff.resolve, 1000 * attempt);
      await backoff.promise;
    }
  }

  async function upload(file: File): Promise<string> {
    const sessionBase = `${adminBase}/media/upload-session`;
    const startRes = await fetch(sessionBase, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ filename: file.name, mimeType: file.type, size: file.size }),
    });
    if (!startRes.ok) throw new Error(await failureMessage(startRes, "Upload refused"));
    const session = Started.parse(await startRes.json());
    const sessionUrl = `${sessionBase}/${session.sessionId}`;

    try {
      for (let n = 0; n < session.partCount; n++) {
        const start = n * session.chunkBytes;
        await putPart(`${sessionUrl}/parts/${n}`, file.slice(start, start + session.chunkBytes));
        progress = (n + 1) / session.partCount;
      }
      const doneRes = await fetch(`${sessionUrl}/complete`, {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!doneRes.ok) throw new Error(await failureMessage(doneRes, "Upload could not be finished"));
      return Completed.parse(await doneRes.json()).id;
    } catch (err) {
      // Best effort: free the stored parts now rather than at the next sweep.
      fetch(sessionUrl, { method: "DELETE", credentials: "same-origin" }).catch(() => {});
      throw err;
    }
  }

  async function onFileChosen(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    progress = 0;
    try {
      const id = await upload(file);
      await load();
      audioMediaId = id;
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Upload failed");
    } finally {
      progress = null;
    }
  }
</script>

<section class="nbr-field nbr-episode-audio" class:is-empty={!audioMediaId} aria-labelledby="episode_audio_label">
  <div class="nbr-episode-audio-head">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
    <label id="episode_audio_label" for="episode_audio">Episode audio</label>
  </div>
  <div class="nbr-image-row">
    <select id="episode_audio" bind:value={audioMediaId} disabled={progress !== null}>
      <option value="">Choose from your library…</option>
      {#each items as item (item.id)}
        <option value={item.id}>
          {item.originalName} · {formatDuration(item.durationSeconds ?? 0)}
        </option>
      {/each}
    </select>
    <button
      type="button"
      class="btn btn-sm btn-primary"
      disabled={progress !== null}
      onclick={() => fileInput?.click()}
    >
      Upload audio…
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav"
      hidden
      onchange={onFileChosen}
    />
  </div>
  {#if progress !== null}
    <progress class="nbr-episode-progress" max="1" value={progress}></progress>
    <p class="hint">Uploading… {Math.round(progress * 100)}%. Keep this tab open.</p>
  {:else if loadFailed}
    <p class="hint">Could not load your media library. Reload the page to try again.</p>
  {:else if selected}
    <p class="hint">{selected.originalName} · {formatDuration(selected.durationSeconds ?? 0)} — readers get a player above your show notes.</p>
  {:else}
    <p class="hint">mp3, m4a, ogg or wav, up to 500 MB. You can write the show notes while it uploads; publishing waits for the audio.</p>
  {/if}
</section>

<style>
  .nbr-episode-audio {
    margin: 0 0 1.5rem;
    padding: 16px 18px;
    border: 1px solid var(--nr-border);
    border-radius: 14px;
    background: var(--nr-card);
  }

  .nbr-episode-audio.is-empty {
    border-style: dashed;
  }

  .nbr-episode-audio-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-weight: 600;
    color: var(--nr-text);
  }

  .nbr-episode-audio-head svg {
    width: 18px;
    height: 18px;
    color: var(--nr-accent);
  }

  .nbr-episode-progress {
    display: block;
    width: 100%;
    margin-top: 0.5rem;
  }
</style>
