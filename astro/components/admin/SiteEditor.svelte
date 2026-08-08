<script lang="ts">
  import { onMount } from "svelte";
  import { createSiteEditor } from "nobodyreads/editor";
  import type { SiteEditorInstance } from "nobodyreads/editor";
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
    /** Link to the AI theming screen, or null when no provider is configured. */
    aiHref?: string | null;
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
    aiHref = null,
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
  type TabId = "brand" | "layout" | "components";

  const tabs: { id: TabId; label: string; hint: string }[] = [
    { id: "brand", label: "Brand", hint: "your site" },
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
        light: { ...stored.tokens.light, maxWidth: `${readingWidth}px` },
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

  /** Any visual control changed: flag the work and re-render the preview. */
  function touched() {
    editor?.markDirty();
    editor?.refreshPreviewCss();
  }

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
          onclick={() => { activeTab = tab.id; codeMode = false; }}
        >{tab.label}</button>
      {/each}
      {#if aiHref}
        <!-- Still its own screen until the AI tab lands; Design owns the way in. -->
        <a class="nbr-design-tab" href={aiHref}>AI</a>
      {/if}
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
      <div
        class="nbr-control nbr-components"
        class:hidden={codeMode || activeTab !== "components"}
      >
        <span class="nr-eyebrow">Components</span>
        <p class="hint">Applies everywhere the component is used.</p>

        <div bind:this={componentsPane} id="components-editor" class="components-editor">
          {#each componentRegistry as component}
            {@const config = componentConfigs[component.name] ?? {}}
            {@const currentVariant = config.variant ?? component.defaultVariant}
            {@const tokenOverrides = config.tokens ?? {}}
            <details class="component-card" data-component={component.name}>
              <summary class="component-card__summary">
                <span class="component-card__label">{component.label}</span>
                <code class="component-card__name">{component.name}</code>
              </summary>
              <div class="component-card__body">
                {#if component.variants.length > 1}
                  <div class="component-field">
                    <label class="editor-label--sm" for={`component-${component.name}-variant`}>Variant</label>
                    <select
                      id={`component-${component.name}-variant`}
                      name={`component:${component.name}:variant`}
                      data-default={component.defaultVariant}
                      value={currentVariant}
                      class="editor-input editor-input--sm"
                    >
                      {#each component.variants as variant}
                        <option value={variant.id}>{variant.label}</option>
                      {/each}
                    </select>
                  </div>
                {/if}

                {#if component.tokens.length > 0}
                  <div class="component-tokens">
                    {#each component.tokens as token}
                      {@const tokenValue = tokenOverrides[token.key] ?? token.defaultValue}
                      {@const useColorPicker = token.type === "color" && isHexColor(token.defaultValue)}
                      <div class="component-field">
                        <label class="editor-label--sm" for={`component-${component.name}-token-${token.key}`}>
                          {token.label}
                        </label>
                        <input
                          id={`component-${component.name}-token-${token.key}`}
                          type={useColorPicker ? "color" : "text"}
                          name={`component:${component.name}:token:${token.key}`}
                          data-default={token.defaultValue}
                          value={tokenValue}
                          placeholder={token.defaultValue}
                          class="editor-input editor-input--sm"
                        />
                      </div>
                    {/each}
                  </div>
                {:else}
                  <p class="hint component-card__empty">No customizable tokens for this component.</p>
                {/if}

                <button type="button" class="btn btn-ghost btn-sm" data-reset-component={component.name}>
                  Reset to defaults
                </button>
              </div>
            </details>
          {/each}
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
          Live preview · {codeMode ? "your site" : tabs.find((t) => t.id === activeTab)?.hint}
        </span>
        <a href={previewUrl} target="_blank" rel="noreferrer" class="btn btn-ghost btn-sm">Open ↗</a>
      </div>
      <iframe bind:this={preview} id="site-preview" title="Site preview" data-preview-url={previewUrl}></iframe>
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
