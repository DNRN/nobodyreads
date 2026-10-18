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

  $effect(() => () => clearInterval(timer));

  const itemIsValid = (index: number) =>
    result !== null && (result.validation.itemErrors[index] ?? []).length === 0;

  const busy = $derived(phase === "running" || applying);

  async function start(previousNotes?: string) {
    if (!file && !pastedHtml.trim()) {
      error = "Upload a zip/html file or paste HTML first.";
      return;
    }
    const form = new FormData();
    if (file) form.set("file", file);
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
    pastedHtml = "";
  }
</script>

{#if error}
  <p class="nbr-import-error" role="alert">{error}</p>
{/if}

{#if phase === "configuring" && !created}
  <div class="nbr-import-form">
    <label class="nbr-import-file">
      <input
        type="file"
        accept=".zip,.html,.htm"
        onchange={(event) => (file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null)}
        disabled={busy}
      />
      <span class="hint">A zip with the page and its images works best.</span>
    </label>
    <details>
      <summary class="hint">…or paste HTML</summary>
      <textarea
        rows="5"
        bind:value={pastedHtml}
        placeholder="<!doctype html> …"
        disabled={busy || (file !== null)}
      ></textarea>
    </details>
    <label class="nbr-import-instructions">
      <span class="hint">What should the agent know? (kept for re-runs)</span>
      <textarea
        rows="4"
        bind:value={instructions}
        placeholder="e.g. Keep it in Danish. One page per topic. The galleries matter most."
        disabled={busy}
      ></textarea>
    </label>
    <button class="btn-primary" onclick={() => start()} disabled={busy}>
      {busy ? "Working…" : "Start import"}
    </button>
  </div>
{:else if phase === "running"}
  <p class="nbr-import-waiting">
    The agent is reading your document and writing a proposal.
    The configured model takes a few minutes — this page keeps polling.
  </p>
{:else if result}
  {#if result.unstaged.length > 0}
    <p class="hint">
      These images could not be staged and will not appear: {result.unstaged.join(", ")}
    </p>
  {/if}

  <p class="nbr-import-notes">{result.proposal.notes}</p>

  <ol class="nbr-import-items">
    {#each result.proposal.items as item, index}
      <li class="nbr-import-item" class:invalid={!itemIsValid(index)}>
        <label>
          <input
            type="checkbox"
            bind:checked={accepted[index]}
            disabled={!itemIsValid(index) || applying}
          />
          <span class="nbr-import-kind">{item.kind}</span>
          <strong>{item.title}</strong>
          <code>/{item.slug}</code>
        </label>
        <p class="hint">{item.reason}</p>
        {#if (result.validation.itemErrors[index] ?? []).length > 0}
          <ul class="nbr-import-errors">
            {#each result.validation.itemErrors[index] ?? [] as problem}
              <li>{problem}</li>
            {/each}
          </ul>
        {/if}
        <button class="btn-ghost" onclick={() => togglePreview(index, item)}>
          {openPreview === index ? "Hide preview" : "Preview"}
        </button>
        {#if openPreview === index}
          <div class="nbr-import-preview">
            {@html previews[index] ?? "<p class='hint'>Rendering…</p>"}
          </div>
        {/if}
      </li>
    {/each}
  </ol>

  <div class="nbr-import-actions">
    <button class="btn-primary" onclick={accept} disabled={applying || !accepted.some(Boolean)}>
      {applying ? "Creating drafts…" : "Accept selected as drafts"}
    </button>
    <button class="btn-ghost" onclick={() => start(result.proposal.notes)} disabled={busy}>
      Re-run with more info
    </button>
    <button class="btn-ghost" onclick={discard} disabled={applying}>Discard</button>
  </div>
{/if}

{#if created}
  <div class="nbr-import-created">
    <p>Created {created.length} draft{created.length === 1 ? "" : "s"} — nothing is public until you publish:</p>
    <ul>
      {#each created as page}
        <li><a href={`${adminBase}/editor?page=${page.id}`}>{page.title}</a> <code>/{page.slug}</code></li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .nbr-import-form,
  .nbr-import-item {
    display: grid;
    gap: 0.6rem;
  }
  .nbr-import-items {
    display: grid;
    gap: 0.9rem;
    list-style: none;
    padding: 0;
    margin: 1rem 0;
  }
  .nbr-import-item {
    padding: 0.9rem 1rem;
    border: 1px solid var(--border, #ddd);
    border-radius: 10px;
  }
  .nbr-import-item.invalid {
    opacity: 0.75;
  }
  .nbr-import-kind {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-right: 0.5rem;
  }
  .nbr-import-errors {
    color: var(--error, #b00020);
    margin: 0;
    padding-left: 1.2rem;
  }
  .nbr-import-notes {
    font-style: italic;
  }
  .nbr-import-preview {
    border-top: 1px dashed var(--border, #ddd);
    padding-top: 0.75rem;
    max-height: 420px;
    overflow: auto;
  }
  .nbr-import-preview img {
    max-width: 100%;
  }
  .nbr-import-actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  textarea {
    width: 100%;
  }
</style>
