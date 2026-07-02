<script lang="ts">
  import { onMount } from "svelte";
  import { generateCss } from "nobodyreads/editor";
  import type { SiteTemplateDefinition } from "nobodyreads/editor";

  interface Props {
    /** Tenant admin base, e.g. "/alice/admin". */
    adminBase: string;
    /** Public preview page for this tenant, e.g. "/alice/preview". */
    previewUrl: string;
    /** Current stored template, JSON-encoded. */
    templateJson: string;
  }

  let { adminBase, previewUrl, templateJson }: Props = $props();

  const savedTemplate = JSON.parse(templateJson) as SiteTemplateDefinition;

  let prompt = $state("");
  let generating = $state(false);
  let saving = $state(false);
  let hasResult = $state(false);
  let toast = $state<{ message: string; type: "info" | "success" | "error" } | null>(null);
  let toastTimer: number | undefined;

  // The template currently shown in the preview. Starts as the stored template
  // and becomes the last AI result; follow-up prompts refine this one.
  let previewTemplate: SiteTemplateDefinition = savedTemplate;

  let preview: HTMLIFrameElement;

  function showToast(message: string, type: "info" | "success" | "error" = "info", ms = 3000) {
    toast = { message, type };
    if (toastTimer) window.clearTimeout(toastTimer);
    if (ms > 0) toastTimer = window.setTimeout(() => (toast = null), ms);
  }

  /** Swap the generated CSS inside the same-origin preview iframe (no reload). */
  function injectPreviewCss(template: SiteTemplateDefinition) {
    try {
      const doc = preview?.contentDocument;
      if (!doc) return;
      const styleEl = doc.getElementById("nr-generated-css");
      if (styleEl) styleEl.textContent = generateCss(template);
    } catch (err) {
      console.error("AI preview CSS update failed:", err);
    }
  }

  onMount(() => {
    preview.addEventListener("load", () => injectPreviewCss(previewTemplate));
  });

  async function generate() {
    const text = prompt.trim();
    if (!text || generating) return;
    generating = true;
    showToast("Generating…", "info", 0);
    try {
      const res = await fetch(`${adminBase}/ai/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        // Refine the current preview once we have a result.
        body: JSON.stringify(hasResult ? { prompt: text, base: previewTemplate } : { prompt: text }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        template?: SiteTemplateDefinition;
        error?: string;
      };
      if (!res.ok || !data.template) {
        throw new Error(data.error || `Generation failed (${res.status})`);
      }
      previewTemplate = data.template;
      hasResult = true;
      injectPreviewCss(previewTemplate);
      showToast("Preview updated — save it as a draft when you're happy", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Generation failed", "error", 5000);
    } finally {
      generating = false;
    }
  }

  async function saveDraft() {
    if (!hasResult || saving) return;
    saving = true;
    showToast("Saving draft…", "info", 0);
    try {
      const body = new URLSearchParams();
      body.set("template", JSON.stringify(previewTemplate));
      const res = await fetch(`${adminBase}/layout/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body,
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      showToast("Saved as a draft revision — publish it from Design", "success", 6000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error", 5000);
    } finally {
      saving = false;
    }
  }
</script>

<main class="editor-main editor-main--site">
  <div class="ai-themer">
    <section class="ai-themer-panel">
      <h2>Describe your space</h2>
      <p class="hint">
        Describe the mood you want — "warm and literary", "brutalist zine", "calm podcast
        landing page". The AI proposes colors, typography, and layout. Preview it live, then
        save it as a draft to publish from <a href={`${adminBase}/layout`}>Design</a>.
      </p>

      <textarea
        bind:value={prompt}
        class="editor-textarea ai-themer-prompt"
        rows="4"
        placeholder="e.g. deep green, serif body, generous whitespace, minimal header"
        disabled={generating}
      ></textarea>

      <div class="ai-themer-actions">
        <button type="button" class="btn btn-primary" onclick={generate} disabled={generating || !prompt.trim()}>
          {generating ? "Generating…" : hasResult ? "Refine" : "Generate"}
        </button>
        <button type="button" class="btn btn-ghost" onclick={saveDraft} disabled={!hasResult || saving}>
          {saving ? "Saving…" : "Save as draft"}
        </button>
      </div>

      {#if hasResult}
        <p class="hint">
          Keep refining with follow-up prompts ("more whitespace", "swap to a serif"), or save
          the current preview.
        </p>
      {/if}

      {#if toast}
        <div class="ai-themer-toast" data-type={toast.type}>{toast.message}</div>
      {/if}
    </section>

    <section class="ai-themer-preview">
      <div class="editor-preview-label">
        Preview
        <a href={previewUrl} target="_blank" rel="noreferrer" class="btn btn-ghost">Open in new tab</a>
      </div>
      <iframe bind:this={preview} id="ai-preview" title="Theme preview" src={previewUrl}></iframe>
    </section>
  </div>
</main>

<style>
  .ai-themer {
    display: grid;
    grid-template-columns: minmax(280px, 360px) 1fr;
    gap: 1.5rem;
    align-items: start;
    padding-left: 1.5rem;
  }
  .ai-themer-panel {
    border: 1px solid var(--border, #ddd);
    border-radius: 8px;
    padding: 1.25rem;
    background: var(--bg, transparent);
  }
  .ai-themer-prompt {
    width: 100%;
    margin: 0.75rem 0;
  }
  .ai-themer-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .ai-themer-preview iframe {
    width: 100%;
    height: 70vh;
    border: 1px solid var(--border, #ddd);
    border-radius: 6px;
    background: #fff;
  }
  .ai-themer-toast {
    margin-top: 1rem;
    padding: 0.6rem 0.8rem;
    border-radius: 6px;
    font-size: 0.9rem;
  }
  .ai-themer-toast[data-type="info"] { background: rgba(0,0,0,0.06); }
  .ai-themer-toast[data-type="success"] { background: rgba(60,140,60,0.14); }
  .ai-themer-toast[data-type="error"] { background: rgba(180,50,50,0.14); }
  @media (max-width: 900px) {
    .ai-themer { grid-template-columns: 1fr; }
  }
</style>
