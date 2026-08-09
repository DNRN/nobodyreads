<script lang="ts">
  import { onMount } from "svelte";
  import {
    generateCss,
    createSiteEditor,
    TYPE_PAIRINGS,
    DENSITY_STEPS,
    CORNER_STEPS,
    COLOR_SLOTS,
    matchTypePairing,
    matchDensityStep,
    matchCornerStep,
  } from "nobodyreads/editor";
  import type { SiteEditorInstance, TokenSet } from "nobodyreads/editor";
  import type { ComponentMap, CustomToken, SiteTemplateDefinition } from "nobodyreads";
  import MediaPicker from "./MediaPicker.svelte";

  interface ComponentVariant { id: string; label: string }
  interface ComponentTokenDef { key: string; label: string; type: string; defaultValue: string }
  interface RegistryComponent {
    name: string;
    label: string;
    defaultVariant: string;
    variants: ComponentVariant[];
    tokens: ComponentTokenDef[];
    /** Sample markup; absent for components with nothing to show. */
    specimen?: string;
  }

  interface Props {
    layoutBase: string;
    adminBase: string;
    templateJson: string;
    layoutHtml: string;
    generatedHtml: string;
    customCss: string;
    customJs: string;
    customTokens: CustomToken[];
    builtinTokens: { token: string; description: string }[];
    componentRegistry: RegistryComponent[];
    componentConfigs: ComponentMap;
    previewUrl: string;
    /** Whether the host has an AI provider configured. */
    aiEnabled?: boolean;
    /** Current site identity, for the Brand tab. */
    siteName?: string;
    siteTagline?: string;
    siteLogo?: string;
    siteLogoUrl?: string | null;
    /** What the site falls back to when a field is unset (from env). */
    siteNamePlaceholder?: string;
    siteTaglinePlaceholder?: string;
    themeBase?: string;
    themeMeta?: { name: string; author: string; version: string } | null;
    revisions?: { revisionId: number; savedAt: string; isCurrent: boolean; name: string | null }[];
  }

  let {
    layoutBase,
    adminBase,
    templateJson,
    layoutHtml,
    generatedHtml,
    customCss,
    customJs,
    customTokens,
    builtinTokens,
    componentRegistry,
    componentConfigs,
    previewUrl,
    aiEnabled = false,
    siteName = "",
    siteTagline = "",
    siteLogo = "",
    siteLogoUrl = null,
    siteNamePlaceholder = "",
    siteTaglinePlaceholder = "",
    themeBase = "",
    themeMeta = null,
    revisions = [],
  }: Props = $props();

  function isHexColor(value: string): boolean {
    return /^#[0-9a-fA-F]{3,8}$/.test(value);
  }

  const stored = JSON.parse(templateJson) as SiteTemplateDefinition;

  // --- Tabs ----------------------------------------------------------------
  // Only tabs with something behind them are listed; the rest arrive as they
  // are built rather than shipping as empty panels.
  type TabId = "brand" | "ai" | "theme" | "layout" | "components";

  const tabs: { id: TabId; label: string; hint: string }[] = [
    { id: "brand", label: "Brand", hint: "your site" },
    ...(aiEnabled ? [{ id: "ai" as TabId, label: "AI", hint: "the proposal" }] : []),
    { id: "theme", label: "Theme", hint: "your site" },
    { id: "layout", label: "Layout", hint: "your home page" },
    { id: "components", label: "Components", hint: "your home page" },
  ];

  let activeTab = $state<TabId>("brand");
  /** The template-code escape hatch. Swaps the visual tabs for the raw panes. */
  let codeMode = $state(false);

  // --- Brand ---------------------------------------------------------------
  // These are site settings, not theme tokens, so they save through their own
  // route — but through the same Save button, via `beforeSave`.
  let brandName = $state(siteName);
  let brandTagline = $state(siteTagline);
  let brandLogo = $state(siteLogo);
  let brandLogoUrl = $state(siteLogoUrl);
  let logoPickerOpen = $state(false);
  let showHidden = $state(false);

  // --- Layout --------------------------------------------------------------
  const headerSection = stored.sections?.find((s) => s.type === "header");

  let postArrangement = $state(stored.components?.postPreview?.variant ?? "auto");
  let readingWidth = $state(parseInt(stored.tokens?.light?.maxWidth ?? "900", 10) || 900);
  let showHero = $state(headerSection?.type === "header" ? headerSection.showHero : true);
  let showNav = $state(headerSection?.type === "header" ? headerSection.showNav !== false : true);
  let showSubscribe = $state(
    headerSection?.type === "header" ? headerSection.showSubscribe === true : false,
  );
  let metaDate = $state(stored.postMeta?.date !== false);
  let metaExcerpt = $state(stored.postMeta?.excerpt !== false);
  let metaReadMore = $state(stored.postMeta?.readMore !== false);
  let metaTags = $state(stored.postMeta?.tags !== false);

  // --- Theme ---------------------------------------------------------------
  // Colours are edited as a patch over the stored light token set; anything not
  // shown here (and the whole dark set) is left exactly as it was.
  let colors = $state<Record<string, string>>(
    Object.fromEntries(
      COLOR_SLOTS.map((slot) => [slot.key, String(stored.tokens?.light?.[slot.key] ?? "")]),
    ),
  );
  let moreColors = $state(false);
  let typePairing = $state(matchTypePairing(stored.tokens.light) ?? "");
  let densityStep = $state(matchDensityStep(stored.tokens.light) ?? "comfortable");
  let cornerStep = $state(matchCornerStep(stored.tokens.light.radius) ?? "soft");

  const primarySlots = COLOR_SLOTS.filter((slot) => slot.primary);
  const secondarySlots = COLOR_SLOTS.filter((slot) => !slot.primary);

  /** The token overrides the Theme tab contributes. */
  function themeTokens(): Partial<TokenSet> {
    const pairing = TYPE_PAIRINGS.find((p) => p.id === typePairing);
    const density = DENSITY_STEPS.find((d) => d.id === densityStep);
    const corner = CORNER_STEPS.find((c) => c.id === cornerStep);

    return {
      ...Object.fromEntries(Object.entries(colors).filter(([, v]) => v)),
      ...(pairing ? { font: pairing.font, brandFont: pairing.brandFont } : {}),
      ...(density
        ? { lineHeight: density.lineHeight, containerPadding: density.containerPadding }
        : {}),
      ...(corner ? { radius: corner.radius } : {}),
    } as Partial<TokenSet>;
  }

  // --- Components ----------------------------------------------------------
  // Only components with a specimen appear in the gallery. `base`, `responsive`
  // and `platform` are global rules and auth-page styling — there is nothing to
  // put in a frame for them, and a row that shows an empty box is the crowded
  // surface §1 is trying to remove. Their tokens stay reachable in the code
  // panes, where the whole template already is.
  const galleryComponents = componentRegistry.filter((c) => c.specimen);
  const hiddenComponents = componentRegistry.filter((c) => !c.specimen);

  let selectedComponent = $state(galleryComponents[0]?.name ?? "");
  const selected = $derived(
    galleryComponents.find((c) => c.name === selectedComponent) ?? galleryComponents[0],
  );

  /**
   * A self-contained document for the specimen: the site's generated CSS plus
   * the component's own markup. Same stylesheet the real page gets, so what is
   * framed here is genuinely what ships.
   */
  let specimenDoc = $state("");

  function renderSpecimen() {
    if (!selected?.specimen || !editor) {
      specimenDoc = "";
      return;
    }
    let css = "";
    try {
      css = generateCss(JSON.parse(editor!.getTemplateJson()) as SiteTemplateDefinition);
    } catch (error) {
      console.error("Specimen render failed:", error);
      return;
    }
    specimenDoc = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap">
<style>${css}
  body { margin: 0; padding: 28px; background: var(--bg); }
</style></head><body>${selected.specimen}</body></html>`;
  }

  // --- AI ------------------------------------------------------------------
  const STARTERS = [
    "warm and literary",
    "brutalist zine",
    "calm podcast landing page",
    "minimal mono",
  ];

  /** Which part of the theme a changed token belongs to, for the proposal. */
  const TOKEN_GROUPS: Record<string, "palette" | "type" | "layout"> = {
    bg: "palette", text: "palette", bodyText: "palette", muted: "palette",
    border: "palette", accent: "palette", accentText: "palette", link: "palette",
    linkHover: "palette", brandInk: "palette", brandAccent: "palette",
    brandFont: "type", logoWeight: "type", logoTracking: "type", font: "type",
    fontMono: "type", fontSize: "type", lineHeight: "type",
    maxWidth: "layout", containerPadding: "layout", radius: "layout",
  };

  interface ProposalGroup {
    id: "palette" | "type" | "layout";
    label: string;
    /** Which tab its Tweak pill opens. */
    tab: TabId;
    changes: string[];
  }

  let prompt = $state("");
  let generating = $state(false);
  let aiError = $state("");
  /** The proposed template, held client-side until applied. Never saved here. */
  let proposal = $state<SiteTemplateDefinition | null>(null);
  let proposalGroups = $state<ProposalGroup[]>([]);

  /**
   * Turn a theme diff into the three groups §7 asks for.
   *
   * Only what the model actually changed is listed — a proposal that claims to
   * have touched everything is not reviewable.
   */
  function summariseDiff(diff: any): ProposalGroup[] {
    const buckets: Record<string, string[]> = { palette: [], type: [], layout: [] };

    for (const [key, value] of Object.entries(diff?.tokens?.light ?? {})) {
      if (value == null) continue;
      const group = TOKEN_GROUPS[key];
      if (group) buckets[group]!.push(key);
    }
    for (const [name, cfg] of Object.entries(diff?.components ?? {})) {
      if ((cfg as { variant?: string | null } | null)?.variant) buckets.layout!.push(name);
    }
    if (diff?.sections) {
      for (const [name, cfg] of Object.entries(diff.sections)) {
        if (cfg && Object.values(cfg).some((v) => v != null)) buckets.layout!.push(name);
      }
    }

    return [
      { id: "palette", label: "Palette", tab: "theme" as TabId, changes: buckets.palette! },
      { id: "type", label: "Type", tab: "theme" as TabId, changes: buckets.type! },
      { id: "layout", label: "Layout", tab: "layout" as TabId, changes: buckets.layout! },
    ].filter((g) => g.changes.length > 0) as ProposalGroup[];
  }

  async function generate() {
    const text = prompt.trim();
    if (!text || generating) return;
    generating = true;
    aiError = "";
    try {
      const res = await fetch(`${adminBase}/ai/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        // Refining works from the current proposal, so follow-up prompts build
        // on what is on screen rather than starting over.
        body: JSON.stringify(proposal ? { prompt: text, base: proposal } : { prompt: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.template) throw new Error(data.error || `Generation failed (${res.status})`);
      proposal = data.template as SiteTemplateDefinition;
      proposalGroups = summariseDiff(data.diff);
      // Review it by looking at it. The editor's own state stays untouched
      // until Apply, so nothing has changed yet.
      editor?.previewTemplate(proposal);
    } catch (err) {
      aiError = err instanceof Error ? err.message : "Generation failed";
    } finally {
      generating = false;
    }
  }

  /**
   * Drop the proposal into the visual controls as unsaved work.
   *
   * Nothing reaches the live site until the author saves and publishes — the
   * same path a saved trial takes, deliberately.
   */
  function applyProposal(goTo: TabId = "theme") {
    if (!proposal) return;
    applyTemplate(proposal);
    // It is the editor's state now, not a suggestion sitting beside it.
    proposal = null;
    proposalGroups = [];
    activeTab = goTo;
  }

  // --- Saved trials --------------------------------------------------------
  interface TrialSummary {
    trialId: string;
    name: string;
    createdAt: string;
    swatches: string[];
  }

  let trials = $state<TrialSummary[]>([]);

  async function loadTrials() {
    const res = await fetch(`${adminBase}/design/trials`, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!res.ok) return;
    trials = (await res.json()).trials ?? [];
  }

  async function saveTrial() {
    const name = prompt("Name this look")?.trim();
    if (!name) return;
    const res = await fetch(`${adminBase}/design/trials`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ name, template: JSON.parse(editor!.getTemplateJson()) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}) as { error?: string });
      alert(`Could not save the trial: ${data.error ?? res.status}`);
      return;
    }
    await loadTrials();
  }

  /**
   * Load a banked look into the editor as unsaved work.
   *
   * Never publishes and never even saves — the author still decides. Both this
   * component's state and the code panes are reset, so the next save is the
   * trial rather than a splice of it onto what was here before.
   */
  async function applyTrial(trialId: string) {
    const res = await fetch(`${adminBase}/design/trials/${trialId}`, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const { trial } = await res.json();
    applyTemplate(trial.template as SiteTemplateDefinition);
  }

  /**
   * Load a whole template into the editor as unsaved work.
   *
   * Shared by saved trials and AI proposals: both replace the look wholesale,
   * and both must leave the decision to save or publish with the author.
   */
  function applyTemplate(t: SiteTemplateDefinition) {
    colors = Object.fromEntries(
      COLOR_SLOTS.map((slot) => [slot.key, String(t.tokens?.light?.[slot.key] ?? "")]),
    );
    typePairing = matchTypePairing(t.tokens.light) ?? "";
    densityStep = matchDensityStep(t.tokens.light) ?? densityStep;
    cornerStep = matchCornerStep(t.tokens.light.radius) ?? cornerStep;
    readingWidth = parseInt(t.tokens?.light?.maxWidth ?? "900", 10) || readingWidth;
    postArrangement = t.components?.postPreview?.variant ?? postArrangement;

    editor?.loadTemplate(t as unknown as Record<string, unknown>);
  }

  async function deleteTrial(trialId: string) {
    if (!confirm("Delete this trial?")) return;
    await fetch(`${adminBase}/design/trials/${trialId}/delete`, {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    await loadTrials();
  }


  const arrangements = [
    { id: "auto", label: "Automatic" },
    { id: "default", label: "List" },
    { id: "grid", label: "Grid" },
    { id: "card", label: "Cards" },
  ];

  const widthLabel = $derived(
    readingWidth < 760 ? "narrow" : readingWidth < 1000 ? "comfortable" : "wide",
  );

  /**
   * The slice of the template these tabs own.
   *
   * Handed to `createSiteEditor`, which merges it over the stored template on
   * every serialise — so the code panes and the visual controls compose instead
   * of overwriting each other.
   */
  function templatePatch(base: Record<string, unknown>): Record<string, unknown> {
    const sections = (stored.sections ?? []).map((section) =>
      section.type === "header"
        ? { ...section, showHero, showNav, showSubscribe }
        : section,
    );

    // Components come from the Components tab's DOM. Merge rather than replace,
    // or picking a home arrangement would wipe every token override.
    const components = { ...((base.components as ComponentMap) ?? {}) };
    components.postPreview = { ...components.postPreview, variant: postArrangement };

    return {
      sections,
      components,
      tokens: {
        ...stored.tokens,
        light: { ...stored.tokens.light, ...themeTokens(), maxWidth: `${readingWidth}px` },
      },
      postMeta: {
        date: metaDate,
        excerpt: metaExcerpt,
        readMore: metaReadMore,
        tags: metaTags,
      },
    };
  }

  /** Site identity is not part of the theme, so it saves on its own route. */
  async function saveIdentity(): Promise<void> {
    const body = new URLSearchParams();
    body.set("site:name", brandName);
    body.set("site:tagline", brandTagline);
    body.set("site:logo", brandLogo);

    const res = await fetch(`${adminBase}/editor/site/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body,
    });
    if (!res.ok) throw new Error(`Saving site identity failed (${res.status})`);
  }

  // --- Wiring --------------------------------------------------------------
  let formEl: HTMLFormElement;
  let tabsEl: HTMLElement;
  let htmlInput: HTMLTextAreaElement;
  let cssInput: HTMLTextAreaElement;
  let tsInput: HTMLTextAreaElement;
  let jsonInput: HTMLTextAreaElement;
  let templateHidden: HTMLInputElement;
  let preview: HTMLIFrameElement;
  let saveStatus: HTMLElement;
  let customTokensEditor: HTMLElement;
  let componentsPane: HTMLElement;
  let addTokenBtn: HTMLButtonElement;

  let editor: SiteEditorInstance | null = null;
  let publishing = $state(false);

  /**
   * The AI tab previews its proposal rather than the editor's state, so moving
   * away has to restore the preview or another tab shows a theme it is not
   * editing.
   */
  function onTabChange(next: TabId) {
    if (next !== "ai" && proposal) editor?.refreshPreviewCss();
    if (next === "ai" && proposal) editor?.previewTemplate(proposal);
    if (next === "components") renderSpecimen();
  }

  /** Any visual control changed: flag the work and re-render the preview. */
  function touched() {
    editor?.markDirty();
    editor?.refreshPreviewCss();
    if (activeTab === "components") renderSpecimen();
  }

  $effect(() => {
    void selectedComponent;
    if (activeTab === "components") renderSpecimen();
  });

  async function publish() {
    if (publishing || !editor) return;
    publishing = true;
    try {
      // Publish is save-then-publish, so what goes live is exactly what was
      // just serialised — never a second serialisation of the same state.
      const revisionId = await editor.save();
      if (revisionId == null) return;
      await fetch(`${layoutBase}/revision/publish/${revisionId}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      preview?.setAttribute("src", `${previewUrl}?t=${Date.now()}`);
    } finally {
      publishing = false;
    }
  }

  let themeFileEl = $state<HTMLInputElement | undefined>();

  /**
   * Import posts multipart to the existing route. A plain <form> would have to
   * nest inside the Design form, which is invalid markup and submits the wrong
   * thing, so it goes over fetch instead.
   */
  async function importTheme(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${themeBase}/import`, {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      body,
    });
    input.value = "";
    if (!res.ok) {
      const data = await res.json().catch(() => ({}) as { error?: string });
      alert(`Import failed: ${data.error ?? res.status}`);
      return;
    }
    window.location.reload();
  }

  async function publishRevision(revisionId: number) {
    await fetch(`${layoutBase}/revision/publish/${revisionId}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    window.location.reload();
  }

  async function deleteRevision(revisionId: number) {
    if (!confirm("Delete this revision?")) return;
    await fetch(`${layoutBase}/revision/delete/${revisionId}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    window.location.reload();
  }

  function onLogoPicked({ url }: { url: string; name: string }) {
    logoPickerOpen = false;
    brandLogo = url;
    brandLogoUrl = url;
    touched();
  }

  onMount(() => {
    const instance = createSiteEditor({
      formElement: formEl,
      tabs: tabsEl,
      panes: formEl.querySelectorAll<HTMLElement>(".site-editor-pane"),
      htmlInput,
      cssInput,
      tsInput,
      jsonInput,
      templateHidden,
      preview,
      saveStatus,
      customTokensEditor,
      componentsPane,
      addTokenBtn,
      templatePatch,
      beforeSave: saveIdentity,
    });
    editor = instance;
    // Nothing else loads the iframe now that Preview is not a tab of its own.
    instance.refreshPreviewCss();
    void loadTrials();
    return () => instance.destroy();
  });
</script>

<form
  method="POST"
  action={`${layoutBase}/save`}
  class="nbr-design"
  bind:this={formEl}
>
  <header class="nbr-design-head">
    <div>
      <h2 class="nr-title nbr-design-title">Design</h2>
      <p class="nbr-design-sub">Your site's look and identity. Changes save as a draft first.</p>
    </div>
    <div class="nbr-design-actions">
      <span bind:this={saveStatus} class="editor-save-status" aria-live="polite">Saved</span>
      <button type="submit" class="btn btn-sm">Save draft</button>
      <button type="button" class="btn btn-primary btn-sm" onclick={publish} disabled={publishing}>
        {publishing ? "Publishing…" : "Publish"}
      </button>
    </div>
  </header>

  <div class="nbr-design-tabbar">
    <div class="nbr-design-tabs" role="tablist" aria-label="Design">
      {#each tabs as tab}
        <button
          type="button"
          role="tab"
          class="nbr-design-tab"
          class:is-active={!codeMode && activeTab === tab.id}
          aria-selected={!codeMode && activeTab === tab.id}
          onclick={() => { activeTab = tab.id; codeMode = false; onTabChange(tab.id); }}
        >{tab.label}</button>
      {/each}
    </div>

    <button
      type="button"
      class="btn btn-sm nbr-design-code-toggle"
      class:is-active={codeMode}
      onclick={() => (codeMode = !codeMode)}
      aria-pressed={codeMode}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m8 8-4 4 4 4M16 8l4 4-4 4"/></svg>
      {codeMode ? "Back to visual" : "Edit template code"}
    </button>
  </div>

  <input type="hidden" name="template" bind:this={templateHidden} value={templateJson} />

  <!--
    One preview, shared by every tab. Visual edits and hand-written code both
    render into it, so cause and effect stay visible either way (§5).
  -->
  <div class="nbr-design-body" class:is-code={codeMode}>
    <div class="nbr-design-controls">
      {#if !codeMode && activeTab === "brand"}
        <div class="nbr-control">
          <label class="nr-eyebrow" for="brand-name">Site name</label>
          <input
            id="brand-name"
            type="text"
            bind:value={brandName}
            oninput={touched}
            placeholder={siteNamePlaceholder}
          />
          <p class="hint">
            Shown in the header. Feeds <code>{"{{siteName}}"}</code>.
            {#if !brandName && siteNamePlaceholder}
              Unset — the site is using <strong>{siteNamePlaceholder}</strong>.
            {/if}
          </p>
        </div>

        <div class="nbr-control">
          <label class="nr-eyebrow" for="brand-tagline">Tagline</label>
          <input
            id="brand-tagline"
            type="text"
            bind:value={brandTagline}
            oninput={touched}
            placeholder={siteTaglinePlaceholder}
          />
          <p class="hint">Feeds <code>{"{{siteTagline}}"}</code>.</p>
        </div>

        <div class="nbr-control">
          <span class="nr-eyebrow">Logo</span>
          <div class="nbr-logo-row">
            <div class="nbr-logo-thumb">
              {#if brandLogoUrl}
                <img src={brandLogoUrl} alt="" />
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.4"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4 17 4.5-4 3.5 3L16 12l4 4"/></svg>
              {/if}
            </div>
            <div class="nbr-logo-actions">
              <button type="button" class="btn btn-primary btn-sm" onclick={() => (logoPickerOpen = true)}>
                {brandLogo ? "Replace" : "Choose"}
              </button>
              {#if brandLogo}
                <button
                  type="button"
                  class="btn btn-sm"
                  onclick={() => { brandLogo = ""; brandLogoUrl = null; touched(); }}
                >Remove</button>
              {/if}
              <p class="hint">
                {brandLogo ? "Feeds {{siteLogo}}." : "No logo — the site name shows instead."}
              </p>
            </div>
          </div>
        </div>

        <p class="nbr-note">
          Favicon and the default social image live in
          <a href={`${adminBase}/settings`}>Settings · Sharing &amp; SEO</a> — they are about how
          your site looks <em>elsewhere</em>, not on the page.
        </p>
      {/if}

      {#if !codeMode && activeTab === "ai"}
        <div class="nbr-control">
          <label class="nr-eyebrow" for="ai-prompt">Describe your space</label>
          <textarea
            id="ai-prompt"
            class="nbr-ai-prompt"
            rows="3"
            bind:value={prompt}
            disabled={generating}
            placeholder="deep green, serif body, generous whitespace, minimal header"
          ></textarea>

          <div class="nbr-chips nbr-starters">
            {#each STARTERS as starter}
              <button
                type="button"
                class="nbr-starter"
                disabled={generating}
                onclick={() => { prompt = starter; generate(); }}
              >{starter}</button>
            {/each}
          </div>

          <div class="nbr-ai-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              onclick={generate}
              disabled={generating || !prompt.trim()}
            >
              {generating ? "Thinking…" : proposal ? "Regenerate" : "Generate"}
            </button>
            {#if proposal}
              <button type="button" class="btn btn-sm" onclick={() => applyProposal()}>
                Apply to Design
              </button>
            {/if}
          </div>

          {#if aiError}
            <p class="nbr-nudge">{aiError}</p>
          {/if}
        </div>

        {#if proposal}
          <!--
            A proposal to review, not a change already made. Nothing reaches the
            live site — or even the visual controls — until it is applied.
          -->
          <div class="nbr-control">
            <span class="nr-eyebrow">The proposal</span>
            <div class="nbr-proposal">
              {#each proposalGroups as group}
                <div class="nbr-proposal-group">
                  <div>
                    <span class="nbr-proposal-label">{group.label}</span>
                    <span class="nbr-proposal-changes">{group.changes.join(" · ")}</span>
                  </div>
                  <button
                    type="button"
                    class="nbr-tweak"
                    onclick={() => applyProposal(group.tab)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14M5 16h14"/><circle cx="9" cy="8" r="2"/><circle cx="15" cy="16" r="2"/></svg>
                    Tweak
                  </button>
                </div>
              {/each}
              {#if proposalGroups.length === 0}
                <p class="hint">The model proposed no changes. Try describing the mood differently.</p>
              {/if}
            </div>
            <p class="hint">
              Applying loads it into the visual controls as unsaved work — publish when you're sure.
            </p>
          </div>
        {/if}
      {/if}

      {#if !codeMode && activeTab === "theme"}
        <div class="nbr-control">
          <span class="nr-eyebrow">Colours</span>
          <div class="nbr-swatches">
            {#each primarySlots as slot}
              <label class="nbr-swatch">
                <input type="color" bind:value={colors[slot.key]} oninput={touched} />
                <span class="nbr-swatch-name">{slot.label}</span>
                <span class="nbr-swatch-hex">{colors[slot.key]}</span>
              </label>
            {/each}
          </div>

          <details class="nbr-advanced" bind:open={moreColors}>
            <summary>More colours</summary>
            <div class="nbr-swatches">
              {#each secondarySlots as slot}
                <label class="nbr-swatch">
                  <input type="color" bind:value={colors[slot.key]} oninput={touched} />
                  <span class="nbr-swatch-name">{slot.label}</span>
                  <span class="nbr-swatch-hex">{colors[slot.key]}</span>
                </label>
              {/each}
            </div>
            <p class="hint">
              Dark-mode colours are not shown here — they live in the template code.
            </p>
          </details>
        </div>

        <div class="nbr-control">
          <label class="nr-eyebrow" for="type-pairing">Type pairing</label>
          <select id="type-pairing" bind:value={typePairing} onchange={touched}>
            {#if !typePairing}
              <option value="">Custom (set in template code)</option>
            {/if}
            {#each TYPE_PAIRINGS as pairing}
              <option value={pairing.id}>{pairing.label}</option>
            {/each}
          </select>
          <p class="hint">
            Only faces the site actually loads are offered — anything else would fall back
            silently and look like a bug.
          </p>
        </div>

        <div class="nbr-control">
          <span class="nr-eyebrow">
            Density &amp; whitespace
            <span class="nbr-control-value">
              {DENSITY_STEPS.find((d) => d.id === densityStep)?.label}
            </span>
          </span>
          <!-- A slider, not segments: the steps are ordered (less air → more),
               and four segments do not fit the controls column. -->
          <input
            type="range"
            min="0"
            max={DENSITY_STEPS.length - 1}
            step="1"
            aria-label="Density and whitespace"
            value={Math.max(0, DENSITY_STEPS.findIndex((d) => d.id === densityStep))}
            oninput={(e) => {
              densityStep = DENSITY_STEPS[Number((e.currentTarget as HTMLInputElement).value)]!.id;
              touched();
            }}
          />
        </div>

        <div class="nbr-control">
          <span class="nr-eyebrow">Corners</span>
          <div class="nr-segmented" role="radiogroup" aria-label="Corners">
            {#each CORNER_STEPS as step}
              <label class="nr-segmented-option">
                <input type="radio" name="corners" value={step.id} bind:group={cornerStep} onchange={touched} />
                {step.label}
              </label>
            {/each}
          </div>
          <p class="hint">Moves every rounded surface at once.</p>
        </div>

        <!--
          Saved trials. Banking a look never publishes it and never even saves a
          draft — applying one loads it in as unsaved work, so switching between
          looks stays free.
        -->
        <div class="nbr-control nbr-trials">
          <span class="nr-eyebrow">Saved trials</span>
          <div class="nbr-trial-strip">
            {#each trials as trial}
              <span class="nbr-trial">
                <button type="button" class="nbr-trial-apply" onclick={() => applyTrial(trial.trialId)}>
                  <span class="nbr-trial-swatches">
                    {#each trial.swatches.slice(0, 3) as swatch}
                      <i style={`background:${swatch}`}></i>
                    {/each}
                  </span>
                  {trial.name}
                </button>
                <button
                  type="button"
                  class="nbr-trial-remove"
                  aria-label={`Delete ${trial.name}`}
                  onclick={() => deleteTrial(trial.trialId)}
                >×</button>
              </span>
            {/each}
            <button type="button" class="nbr-trial-add" onclick={saveTrial}>+ Save current as trial</button>
          </div>
          <p class="hint">Bank a look, try another — publish only when you're sure.</p>
        </div>
      {/if}

      {#if !codeMode && activeTab === "layout"}
        <div class="nbr-control">
          <span class="nr-eyebrow">Home page posts</span>
          <div class="nr-segmented" role="radiogroup" aria-label="Home page posts">
            {#each arrangements as option}
              <label class="nr-segmented-option">
                <input
                  type="radio"
                  name="post-arrangement"
                  value={option.id}
                  bind:group={postArrangement}
                  onchange={touched}
                />
                {option.label}
              </label>
            {/each}
          </div>
          <p class="hint">
            Automatic reads as a list for a handful of posts and switches to cards once there are
            more than four.
          </p>
        </div>

        <div class="nbr-control">
          <label class="nr-eyebrow" for="reading-width">
            Reading width
            <span class="nbr-control-value">{readingWidth}px · {widthLabel}</span>
          </label>
          <input
            id="reading-width"
            type="range"
            min="640"
            max="1200"
            step="20"
            bind:value={readingWidth}
            oninput={touched}
          />
        </div>

        <div class="nbr-control">
          <span class="nr-eyebrow">In the header</span>
          <label class="nbr-check">
            <input type="checkbox" bind:checked={showHero} onchange={touched} />
            <span>Site name &amp; tagline</span>
          </label>
          <label class="nbr-check">
            <input type="checkbox" bind:checked={showNav} onchange={touched} />
            <span>Navigation links</span>
          </label>
          <label class="nbr-check">
            <input type="checkbox" bind:checked={showSubscribe} onchange={touched} />
            <span>Subscribe form</span>
          </label>
        </div>

        <div class="nbr-control">
          <span class="nr-eyebrow">Show on each post</span>
          <div class="nbr-chips">
            <label class="nbr-chip">
              <input type="checkbox" bind:checked={metaDate} onchange={touched} /><span>Date</span>
            </label>
            <label class="nbr-chip">
              <input type="checkbox" bind:checked={metaReadMore} onchange={touched} /><span>Read more</span>
            </label>
            <label class="nbr-chip">
              <input type="checkbox" bind:checked={metaTags} onchange={touched} /><span>Tags</span>
            </label>
            <label class="nbr-chip">
              <input type="checkbox" bind:checked={metaExcerpt} onchange={touched} /><span>Excerpt</span>
            </label>
          </div>
        </div>
      {/if}

      <!--
        Components keeps its existing editor: createSiteEditor reads variants and
        token overrides straight out of this DOM, so it stays mounted whichever
        tab is showing and is only hidden. §8c's specimen gallery replaces the
        presentation later, not the wiring.
      -->
      <!--
        Components stays mounted whichever tab is showing: createSiteEditor reads
        variants and token overrides straight out of this DOM. Only the presentation
        is tabbed.
      -->
      <div
        class="nbr-components"
        class:hidden={codeMode || activeTab !== "components"}
      >
        <div class="nbr-component-rail">
          <span class="nr-eyebrow">Components</span>
          <ul class="nbr-component-list">
            {#each galleryComponents as component}
              <li>
                <button
                  type="button"
                  class="nbr-component-item"
                  class:is-active={selectedComponent === component.name}
                  onclick={() => (selectedComponent = component.name)}
                >{component.label}</button>
              </li>
            {/each}
          </ul>
        </div>

        <div bind:this={componentsPane} id="components-editor" class="components-editor">
          {#each componentRegistry as component}
            {@const config = componentConfigs[component.name] ?? {}}
            {@const currentVariant = config.variant ?? component.defaultVariant}
            {@const tokenOverrides = config.tokens ?? {}}
            {@const inGallery = Boolean(component.specimen)}
            <div
              class="nbr-component-controls"
              data-component={component.name}
              class:hidden={inGallery ? selectedComponent !== component.name : !showHidden}
            >
              {#if inGallery}
                <h3 class="nbr-component-title">{component.label}</h3>
              {:else}
                <h4 class="nbr-component-subtitle">{component.label} <code>{component.name}</code></h4>
              {/if}

              {#if component.variants.length > 1}
                <div class="nbr-control">
                  <label class="nr-eyebrow" for={`component-${component.name}-variant`}>Variant</label>
                  <select
                    id={`component-${component.name}-variant`}
                    name={`component:${component.name}:variant`}
                    data-default={component.defaultVariant}
                    value={currentVariant}
                    onchange={() => renderSpecimen()}
                  >
                    {#each component.variants as variant}
                      <option value={variant.id}>{variant.label}</option>
                    {/each}
                  </select>
                </div>
              {/if}

              {#each component.tokens as token}
                {@const tokenValue = tokenOverrides[token.key] ?? token.defaultValue}
                {@const useColorPicker = token.type === "color" && isHexColor(token.defaultValue)}
                <div class="nbr-control">
                  <label class="nr-eyebrow" for={`component-${component.name}-token-${token.key}`}>
                    {token.label}
                  </label>
                  <input
                    id={`component-${component.name}-token-${token.key}`}
                    type={useColorPicker ? "color" : "text"}
                    name={`component:${component.name}:token:${token.key}`}
                    data-default={token.defaultValue}
                    value={tokenValue}
                    placeholder={token.defaultValue}
                    oninput={() => renderSpecimen()}
                  />
                </div>
              {/each}

              {#if component.variants.length <= 1 && component.tokens.length === 0}
                <p class="hint">Nothing to adjust here — this component follows the theme.</p>
              {/if}

              <div class="nbr-component-foot">
                <button type="button" class="btn btn-sm btn-ghost" data-reset-component={component.name}>
                  Reset to defaults
                </button>
                {#if inGallery}
                  <p class="nbr-note">Applies everywhere this component is used.</p>
                {/if}
              </div>
            </div>
          {/each}

          {#if hiddenComponents.length > 0}
            <details class="nbr-advanced" bind:open={showHidden}>
              <summary>Global rules ({hiddenComponents.length})</summary>
              <p class="hint">
                Base styles, responsive rules and platform pages. No specimen to show, but
                their tokens are here.
              </p>
            </details>
          {/if}
        </div>
      </div>

      <!--
        The template-code panes. Hidden rather than unmounted: CodeMirror is
        attached to these textareas by createSiteEditor at mount, and their
        contents are read on every save.
      -->
      <div class="nbr-design-code" class:hidden={!codeMode}>
        <p class="nbr-note nbr-note--code">
          Everything the visual controls write, editable by hand. Changes here win.
        </p>

        <div class="editor-tabs editor-tabs--site" bind:this={tabsEl}>
          <button type="button" class="editor-tab active" data-tab="html">HTML</button>
          <button type="button" class="editor-tab" data-tab="css">CSS</button>
          <button type="button" class="editor-tab" data-tab="js">JS</button>
          <button type="button" class="editor-tab" data-tab="tokens">Tokens</button>
          <button type="button" class="editor-tab" data-tab="advanced">Raw JSON</button>
        </div>

        <div class="site-editor">
          <div class="site-editor-pane" data-pane="html">
            <label for="site-html">Layout HTML</label>
            <details class="editor-tokens">
              <summary>Available tokens</summary>
              <div class="editor-tokens-body">
                <ul class="editor-token-list">
                  {#each builtinTokens as { token, description }}
                    <li><code>{token}</code> — {description}</li>
                  {/each}
                  {#each customTokens as t}
                    <li><code>{`{{${t.key}}}`}</code> — {t.label} (custom)</li>
                  {/each}
                </ul>
              </div>
            </details>
            <textarea bind:this={htmlInput} id="site-html" name="layoutHtml" rows="24" class="editor-textarea" spellcheck="false">{layoutHtml || generatedHtml}</textarea>
          </div>

          <div class="site-editor-pane hidden" data-pane="css">
            <label for="site-css">Custom CSS</label>
            <p class="hint">Appended after the generated theme styles.</p>
            <textarea bind:this={cssInput} id="site-css" name="customCss" rows="24" class="editor-textarea" spellcheck="false">{customCss}</textarea>
          </div>

          <div class="site-editor-pane hidden" data-pane="js">
            <label for="site-ts">Custom JavaScript</label>
            <p class="hint">Runs as a module script on every page. Use with caution.</p>
            <textarea bind:this={tsInput} id="site-ts" name="customJs" rows="24" class="editor-textarea" spellcheck="false">{customJs}</textarea>
          </div>

          <div class="site-editor-pane hidden" data-pane="tokens">
            <label>Custom tokens</label>
            <p class="hint">
              Reusable text slots for your layout. Keys become <code>{'{{key}}'}</code> placeholders.
            </p>

            <div bind:this={customTokensEditor} id="custom-tokens-editor" data-tokens={JSON.stringify(customTokens)}>
              {#if customTokens.length === 0}
                <p class="editor-empty">No custom tokens defined. Add one below.</p>
              {:else}
                <table class="editor-table">
                  <thead>
                    <tr><th>Key</th><th>Label</th><th>Type</th><th>Default</th><th></th></tr>
                  </thead>
                  <tbody>
                    {#each customTokens as t}
                      <tr data-token-key={t.key} data-token-default={t.defaultValue}>
                        <td><code>{`{{${t.key}}}`}</code></td>
                        <td>{t.label}</td>
                        <td>{t.type}</td>
                        <td class="cell-slug">{t.defaultValue || "—"}</td>
                        <td>
                          <button type="button" class="btn btn-danger btn-sm" data-remove-token={t.key}>Remove</button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {/if}

              <div class="editor-token-add" style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: end;">
                <div>
                  <label class="editor-label--sm" for="new-token-key">Key</label>
                  <input type="text" id="new-token-key" class="editor-input editor-input--sm" placeholder="e.g. copyright_text" pattern="[a-zA-Z_][a-zA-Z0-9_]*" />
                </div>
                <div>
                  <label class="editor-label--sm" for="new-token-label">Label</label>
                  <input type="text" id="new-token-label" class="editor-input editor-input--sm" placeholder="e.g. Copyright Text" />
                </div>
                <div>
                  <label class="editor-label--sm" for="new-token-type">Type</label>
                  <select id="new-token-type" class="editor-input editor-input--sm">
                    <option value="text">text</option>
                    <option value="html">html</option>
                    <option value="url">url</option>
                    <option value="color">color</option>
                  </select>
                </div>
                <div>
                  <label class="editor-label--sm" for="new-token-default">Default</label>
                  <input type="text" id="new-token-default" class="editor-input editor-input--sm" placeholder="default value" />
                </div>
                <button type="button" class="btn btn-ghost" id="add-token-btn" bind:this={addTokenBtn}>Add token</button>
              </div>
            </div>
          </div>

          <div class="site-editor-pane hidden" data-pane="advanced">
            <label for="site-json">Raw template JSON</label>
            <p class="hint">The whole template definition. Overrides every other pane.</p>
            <textarea bind:this={jsonInput} id="site-json" name="templateJson" rows="24" class="editor-textarea" spellcheck="false">{templateJson}</textarea>
          </div>
        </div>

        <div class="nbr-design-history">
          <span class="nr-eyebrow">Theme file</span>
          <div class="nbr-history-row">
            <a href={`${themeBase}/export`} class="btn btn-sm" download>Export theme</a>
            <button type="button" class="btn btn-sm btn-ghost" onclick={() => themeFileEl?.click()}>
              Import theme
            </button>
            <input
              bind:this={themeFileEl}
              type="file"
              accept=".json,application/json"
              hidden
              onchange={importTheme}
            />
            {#if themeMeta}
              <span class="hint">
                Current: <strong>{themeMeta.name}</strong> v{themeMeta.version} by {themeMeta.author}
              </span>
            {/if}
          </div>

          <span class="nr-eyebrow" style="margin-top:22px; display:block">Revisions</span>
          <p class="hint">Every save appends one. Publishing points the site at a revision.</p>
          {#if revisions.length === 0}
            <p class="editor-empty">No revisions yet. Save your first change.</p>
          {:else}
            <table class="editor-table">
              <thead>
                <tr><th>ID</th><th>Saved</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {#each revisions as rev}
                  <tr>
                    <td>#{rev.revisionId}{#if rev.name}<span class="hint"> ({rev.name})</span>{/if}</td>
                    <td>{rev.savedAt}</td>
                    <td>
                      {#if rev.isCurrent}
                        <span class="badge badge-published">published</span>
                      {:else}
                        <span class="badge badge-draft">draft</span>
                      {/if}
                    </td>
                    <td class="cell-actions">
                      {#if !rev.isCurrent}
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          onclick={() => publishRevision(rev.revisionId)}
                        >Publish</button>
                      {/if}
                      <button
                        type="button"
                        class="btn btn-danger btn-sm"
                        onclick={() => deleteRevision(rev.revisionId)}
                      >Delete</button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      </div>
    </div>

    <aside class="nbr-design-preview">
      <div class="nbr-design-preview-head">
        <span class="nr-eyebrow">
          {#if !codeMode && activeTab === "components"}
            {selected?.label} · live specimen
          {:else}
            Live preview · {codeMode ? "your site" : tabs.find((t) => t.id === activeTab)?.hint}
          {/if}
        </span>
        <a href={previewUrl} target="_blank" rel="noreferrer" class="btn btn-ghost btn-sm">Open ↗</a>
      </div>
      <!--
        The site preview stays mounted whichever tab is showing: createSiteEditor
        writes generated CSS into its document, and remounting would drop that.
      -->
      <iframe
        bind:this={preview}
        id="site-preview"
        title="Site preview"
        data-preview-url={previewUrl}
        class:hidden={!codeMode && activeTab === "components"}
      ></iframe>
      {#if !codeMode && activeTab === "components"}
        <iframe class="nbr-specimen" title={`${selected?.label} specimen`} srcdoc={specimenDoc}></iframe>
      {/if}
    </aside>
  </div>
</form>

{#if logoPickerOpen}
  <MediaPicker
    listUrl={`${adminBase}/media/list`}
    upload={async (file: File) => {
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
    }}
    onSelect={onLogoPicked}
    onClose={() => (logoPickerOpen = false)}
    onError={(m: string) => console.error(m)}
  />
{/if}
