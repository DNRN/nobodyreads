<script lang="ts">
  import { onMount } from "svelte";
  import { createSiteEditor } from "nobodyreads/editor";
  import type { ComponentMap, CustomToken } from "nobodyreads";

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
  }: Props = $props();

  function isHexColor(value: string): boolean {
    return /^#[0-9a-fA-F]{3,8}$/.test(value);
  }

  // Refs handed to the existing createSiteEditor orchestrator. The heavy
  // template/preview/token/component logic stays in that proven module; this
  // island just owns the markup and wiring (no more global <script> + entry).
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
    });
    return () => instance.destroy();
  });
</script>

<form
  method="POST"
  action={`${layoutBase}/save`}
  class="editor-form editor-form--site"
  bind:this={formEl}
>
  <div class="editor-list-header">
    <h2>Theme Editor</h2>
    <div class="editor-actions">
      <button type="submit" class="btn btn-primary">Save draft</button>
      <span bind:this={saveStatus} class="editor-save-status" aria-live="polite">Ready</span>
    </div>
  </div>

  <div class="editor-tabs editor-tabs--site" bind:this={tabsEl}>
    <button type="button" class="editor-tab active" data-tab="html">HTML</button>
    <button type="button" class="editor-tab" data-tab="css">CSS</button>
    <button type="button" class="editor-tab" data-tab="js">JS</button>
    <button type="button" class="editor-tab" data-tab="tokens">Tokens</button>
    <button type="button" class="editor-tab" data-tab="components">Components</button>
    <button type="button" class="editor-tab" data-tab="advanced">Advanced</button>
    <button type="button" class="editor-tab" data-tab="preview">Preview</button>
  </div>

  <input type="hidden" name="template" bind:this={templateHidden} value={templateJson} />

  <div class="site-editor">
    <!-- HTML Layout tab -->
    <div class="site-editor-pane" data-pane="html">
      <label for="site-html">Layout HTML</label>
      <details class="editor-tokens">
        <summary>Available tokens</summary>
        <div class="editor-tokens-body">
          <p class="hint">Use these tokens in your HTML layout. They will be replaced with actual content at render time.</p>
          <ul class="editor-token-list">
            {#each builtinTokens as { token, description }}
              <li><code>{token}</code> — {description}</li>
            {/each}
            {#each customTokens as t}
              <li><code>{`{{${t.key}}}`}</code> — {t.label} (custom)</li>
            {/each}
          </ul>
          {#if !layoutHtml}
            <p class="hint" style="margin-top: 0.5rem">
              No custom HTML set. The generated layout from your section config is shown below.
              Edit it to start customizing, or leave empty to use the auto-generated layout.
            </p>
          {/if}
        </div>
      </details>
      <textarea bind:this={htmlInput} id="site-html" name="layoutHtml" rows="24" class="editor-textarea" spellcheck="false">{layoutHtml || generatedHtml}</textarea>
    </div>

    <!-- CSS tab -->
    <div class="site-editor-pane hidden" data-pane="css">
      <label for="site-css">Custom CSS</label>
      <p class="hint">Additional CSS appended after the generated theme styles. Use CSS variables from your design tokens.</p>
      <textarea bind:this={cssInput} id="site-css" name="customCss" rows="24" class="editor-textarea" spellcheck="false">{customCss}</textarea>
    </div>

    <!-- JS tab -->
    <div class="site-editor-pane hidden" data-pane="js">
      <label for="site-ts">Custom JavaScript</label>
      <p class="hint">Runs as a module script on every page. Use with caution.</p>
      <textarea bind:this={tsInput} id="site-ts" name="customJs" rows="24" class="editor-textarea" spellcheck="false">{customJs}</textarea>
    </div>

    <!-- Custom Tokens tab -->
    <div class="site-editor-pane hidden" data-pane="tokens">
      <label>Custom Tokens</label>
      <p class="hint">
        Define reusable text slots for your layout. Token keys become <code>{'{{key}}'}</code> placeholders in your HTML.
        Token <strong>values</strong> are edited under <a href={`${adminBase}/editor/site`}>Settings → Site identity</a>.
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

    <!-- Components tab -->
    <div class="site-editor-pane hidden" data-pane="components">
      <label>Components</label>
      <p class="hint">Customize layout component variants and design tokens. Changes update the preview instantly.</p>

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

    <!-- Advanced (raw JSON) tab -->
    <div class="site-editor-pane hidden" data-pane="advanced">
      <label for="site-json">Raw Template JSON</label>
      <p class="hint">Edit the full template definition as JSON. Changes here override all other tabs. For advanced users only.</p>
      <textarea bind:this={jsonInput} id="site-json" name="templateJson" rows="24" class="editor-textarea" spellcheck="false">{templateJson}</textarea>
    </div>

    <!-- Preview tab -->
    <div class="site-editor-pane hidden" data-pane="preview">
      <div class="editor-preview-label">
        Preview
        <a href={previewUrl} target="_blank" rel="noreferrer" class="btn btn-ghost">Open in new tab</a>
      </div>
      <iframe bind:this={preview} id="site-preview" title="Site preview" data-preview-url={previewUrl}></iframe>
    </div>
  </div>
</form>
