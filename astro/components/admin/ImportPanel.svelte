<script lang="ts">
  /**
   * The import agent's cockpit. Three states matter: configuring (file or
   * paste + instructions), waiting (a job the server runs for minutes — the
   * model is slow by choice, quality over performance), and reviewing (the
   * proposal: accept per item, preview rendered, re-run with more guidance,
   * or discard and let the server delete the staged media).
   *
   * The proposal and manifest live only here between generate and apply; the
   * server re-validates both before writing anything.
   */
  import type { ImportItem, ImportProposal } from "nobodyreads";

  interface ManifestEntry {
    source: string;
    key: string;
    url: string;
    alt: string | null;
    mediaId: string;
  }

  interface ProposalValidation {
    errors: string[];
    itemErrors: Record<number, string[]>;
  }

  interface JobResult {
    proposal: ImportProposal;
    manifest: ManifestEntry[];
    unstaged: string[];
    validation: ProposalValidation;
  }

  let { adminBase }: { adminBase: string } = $props();

  let file = $state<File | null>(null);
  let pageUrl = $state("");
  let pastedHtml = $state("");
  let instructions = $state("");
  let phase = $state<"configuring" | "running" | "reviewing">("configuring");
  let error = $state<string | null>(null);
  let result = $state<JobResult | null>(null);
  let accepted = $state<boolean[]>([]);
  let openPreview = $state<number | null>(null);
  let previews = $state<Record<number, string>>({});
  let applying = $state(false);
  let created = $state<{ id: string; slug: string; title: string; kind: string }[] | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;
  let fileInput = $state<HTMLInputElement | undefined>();

  function clearFile() {
    file = null;
    if (fileInput) fileInput.value = "";
  }

  const formatSize = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  $effect(() => () => clearInterval(timer));

  const itemIsValid = (index: number) =>
    result !== null && (result.validation.itemErrors[index] ?? []).length === 0;

  const busy = $derived(phase === "running" || applying);

  async function start(previousNotes?: string) {
    if (!file && !pageUrl.trim() && !pastedHtml.trim()) {
      error = "Upload a zip/html file, give a page URL, or paste HTML first.";
      return;
    }
    const form = new FormData();
    if (file) form.set("file", file);
    else if (pageUrl.trim()) form.set("url", pageUrl.trim());
    else form.set("html", pastedHtml);
    form.set("instructions", instructions);
    if (previousNotes) form.set("previousNotes", previousNotes);

    error = null;
    result = null;
    created = null;
    phase = "running";

    const started = await fetch(`${adminBase}/import/start`, {
      method: "POST",
      body: form,
    }).catch(() => null);
    if (!started || !started.ok) {
      phase = "configuring";
      error = started ? ((await started.json().catch(() => ({}))).error ?? "Could not start the import.") : "Could not reach the server.";
      return;
    }
    const { jobId } = (await started.json()) as { jobId: string };

    timer = setInterval(async () => {
      const res = await fetch(`${adminBase}/import/job/${jobId}`).catch(() => null);
      if (!res || !res.ok) return; // transient — the next tick tries again
      const job = await res.json();
      if (job.status === "running") return;
      clearInterval(timer);
      if (job.status === "error") {
        phase = "configuring";
        error = job.error;
        return;
      }
      result = job as JobResult;
      accepted = result.proposal.items.map((_, index) => itemIsValid(index));
      phase = "reviewing";
    }, 2500);
  }

  async function togglePreview(index: number, item: ImportItem) {
    if (openPreview === index) {
      openPreview = null;
      return;
    }
    openPreview = index;
    if (previews[index]) return;
    const res = await fetch(`${adminBase}/import/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bodyMarkdown: item.bodyMarkdown }),
    }).catch(() => null);
    if (res?.ok) previews[index] = ((await res.json()) as { html: string }).html;
  }

  async function accept() {
    if (!result) return;
    applying = true;
    error = null;
    const indexes = accepted.flatMap((on, index) => (on ? [index] : []));
    const res = await fetch(`${adminBase}/import/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal: result.proposal, manifest: result.manifest, accepted: indexes }),
    }).catch(() => null);
    applying = false;
    if (!res || !res.ok) {
      error = res
        ? ((await res.json().catch(() => ({}))).error ?? "The import could not be applied.")
        : "Could not reach the server.";
      return;
    }
    created = ((await res.json()) as { created: typeof created }).created ?? null;
    phase = "configuring";
    file = null;
    pageUrl = "";
    pastedHtml = "";
    result = null;
  }

  async function discard() {
    if (!result || !confirm("Discard this proposal and delete the staged images?")) return;
    applying = true;
    await fetch(`${adminBase}/import/discard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manifest: result.manifest }),
    }).catch(() => null);
    applying = false;
    result = null;
    created = null;
    phase = "configuring";
    file = null;
    pageUrl = "";
    pastedHtml = "";
  }
</script>

{#if error}
  <ul class="form-errors" role="alert"><li>{error}</li></ul>
{/if}

{#if phase === "configuring" && !created}
  <div class="nbr-token-form">
    <div class="nbr-control">
      <span class="nr-eyebrow">Document</span>
      <label class="nbr-import-drop" class:has-file={file !== null} class:is-disabled={busy}>
        <input
          bind:this={fileInput}
          class="visually-hidden"
          type="file"
          accept=".zip,.html,.htm"
          onchange={(event) => (file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null)}
          disabled={busy}
        />
        {#if file}
          <strong class="nbr-import-filename">{file.name}</strong>
          <span class="nbr-import-drop-sub">{formatSize(file.size)} · click to choose another</span>
        {:else}
          <span>+ Choose a .zip or .html file</span>
        {/if}
      </label>
      {#if file}
        <div class="nbr-import-file-actions">
          <button type="button" class="btn btn-sm" onclick={clearFile} disabled={busy}>Remove</button>
        </div>
      {/if}
      <p class="hint">A zip with the page and its images works best.</p>
    </div>

    <div class="nbr-control">
      <label class="nr-eyebrow" for="import-url">…or from a URL</label>
      <input
        id="import-url"
        type="url"
        bind:value={pageUrl}
        placeholder="https://example.org/deck.html"
        disabled={busy || file !== null}
      />
      <p class="hint">The page and its same-origin images are fetched by the server; cross-origin images are left linked.</p>
    </div>

    <div class="nbr-control">
      <details class="nbr-import-paste">
        <summary class="nr-eyebrow">…or paste HTML</summary>
        <textarea
          rows="6"
          spellcheck="false"
          bind:value={pastedHtml}
          placeholder="<!doctype html> …"
          disabled={busy || file !== null || pageUrl.trim() !== ""}
        ></textarea>
      </details>
    </div>

    <div class="nbr-control">
      <label class="nr-eyebrow" for="import-instructions">Instructions for the agent</label>
      <textarea
        id="import-instructions"
        rows="4"
        bind:value={instructions}
        placeholder="e.g. Keep it in Danish. One page per topic. The galleries matter most."
        disabled={busy}
      ></textarea>
      <p class="hint">Kept for re-runs.</p>
    </div>

    <div class="nbr-import-actions">
      <button type="button" class="btn btn-primary" onclick={() => start()} disabled={busy}>
        {busy ? "Working…" : "Start import"}
      </button>
    </div>
  </div>
{:else if phase === "running"}
  <div class="nbr-import-waiting">
    <span class="nr-status is-unsaved"><i class="nr-status-dot nbr-import-pulse"></i>Agent working</span>
    <p class="hint">
      The agent is reading your document and writing a proposal.
      The configured model takes a few minutes — this page keeps polling.
    </p>
  </div>
{:else if result}
  {#if result.unstaged.length > 0}
    <p class="hint hint-warn nbr-import-unstaged">
      These images could not be staged and will not appear: {result.unstaged.join(", ")}
    </p>
  {/if}

  <div class="nbr-control">
    <span class="nr-eyebrow">Agent notes</span>
    <p class="nbr-import-notes">{result.proposal.notes}</p>
  </div>

  <span class="nr-eyebrow">
    Proposal · {result.proposal.items.length} item{result.proposal.items.length === 1 ? "" : "s"}
  </span>
  <ol class="nbr-import-items">
    {#each result.proposal.items as item, index}
      <li class="nbr-import-item" class:invalid={!itemIsValid(index)}>
        <label class="nbr-import-item-head">
          <input
            type="checkbox"
            bind:checked={accepted[index]}
            disabled={!itemIsValid(index) || applying}
          />
          <span class="nbr-import-kind">{item.kind}</span>
          <strong class="nbr-import-title">{item.title}</strong>
          <code class="nbr-import-slug">/{item.slug}</code>
        </label>
        <p class="hint">{item.reason}</p>
        {#if (result.validation.itemErrors[index] ?? []).length > 0}
          <ul class="form-errors nbr-import-errors">
            {#each result.validation.itemErrors[index] ?? [] as problem}
              <li>{problem}</li>
            {/each}
          </ul>
        {/if}
        <div>
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => togglePreview(index, item)}>
            {openPreview === index ? "Hide preview" : "Preview"}
          </button>
        </div>
        {#if openPreview === index}
          <div class="nbr-import-preview">
            {@html previews[index] ?? "<p class='hint'>Rendering…</p>"}
          </div>
        {/if}
      </li>
    {/each}
  </ol>

  <div class="nbr-import-actions">
    <button type="button" class="btn btn-primary" onclick={accept} disabled={applying || !accepted.some(Boolean)}>
      {applying ? "Creating drafts…" : "Accept selected as drafts"}
    </button>
    <button type="button" class="btn" onclick={() => start(result.proposal.notes)} disabled={busy}>
      Re-run with more info
    </button>
    <button type="button" class="btn btn-danger" onclick={discard} disabled={applying}>Discard</button>
  </div>
{/if}

{#if created}
  <div class="form-success nbr-import-created">
    <p>Created {created.length} draft{created.length === 1 ? "" : "s"} — nothing is public until you publish:</p>
    <ul>
      {#each created as page}
        <li><a href={`${adminBase}/editor?page=${page.id}`}>{page.title}</a> <code>/{page.slug}</code></li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  /* Dashed picker in the same language as Settings' social-image drop. */
  .nbr-import-drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 110px;
    padding: 20px;
    border: 1px dashed var(--nr-border-strong);
    border-radius: var(--nr-radius-control);
    background: var(--nr-bg);
    color: var(--nr-muted);
    font-size: 13.5px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s ease, color 0.15s ease;
  }
  .nbr-import-drop:hover,
  .nbr-import-drop:focus-within {
    border-color: var(--nr-accent);
    color: var(--nr-text);
  }
  .nbr-import-drop:focus-within {
    box-shadow: 0 0 0 3px var(--nr-accent-soft);
  }
  .nbr-import-drop.has-file {
    border-style: solid;
    color: var(--nr-text);
  }
  .nbr-import-drop.is-disabled {
    opacity: 0.5;
    cursor: default;
  }
  .nbr-import-filename {
    font-size: 14px;
    word-break: break-all;
  }
  .nbr-import-drop-sub {
    font-size: 12.5px;
    color: var(--nr-muted);
  }
  .nbr-import-file-actions {
    margin-top: 8px;
  }

  .nbr-import-paste summary {
    cursor: pointer;
    width: fit-content;
  }
  .nbr-import-paste[open] summary {
    margin-bottom: 8px;
  }

  .nbr-import-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .nbr-import-waiting {
    display: grid;
    gap: 6px;
    padding: 8px 0;
  }
  .nbr-import-pulse {
    animation: nbr-import-pulse 1.4s ease-in-out infinite;
  }
  @keyframes nbr-import-pulse {
    50% {
      opacity: 0.3;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nbr-import-pulse {
      animation: none;
    }
  }

  .nbr-import-notes {
    margin: 8px 0 0;
    font-size: 14px;
    line-height: 1.55;
    color: var(--nr-text);
  }

  .nbr-import-items {
    display: grid;
    gap: 12px;
    list-style: none;
    padding: 0;
    margin: 9px 0 22px;
  }
  .nbr-import-item {
    display: grid;
    gap: 8px;
    padding: 14px 16px;
    border: 1px solid var(--nr-border);
    border-radius: var(--nr-radius-control);
    background: var(--nr-bg);
  }
  .nbr-import-item.invalid {
    opacity: 0.75;
  }
  .nbr-import-item-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px 10px;
    cursor: pointer;
  }
  .nbr-import-item-head input[type="checkbox"] {
    accent-color: var(--nr-accent-strong);
    align-self: center;
  }
  .nbr-import-kind {
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--nr-accent-tint);
    color: var(--nr-muted);
    font-family: var(--nr-font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .nbr-import-title {
    font-size: 15px;
    color: var(--nr-text);
  }
  .nbr-import-slug {
    font-family: var(--nr-font-mono);
    font-size: 12px;
    color: var(--nr-muted);
  }
  .nbr-import-item .hint {
    margin: 0;
  }
  .nbr-import-errors {
    margin: 0;
  }
  .nbr-import-preview {
    border-top: 1px dashed var(--nr-border);
    padding-top: 12px;
    max-height: 420px;
    overflow: auto;
    font-size: 14px;
    line-height: 1.6;
  }
  .nbr-import-preview :global(img) {
    max-width: 100%;
    height: auto;
  }
  .nbr-import-preview :global(ul),
  .nbr-import-preview :global(ol) {
    padding-left: 1.4rem;
    margin: 0.5rem 0;
  }
  .nbr-import-preview :global(ul) {
    list-style: disc;
  }
  .nbr-import-preview :global(ol) {
    list-style: decimal;
  }
  .hint.nbr-import-unstaged {
    margin: 0 0 18px;
  }

  .nbr-import-created {
    margin: 0;
  }
  .nbr-import-created p {
    margin: 0 0 6px;
  }
  .nbr-import-created ul {
    margin: 0;
    padding-left: 1.2rem;
  }
</style>
