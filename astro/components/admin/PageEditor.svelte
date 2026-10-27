<script lang="ts">
  import { onMount, tick } from "svelte";
  import { fade, fly } from "svelte/transition";
  import type { Crepe as CrepeType } from "@milkdown/crepe";
  import "@milkdown/crepe/theme/common/style.css";
  import "@milkdown/crepe/theme/frame.css";
  import type { Page, PageKind, PostFormat } from "nobodyreads";
  import { altFromName, altWithDefaultWidth, imageMarkdown } from "nobodyreads/image-markdown";
  import { embedToken } from "nobodyreads/embed-token";
  import { slugify } from "nobodyreads/slugify";
  import MediaPicker from "./MediaPicker.svelte";
  import CollectionPicker from "./CollectionPicker.svelte";
  import EpisodeAudio from "./EpisodeAudio.svelte";
  import LinkPicker from "./LinkPicker.svelte";
  import PublishDialog from "./PublishDialog.svelte";

  interface Props {
    page?: Page;
    editorBase?: string;
    adminBase?: string;
    /** Owner-only draft preview base, e.g. "/alice/preview". Empty hides Preview. */
    previewBase?: string;
    kind?: PageKind;
    /** Format of a new post (the create menu's `?format=`); an existing page brings its own. */
    format?: PostFormat;
    /** Every post format, for the top bar's format switch. */
    formats?: { id: PostFormat; label: string }[];
    /**
     * The resolved site name. The home page's title mirrors it rather than
     * being separately editable — see the title field below.
     */
    siteName?: string;
    /** Public site root ("/" or "/alice"), for the published URL. */
    siteBase?: string;
    /** Verified subscribers — how many people a publish email reaches. */
    subscriberCount?: number;
    /** Whether subscriber email can be sent for this site. */
    emailEnabled?: boolean;
  }

  let {
    page,
    editorBase = "/admin/editor",
    adminBase = "/admin",
    previewBase = "",
    kind: kindProp,
    format: formatProp = "text",
    formats = [],
    siteName = "",
    siteBase = "/",
    subscriberCount = 0,
    emailEnabled = false,
  }: Props = $props();

  const isNew = !page;
  const kind: PageKind = page?.kind ?? kindProp ?? "post";
  const kindLabel = kind === "home" ? "Home" : kind === "page" ? "Page" : "Post";

  const uploadUrl = `${adminBase}/media/upload`;
  const saveUrl = `${editorBase}/save`;

  const p: Page = page ?? ({
    id: "",
    slug: kind === "home" ? "home" : "",
    title: "",
    content: "",
    excerpt: "",
    tags: [],
    date: new Date().toISOString().slice(0, 10),
    published: false,
    kind,
    nav: undefined,
    commentsEnabled: true,
    inFeed: true,
    accessTier: "public",
    priceAmount: null,
    format: formatProp,
    episode: null,
  } as Page);

  // --- Form state ---
  let currentId = $state(p.id);
  // The home page's title is a mirror of the site name, so prefer the live
  // setting over the stored copy: saving then refreshes a mirror that drifted.
  let title = $state(kind === "home" ? siteName || p.title : p.title);
  let slug = $state(p.slug);
  let excerpt = $state(p.excerpt ?? "");
  let tags = $state((p.tags ?? []).join(", "));
  let date = $state((p.date ?? "").slice(0, 10));
  let published = $state(p.published);
  let navLabel = $state(p.nav?.label ?? "");
  let navOrder = $state(p.nav?.order != null ? String(p.nav.order) : "");
  let commentsEnabled = $state(p.commentsEnabled ?? true);
  let inFeed = $state(p.inFeed ?? true);
  let accessTier = $state<"public" | "members" | "paid">(
    (p.accessTier as "public" | "members" | "paid") ?? "public",
  );
  // Held in major units as typed ("3.50"); the server converts to cents.
  let priceAmount = $state(
    p.priceAmount != null ? (p.priceAmount / 100).toFixed(2) : "",
  );
  let seoOgImage = $state(p.seo?.ogImage ?? "");
  let seoTwitterCard = $state<"summary" | "summary_large_image">(p.seo?.twitterCard ?? "summary");
  // Format: what the post is made of. An audio draft stays audio on the server
  // before its file exists; only publishing needs the file (see openPublish).
  // Switching back to text keeps the chosen file here, so switching again
  // re-attaches it.
  let format = $state<PostFormat>(p.format ?? (p.episode ? "audio" : "text"));
  let audioMediaId = $state(p.episode?.audioMediaId ?? "");
  let episodeNumber = $state(p.episode?.number != null ? String(p.episode.number) : "");
  let seasonNumber = $state(p.episode?.season != null ? String(p.episode.season) : "");

  // --- Publishing ----------------------------------------------------------
  /** When subscribers were emailed about this post; null = never (ADR 0002). */
  let notifiedAt = $state<string | null>(p.notifiedAt ?? null);
  let publishOpen = $state(false);
  let publishPhase = $state<"confirm" | "live">("confirm");
  let publishBusy = $state(false);
  /** The dialog's "Email to N subscribers" box. */
  let notifyChoice = $state(false);
  /** Whether the publish that just happened sent the email (for "It's live"). */
  let justEmailed = $state(false);
  let sendingNow = $state(false);
  /** The last save's failure, shown inside the publish dialog (it covers toasts). */
  let saveError = $state("");

  // --- AI cover image ------------------------------------------------------
  let coverPanelOpen = $state(false);
  let coverPromptText = $state("");
  let coverDrafting = $state(false);
  let coverGenerating = $state(false);
  let coverError = $state("");
  /** Held for review before the author commits it as the Share image. */
  let generatedCoverUrl = $state<string | null>(null);
  let content = $state(p.content ?? "");

  /**
   * Embedded collections that no longer resolve.
   *
   * A collection that was deleted, or never published, leaves the page
   * rendering empty space where the embed is, and nothing on the page can say
   * so — a note there would be addressed to a reader, who cannot act on it.
   * Checked here instead, beside the text the author can actually fix.
   */
  let unresolvedViews = $state<string[]>([]);
  let lintTimer: ReturnType<typeof setTimeout> | undefined;

  async function runLint() {
    // Cheap guard: no token, nothing to resolve, no request.
    if (!content.includes("{{collection:")) {
      unresolvedViews = [];
      return;
    }
    try {
      const res = await fetch(`${editorBase}/lint`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) return;
      unresolvedViews = ((await res.json()) as { unresolvedViews?: string[] }).unresolvedViews ?? [];
    } catch {
      // A check that cannot run says nothing rather than crying wolf.
    }
  }

  function scheduleLint() {
    if (lintTimer) clearTimeout(lintTimer);
    lintTimer = setTimeout(runLint, 600);
  }

  // Re-check whenever the body changes, and once on load so an author opening
  // a page that broke while they were away is told immediately.
  $effect(() => {
    void content;
    scheduleLint();
  });
  let slugManuallyEdited = false;

  let editorReady = $state(false);
  let sourceMode = $state(false);
  let switchingMode = $state(false);
  let pickerOpen = $state(false);
  // Which field an open MediaPicker selection should land in: the post body
  // (inserted at the caret) or the Share image field (replaces its value).
  let pickerTarget: "body" | "seo" | "pick" = "body";
  let resolvePick: ((url: string | null) => void) | null = null;
  let collectionPickerOpen = $state(false);
  let linkPickerOpen = $state(false);
  // Which tab the link picker opens on — set by the slash item that opened it.
  let linkPickerKind = $state<"post" | "page">("post");

  // --- Chrome state --------------------------------------------------------
  let drawerOpen = $state(false);
  let helpOpen = $state(false);
  let focusMode = $state(false);

  /**
   * Without JS nothing can open the drawer, which would make every setting in
   * it unreachable — the fields still submit, but an author could not change
   * them. This unpins the panel so it renders as a plain block below the
   * canvas. Browsers with JS ignore <noscript> content entirely.
   */
  const noJsDrawerCss =
    "<noscript><style>" +
    ".nbr-drawer{position:static;transform:none;visibility:visible;width:auto;" +
    "pointer-events:auto;box-shadow:none;border-left:0;border-top:1px solid var(--nr-border)}" +
    ".nbr-drawer-head button,.nr-help-disc{display:none}" +
    "</style></noscript>";

  let formEl: HTMLFormElement;
  let crepeMount: HTMLElement;
  let sourceEl: HTMLTextAreaElement;
  let drawerEl = $state<HTMLElement | undefined>();
  let settingsBtnEl = $state<HTMLButtonElement | undefined>();
  let crepe: CrepeType | null = null;

  function onTitleInput() {
    if (isNew && kind !== "home" && !slugManuallyEdited) {
      slug = slugify(title);
    }
  }

  // --- Save / autosave / toast ---------------------------------------------
  let saving = $state(false);
  let baselineInitialized = false;
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let toast = $state<{ message: string; type: "info" | "success" | "error" } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string, type: "info" | "success" | "error" = "info", duration = 2500) {
    toast = { message, type };
    if (toastTimer) clearTimeout(toastTimer);
    if (duration > 0) toastTimer = setTimeout(() => (toast = null), duration);
  }

  // Snapshot used to tell whether anything changed since the last save, so
  // autosave only fires on real edits (not on load-time Markdown normalization).
  function snapshot() {
    return JSON.stringify({ content, title, slug, excerpt, tags, date, navLabel, navOrder, published, commentsEnabled, inFeed, accessTier, priceAmount, seoOgImage, seoTwitterCard, format, audioMediaId, episodeNumber, seasonNumber });
  }
  // $state, so the status pill re-derives when a save moves the baseline.
  let baseline = $state(snapshot());

  const dirty = $derived(snapshot() !== baseline);

  /**
   * The top bar's status line. Autosave is deliberately silent, so the amber
   * "unsaved" state is the only thing telling an author work is pending.
   */
  const status = $derived.by(() => {
    if (saving) return { tone: "", text: "Saving…" };
    if (dirty) return { tone: "is-unsaved", text: "Unsaved changes" };
    return {
      tone: published ? "is-live" : "is-saved",
      text: published ? "Published · saved" : "Draft · saved",
    };
  });

  const wordCount = $derived(content.trim() ? content.trim().split(/\s+/).length : 0);

  /** The page's public path — what the breadcrumb shows. */
  const pagePath = $derived(
    kind === "home" ? "/" : kind === "post" ? `posts/${slug}` : slug,
  );

  // Where readers will find it. The origin is only known in the browser, so the
  // server render shows the site-relative path until the island mounts.
  let origin = $state("");
  const publicUrl = $derived(
    `${origin}${siteBase.replace(/\/$/, "")}/${kind === "home" ? "" : pagePath}`,
  );

  const previewHref = $derived(
    previewBase && (kind === "home" || slug)
      ? `${previewBase}/${kind === "home" ? "" : pagePath}`
      : "",
  );

  function isValid() {
    return title.trim().length > 0 && (kind === "home" || slug.trim().length > 0);
  }

  function buildBody(opts: { notify?: boolean } = {}): URLSearchParams {
    const body = new URLSearchParams();
    body.set("id", currentId ?? "");
    body.set("kind", kind);
    body.set("title", title);
    body.set("slug", kind === "home" ? slug || "home" : slug);
    body.set("excerpt", excerpt);
    body.set("tags", tags);
    body.set("date", date);
    if (published) body.set("published", "on");
    if (opts.notify) body.set("notify", "on");
    body.set("nav_label", navLabel);
    body.set("nav_order", navOrder);
    body.set("comments_enabled", commentsEnabled ? "on" : "off");
    body.set("in_feed", inFeed ? "on" : "off");
    body.set("access_tier", accessTier);
    body.set("price_amount", accessTier === "paid" ? priceAmount : "");
    body.set("seo_og_image", seoOgImage);
    body.set("seo_twitter_card", seoTwitterCard);
    if (kind === "post") {
      body.set("content_type", format === "audio" ? "audio" : "post");
      body.set("audio_media_id", format === "audio" ? audioMediaId : "");
      body.set("episode_number", episodeNumber);
      body.set("season_number", seasonNumber);
    }
    body.set("content", content);
    return body;
  }

  /** The save on the wire, if any — so a deliberate save can wait for it. */
  let inflightSave: Promise<boolean> | null = null;

  /**
   * Save now. Resolves true when the server accepted it. A call while another
   * save is on the wire is dropped (resolves false), as autosave expects; a
   * caller that must not be dropped awaits `inflightSave` first.
   */
  function save(opts: { label?: string; notify?: boolean } = {}): Promise<boolean> {
    if (inflightSave) return Promise.resolve(false);
    inflightSave = saveNow(opts).finally(() => (inflightSave = null));
    return inflightSave;
  }

  async function saveNow(opts: { label?: string; notify?: boolean }): Promise<boolean> {
    const { label } = opts;
    if (!isValid()) {
      if (label) showToast("Add a title and address before saving", "error");
      return false;
    }
    saving = true;
    saveError = "";
    try {
      const res = await fetch(saveUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body: buildBody({ notify: opts.notify }),
      });
      if (res.redirected && res.url.includes("/admin/login")) {
        window.location.assign(res.url);
        return false;
      }
      if (!res.ok) {
        // The server explains rejections it understands (an episode with no
        // audio, a duplicate home page); show that rather than a status code.
        const failure: unknown = await res.json().catch(() => null);
        const message =
          failure && typeof failure === "object" && "error" in failure && typeof failure.error === "string"
            ? failure.error
            : `Save failed (${res.status})`;
        throw new Error(message);
      }
      const data = (await res.json().catch(() => ({}))) as { id?: string; notifiedAt?: string | null };
      // A freshly-created page: adopt its id so later saves update it, and
      // reflect the canonical URL without a reload.
      if (data.id && !currentId) {
        currentId = data.id;
        history.replaceState(null, "", `${editorBase}/${data.id}`);
      }
      if (data.notifiedAt !== undefined) notifiedAt = data.notifiedAt;
      baseline = snapshot();
      // The status pill already reads "saved", so only deliberate actions
      // announce themselves — a toast per autosave is noise.
      if (label) showToast(label, "success");
      return true;
    } catch (err) {
      saveError = err instanceof Error ? err.message : "Save failed";
      showToast(saveError, "error", 4000);
      return false;
    } finally {
      saving = false;
    }
  }

  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      if (saving || !dirty || !isValid()) return;
      save();
    }, 2500);
  }

  // Any edit to content or metadata (re)arms the autosave timer. The dirty
  // check inside keeps load-time and no-op changes from saving.
  $effect(() => {
    void [title, slug, excerpt, tags, date, navLabel, navOrder, content, published, commentsEnabled, inFeed, accessTier, priceAmount, seoOgImage, seoTwitterCard, format, audioMediaId, episodeNumber, seasonNumber];
    if (editorReady) scheduleAutosave();
  });

  /** Open the publish dialog — the only way a draft goes live. */
  function openPublish() {
    if (!isValid()) {
      showToast("Add a title and address before publishing", "error");
      return;
    }
    // The server refuses this too; saying so here keeps the dialog from
    // offering a publish that cannot succeed.
    if (kind === "post" && format === "audio" && !audioMediaId) {
      showToast("Add the episode's audio before publishing — or switch the post to text.", "error", 5000);
      return;
    }
    notifyChoice = kind === "post" && emailEnabled && subscriberCount > 0 && !notifiedAt;
    saveError = "";
    publishPhase = "confirm";
    publishOpen = true;
  }

  async function confirmPublish() {
    publishBusy = true;
    try {
      // An autosave on the wire would make this save a no-op; let it land first.
      if (inflightSave) await inflightSave;
      const emailing = notifyChoice && kind === "post" && emailEnabled && subscriberCount > 0 && !notifiedAt;
      published = true;
      const ok = await save({ notify: emailing });
      if (!ok) {
        published = false;
        return;
      }
      justEmailed = emailing && notifiedAt !== null;
      publishPhase = "live";
    } finally {
      publishBusy = false;
    }
  }

  function closePublish() {
    publishOpen = false;
  }

  async function unpublish() {
    published = false;
    if (!(await save({ label: "Unpublished" }))) published = true;
  }

  /** "Email subscribers now" for a live post that was never emailed. */
  async function sendNow() {
    if (!currentId || sendingNow) return;
    sendingNow = true;
    try {
      const res = await fetch(`${editorBase}/notify/${currentId}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { notifiedAt?: string; error?: string };
      if (!res.ok || !data.notifiedAt) throw new Error(data.error || `Sending failed (${res.status})`);
      notifiedAt = data.notifiedAt;
      showToast(`Emailing ${subscriberCount} subscriber${subscriberCount === 1 ? "" : "s"}`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sending failed", "error", 4000);
    } finally {
      sendingNow = false;
    }
  }

  // Save button submits the form; intercept for AJAX. Delete keeps its normal
  // POST navigation. Without JS, the form posts and the server redirects.
  function onFormSubmit(e: SubmitEvent) {
    const submitter = e.submitter as HTMLElement | null;
    if (submitter?.getAttribute("formaction")?.includes("/delete/")) return;
    e.preventDefault();
    save({ label: "Draft saved" });
  }

  // --- Drawer --------------------------------------------------------------
  function openDrawer() {
    drawerOpen = true;
    // Move focus into the panel so Tab walks the settings, not the canvas.
    tick().then(() => drawerEl?.focus());
  }

  function closeDrawer() {
    drawerOpen = false;
    settingsBtnEl?.focus();
  }

  async function uploadImage(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      body: fd,
    });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.url as string;
  }

  // --- Image insertion -----------------------------------------------------
  // Two paths, because the two modes hold the document in different places:
  // Crepe owns a ProseMirror doc, Source mode is a plain textarea.

  async function insertImageWysiwyg(url: string, name: string) {
    if (!crepe) return;
    const { editorViewCtx } = await import("@milkdown/kit/core");
    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const imageType = view.state.schema.nodes.image;
      if (!imageType) return;
      const node = imageType.create({ src: url, alt: altWithDefaultWidth(name) });
      view.dispatch(view.state.tr.replaceSelectionWith(node, false).scrollIntoView());
      view.focus();
    });
    // markdownUpdated also fires, but it is debounced 200ms — sync now so an
    // immediate Source toggle or save sees the image.
    content = crepe.getMarkdown();
  }

  async function insertImageSource(url: string, name: string) {
    const md = imageMarkdown(altFromName(name), url);
    const start = sourceEl?.selectionStart ?? content.length;
    const end = sourceEl?.selectionEnd ?? start;
    content = content.slice(0, start) + md + content.slice(end);
    await tick(); // let bind:value flush before moving the caret
    sourceEl?.focus();
    sourceEl?.setSelectionRange(start + md.length, start + md.length);
  }

  function insertImage({ url, name }: { url: string; name: string }) {
    pickerOpen = false;
    if (pickerTarget === "pick") {
      resolvePick?.(url);
      resolvePick = null;
      return;
    }
    if (pickerTarget === "seo") {
      seoOgImage = url;
      return;
    }
    return sourceMode ? insertImageSource(url, name) : insertImageWysiwyg(url, name);
  }

  function openPicker(target: "body" | "seo") {
    pickerTarget = target;
    pickerOpen = true;
  }

  // --- Collection insertion ------------------------------------------------
  // Same two-mode split as images above.

  async function insertCollectionWysiwyg(slug: string) {
    if (!crepe) return;
    const { editorViewCtx } = await import("@milkdown/kit/core");
    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const embedType = view.state.schema.nodes.view_embed;
      if (!embedType) return;
      // The node is built directly rather than typing the token: ProseMirror
      // input rules only fire on real keystrokes, so `viewEmbedInputRule` would
      // never see a programmatic insert and the token would stay plain text.
      const node = embedType.create({ slug });
      view.dispatch(view.state.tr.replaceSelectionWith(node, false).scrollIntoView());
      view.focus();
    });
    content = crepe.getMarkdown();
  }

  async function insertCollectionSource(slug: string) {
    const token = embedToken(slug);
    const start = sourceEl?.selectionStart ?? content.length;
    const end = sourceEl?.selectionEnd ?? start;
    content = content.slice(0, start) + token + content.slice(end);
    await tick(); // let bind:value flush before moving the caret
    sourceEl?.focus();
    sourceEl?.setSelectionRange(start + token.length, start + token.length);
  }

  function insertCollection({ slug }: { slug: string }) {
    collectionPickerOpen = false;
    return sourceMode ? insertCollectionSource(slug) : insertCollectionWysiwyg(slug);
  }

  // --- Internal links -------------------------------------------------------
  // A picker-inserted link carries the target's title as display text; the
  // [[id]] underneath points at the page itself, so the URL survives renames.

  async function insertLinkWysiwyg(id: string, label: string) {
    if (!crepe) return;
    const { editorViewCtx } = await import("@milkdown/kit/core");
    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const linkType = view.state.schema.nodes.wiki_link;
      if (!linkType) return;
      // Node built directly, not the typed token: ProseMirror input rules only
      // fire on real keystrokes (same reason as collection embeds above).
      const node = linkType.create({ target: id, label });
      view.dispatch(view.state.tr.replaceSelectionWith(node, false).scrollIntoView());
      view.focus();
    });
    content = crepe.getMarkdown();
  }

  async function insertLinkSource(id: string, label: string) {
    const token = `[[${id}|${label}]]`;
    const start = sourceEl?.selectionStart ?? content.length;
    const end = sourceEl?.selectionEnd ?? start;
    content = content.slice(0, start) + token + content.slice(end);
    await tick(); // let bind:value flush before moving the caret
    sourceEl?.focus();
    sourceEl?.setSelectionRange(start + token.length, start + token.length);
  }

  function insertLink({ id, title }: { id: string; title: string }) {
    linkPickerOpen = false;
    // "]" would end the token early; a label has no use for brackets anyway.
    const label = title.replace(/[[\]]/g, "").trim() || id;
    return sourceMode ? insertLinkSource(id, label) : insertLinkWysiwyg(id, label);
  }

  /** Draft an image prompt from the saved post's content (cheap text call, no image spend yet). */
  async function draftCoverPrompt() {
    if (!currentId || coverDrafting) return;
    coverDrafting = true;
    coverError = "";
    try {
      const res = await fetch(`${adminBase}/ai/cover-image/draft-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ postId: currentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.prompt) throw new Error(data.error || `Drafting failed (${res.status})`);
      coverPromptText = data.prompt;
    } catch (err) {
      coverError = err instanceof Error ? err.message : "Drafting failed";
    } finally {
      coverDrafting = false;
    }
  }

  /** Spend Comfy Cloud credits on the current (author-reviewed) prompt. */
  async function generateCoverImagePreview() {
    const prompt = coverPromptText.trim();
    if (!prompt || coverGenerating) return;
    coverGenerating = true;
    coverError = "";
    try {
      const res = await fetch(`${adminBase}/ai/cover-image/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || `Generation failed (${res.status})`);
      generatedCoverUrl = data.url as string;
    } catch (err) {
      coverError = err instanceof Error ? err.message : "Generation failed";
    } finally {
      coverGenerating = false;
    }
  }

  /** Adopt the generated image as the Share image — same field the picker sets. */
  function useGeneratedCover() {
    if (!generatedCoverUrl) return;
    seoOgImage = generatedCoverUrl;
    generatedCoverUrl = null;
    coverPanelOpen = false;
  }

  function closePicker() {
    pickerOpen = false;
    resolvePick?.(null);
    resolvePick = null;
  }

  /**
   * Open the picker and resolve with the chosen URL, or null if it was closed
   * without a choice. Used by controls that need the result back rather than
   * inserting at the caret — currently the image block's Replace button.
   */
  function pickImageUrl(): Promise<string | null> {
    resolvePick?.(null);
    pickerTarget = "pick";
    pickerOpen = true;
    return new Promise((resolve) => (resolvePick = resolve));
  }

  async function createCrepe(initial: string) {
    const [
      { Crepe },
      { upload, uploadConfig },
      { nobodyreadsMilkdownPlugins, nobodyreadsImageBlock, configureImageBlock },
      { commandsCtx },
      { clearTextInCurrentBlockCommand },
    ] = await Promise.all([
      import("@milkdown/crepe"),
      import("@milkdown/kit/plugin/upload"),
      import("nobodyreads/editor/milkdown"),
      import("@milkdown/kit/core"),
      import("@milkdown/kit/preset/commonmark"),
    ]);

    crepe = new Crepe({
      root: crepeMount,
      defaultValue: initial,
      features: {
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.AI]: false,
        // ImageBlock rewrites the image alt slot (for its aspect ratio), which
        // destroys our `![alt|400px|right]` size/align hints. Use plain
        // commonmark images so the alt text round-trips verbatim.
        [Crepe.Feature.ImageBlock]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: { text: "Keep writing, or press / for blocks…" },
        [Crepe.Feature.BlockEdit]: {
          /**
           * Regroup the slash menu as Basic · Media · Structure, ordered by how
           * often a post actually reaches for them (§6.02). Crepe ships them as
           * Text · List · Advanced in that order, which buries images below
           * task lists and calls a code block "advanced".
           *
           * The default items are rebuilt rather than redefined: `buildMenu`
           * runs after Crepe has populated the builder, so reading each item
           * back out keeps its `onRun` — reimplementing those would be a second
           * copy of Crepe's command wiring, drifting on every upgrade.
           */
          buildMenu: (builder: any) => {
            const imageMenuItem = {
              key: "image",
              label: "Image",
              icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.4"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4 17 4.5-4 3.5 3L16 12l4 4"/></svg>`,
              onRun: (menuCtx: any) => {
                // The typed "/" is still in the document; Crepe's own items
                // clear it before acting, so this has to as well.
                menuCtx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
                openPicker("body");
              },
            };

            const collectionMenuItem = {
              key: "collection",
              label: "Collection",
              icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1.4"/><rect x="3" y="12" width="18" height="3.2" rx="1.2"/><rect x="3" y="18" width="12" height="3.2" rx="1.2"/></svg>`,
              onRun: (menuCtx: any) => {
                menuCtx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
                collectionPickerOpen = true;
              },
            };

            const postLinkMenuItem = {
              key: "post-link",
              label: "Post link",
              icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`,
              onRun: (menuCtx: any) => {
                menuCtx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
                linkPickerKind = "post";
                linkPickerOpen = true;
              },
            };

            const pageLinkMenuItem = {
              key: "page-link",
              label: "Page link",
              icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`,
              onRun: (menuCtx: any) => {
                menuCtx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
                linkPickerKind = "page";
                linkPickerOpen = true;
              },
            };

            const take = (groupKey: string, itemKey: string) => {
              try {
                return builder
                  .getGroup(groupKey)
                  .group.items.find((item: any) => item.key === itemKey);
              } catch {
                return undefined;
              }
            };

            const layout: { key: string; label: string; items: any[] }[] = [
              {
                key: "basic",
                label: "Basic",
                items: [
                  take("text", "text"),
                  take("text", "h2"),
                  take("text", "h3"),
                  take("text", "quote"),
                  take("text", "divider"),
                ],
              },
              {
                key: "media",
                label: "Media",
                // Crepe only contributes its own image item when the ImageBlock
                // feature is on, and we keep that off so `![alt|400px|right]`
                // survives (see `features` above). Without this entry the Media
                // group would offer everything except the obvious thing.
                items: [imageMenuItem, collectionMenuItem, take("advanced", "code")],
              },
              {
                key: "links",
                label: "Links",
                items: [postLinkMenuItem, pageLinkMenuItem],
              },
              {
                key: "structure",
                label: "Structure",
                items: [
                  take("list", "bullet-list"),
                  take("list", "ordered-list"),
                  take("list", "task-list"),
                  take("advanced", "table"),
                ],
              },
            ];

            builder.clear();
            for (const group of layout) {
              const present = group.items.filter(Boolean);
              if (present.length === 0) continue;
              const added = builder.addGroup(group.key, group.label);
              for (const { key, ...item } of present) added.addItem(key, item);
            }
          },
        },
      },
    });
    crepe.editor
      .config((ctx) => {
        ctx.update(uploadConfig.key, (prev) => ({
          ...prev,
          uploader: async (files: FileList, schema: any) => {
            const image = schema.nodes.image;
            if (!image) return [];
            const nodes: any[] = [];
            for (const file of Array.from(files)) {
              if (!file.type.startsWith("image/")) continue;
              const url = await uploadImage(file);
              nodes.push(image.create({ src: url, alt: altWithDefaultWidth(file.name) }));
            }
            return nodes;
          },
        }));
      })
      .use(upload)
      .use(nobodyreadsMilkdownPlugins)
      .use(nobodyreadsImageBlock);
    // The image block's Replace button opens the same picker as everything
    // else; the plugin stays unaware of how media is stored or browsed.
    configureImageBlock({ onReplace: pickImageUrl });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        content = markdown;
      });
    });
    await crepe.create();
    // Sync state to the editor's normalized output and treat that as the
    // clean baseline (only on first load, so a Source-toggle keeps dirtiness).
    content = crepe.getMarkdown();
    if (!baselineInitialized) {
      baseline = snapshot();
      baselineInitialized = true;
    }
    editorReady = true;
  }

  /**
   * Switch between the visual editor and raw Markdown.
   *
   * Guarded because each direction tears down or rebuilds Crepe: a second
   * click landing mid-swap would destroy an editor that is still being
   * created, or create a second one over the first.
   */
  async function setSourceMode(next: boolean) {
    if (next === sourceMode || switchingMode) return;
    switchingMode = true;
    try {
      if (next) {
        if (crepe) {
          content = crepe.getMarkdown();
          await crepe.destroy();
          crepe = null;
        }
        sourceMode = true;
      } else {
        sourceMode = false;
        await tick();
        await createCrepe(content);
      }
    } finally {
      switchingMode = false;
    }
  }

  onMount(() => {
    origin = location.origin;
    createCrepe(content);
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save({ label: published ? "Saved" : "Draft saved" });
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        focusMode = !focusMode;
        return;
      }
      // One way out of everything, innermost first.
      // The publish dialog handles its own Esc (native <dialog> cancel).
      if (e.key === "Escape" && !publishOpen) {
        if (helpOpen) helpOpen = false;
        else if (drawerOpen) closeDrawer();
        else if (focusMode) focusMode = false;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (autosaveTimer) clearTimeout(autosaveTimer);
      if (toastTimer) clearTimeout(toastTimer);
      crepe?.destroy();
    };
  });
</script>

<main class="nbr-editor" class:is-focus={focusMode}>
  {@html noJsDrawerCss}
  <form method="POST" action={saveUrl} class="nbr-editor-form" bind:this={formEl} onsubmit={onFormSubmit}>
    <input type="hidden" name="id" value={currentId} />
    <input type="hidden" name="kind" value={kind} />
    {#if published}
      <input type="hidden" name="published" value="on" />
    {/if}

    <!--
      The top bar carries only what an author acts on: where they are, whether
      the work is saved, how much they have written, and the two or three things
      they might do next. Everything else lives in the drawer.
    -->
    <header class="nbr-topbar">
      <a class="nbr-topbar-back" href={editorBase} aria-label="Back to content">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>
      </a>

      <span class="nbr-breadcrumb" title={`${kindLabel} · ${pagePath}`}>
        {pagePath || `new ${kind}`}
      </span>

      <span class={`nr-status ${status.tone}`} aria-live="polite">
        <i class="nr-status-dot"></i>{status.text}
      </span>

      <!-- What the post is made of. Same button group as the mode switch, and
           for the same reason: named radios would ride along on a no-JS submit. -->
      {#if kind === "post" && formats.length > 1}
        <span class="nbr-modeswitch nbr-formatswitch" role="group" aria-label="Post format">
          {#each formats as f (f.id)}
            <button
              type="button"
              class="nbr-modeswitch-option"
              aria-pressed={format === f.id}
              onclick={() => (format = f.id)}
            >
              <span>{f.label}</span>
            </button>
          {/each}
        </span>
      {/if}

      <span class="nbr-topbar-spacer"></span>

      <span class="nbr-wordcount">{wordCount} {wordCount === 1 ? "word" : "words"}</span>

      <!--
        Which mode you are in, not what the button will do. A single toggle
        left that ambiguous: the icon showed the destination while the active
        styling showed the origin, so neither answered "where am I?".

        Buttons rather than the radio-based .nr-segmented: the topbar sits
        inside the editor's <form>, and named radios here would ride along on
        a no-JS submit.
      -->
      {#if editorReady}
        <span class="nbr-modeswitch" role="group" aria-label="Editor mode">
          <button
            type="button"
            class="nbr-modeswitch-option"
            aria-pressed={!sourceMode}
            disabled={switchingMode}
            onclick={() => setSourceMode(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h13"/></svg>
            <span>Visual</span>
          </button>
          <button
            type="button"
            class="nbr-modeswitch-option"
            aria-pressed={sourceMode}
            disabled={switchingMode}
            onclick={() => setSourceMode(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m8 8-4 4 4 4M16 8l4 4-4 4"/></svg>
            <span>Markdown</span>
          </button>
        </span>
      {:else}
        <!--
          Until Crepe is up the textarea is the only editor there is, and it
          looks exactly like Markdown mode — so say which it is rather than
          leaving a dead switch that implies the choice is available.
        -->
        <span class="nbr-modeswitch-loading" aria-live="polite">Loading editor…</span>
      {/if}

      {#if previewHref}
        <span class="nr-tip">
          <a
            class="nbr-icon-btn"
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            aria-describedby="tip-preview"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
          </a>
          <span class="nr-tip-panel" role="tooltip" id="tip-preview">
            <b class="nr-tip-label">Preview</b>
            <span class="nr-tip-desc">See this draft as a reader would, in a new tab.</span>
          </span>
        </span>
      {/if}

      <span class="nr-tip">
        <button
          type="button"
          class="nbr-icon-btn"
          bind:this={settingsBtnEl}
          onclick={openDrawer}
          aria-expanded={drawerOpen}
          aria-label={`${kindLabel} settings`}
          aria-describedby="tip-settings"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14M5 16h14"/><circle cx="9" cy="8" r="2"/><circle cx="15" cy="16" r="2"/></svg>
        </button>
        <span class="nr-tip-panel" role="tooltip" id="tip-settings">
          <b class="nr-tip-label">{kindLabel} settings</b>
          <span class="nr-tip-desc">Who can read it, tags, address, discussion.</span>
        </span>
      </span>

      {#if published}
        <button type="button" class="btn btn-primary btn-sm" onclick={() => save({ label: "Saved" })}>Update</button>
      {:else}
        <button type="button" class="btn btn-primary btn-sm" onclick={openPublish}>Publish…</button>
      {/if}
    </header>

    <!--
      The canvas runs the full width of the shell. The always-open metadata
      column this replaces split the author's attention with slug/excerpt/tags
      before they had written a sentence; all of it is one click away now.
    -->
    <div class="nbr-canvas">
      <div class="nbr-canvas-col">
        {#if kind === "home"}
          <!--
            No title field: the home page has no name of its own — the site's
            name is its name, it is set once in Design → Brand, and the header
            already renders it. Showing it here, editable or not, put something
            on the canvas that no visitor sees, which is the opposite of what
            this editor is for. An author who wants the name *in* the page
            writes {{siteName}} in the body like any other token.

            The hidden field only satisfies the schema's NOT NULL title; nothing
            renders it.
          -->
          <input type="hidden" name="title" value={title} />
        {:else}
          <label class="visually-hidden" for="title">Title</label>
          <input
            type="text"
            id="title"
            name="title"
            class="nbr-doc-title"
            placeholder="Title"
            bind:value={title}
            oninput={onTitleInput}
            required
          />
        {/if}

        {#if kind === "post" && format === "audio"}
          <EpisodeAudio
            {adminBase}
            bind:audioMediaId
            onError={(message) => showToast(message, "error", 5000)}
          />
        {/if}

        {#if unresolvedViews.length > 0}
          <p class="nbr-lint" role="status">
            {unresolvedViews.length === 1 ? "This collection renders" : "These collections render"}
            as nothing for a reader — deleted, or not published yet:
            {#each unresolvedViews as slug, i (slug)}<code>{slug}</code>{i < unresolvedViews.length - 1 ? ", " : ""}{/each}.
          </p>
        {/if}

        <div bind:this={crepeMount} class="nbr-milkdown" class:hidden={sourceMode}></div>

        <!-- Markdown source view + no-JS fallback; carries the form value. -->
        <textarea
          name="content"
          class="nbr-source"
          class:hidden={editorReady && !sourceMode}
          placeholder="Write your markdown here..."
          spellcheck="true"
          bind:this={sourceEl}
          bind:value={content}
        ></textarea>
      </div>
    </div>

    <!--
      Post settings. Every field stays inside the <form> so a no-JS submit still
      carries it — the drawer is presentation, not a separate document.
    -->
    {#if drawerOpen}
      <div
        class="nbr-drawer-scrim"
        role="presentation"
        onclick={closeDrawer}
        transition:fade={{ duration: 150 }}
      ></div>
    {/if}
    <aside
      class="nbr-drawer"
      class:is-open={drawerOpen}
      aria-label={`${kindLabel} settings`}
      tabindex="-1"
      bind:this={drawerEl}
    >
      <div class="nbr-drawer-head">
        <h2 class="nr-title nbr-drawer-title">{kindLabel} settings</h2>
        <button type="button" class="nbr-icon-btn" onclick={closeDrawer} aria-label="Close settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>

      <div class="nbr-drawer-body">
        {#if kind === "post"}
          <!-- Visibility first and clearest: it is the choice with consequences,
               and the one people open this drawer for. -->
          <fieldset class="nbr-field">
            <legend class="nr-eyebrow">Who can read this</legend>
            <div class="nbr-choices">
              <label class="nbr-choice">
                <input type="radio" name="access_tier" value="public" bind:group={accessTier} />
                <span class="nbr-choice-body">
                  <span class="nbr-choice-title">Public</span>
                  <span class="nbr-choice-desc">Anyone can read the whole post.</span>
                </span>
              </label>
              <label class="nbr-choice">
                <input type="radio" name="access_tier" value="members" bind:group={accessTier} />
                <span class="nbr-choice-body">
                  <span class="nbr-choice-title">Members</span>
                  <span class="nbr-choice-desc">
                    Anyone who has joined your plot, free or paying. Everyone else sees a teaser.
                  </span>
                </span>
              </label>
              <label class="nbr-choice">
                <input type="radio" name="access_tier" value="paid" bind:group={accessTier} />
                <span class="nbr-choice-body">
                  <span class="nbr-choice-title">Supporters</span>
                  <span class="nbr-choice-desc">
                    Paying readers only. Everyone else sees a teaser and a way to pay.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          {#if accessTier === "paid"}
            <div class="nbr-field">
              <label for="price_amount">Sell this post on its own <span class="hint">(optional)</span></label>
              <input
                id="price_amount"
                type="text"
                inputmode="decimal"
                placeholder="e.g. 3.00"
                bind:value={priceAmount}
              />
              <p class="hint">
                A one-off price for this post alone, on top of the subscription option.
                Leave empty to offer the subscription only.
              </p>
            </div>
          {/if}

          {#if published && emailEnabled}
            <div class="nbr-field">
              <span class="nr-eyebrow">Subscribers</span>
              {#if notifiedAt}
                <p class="hint">
                  Emailed to subscribers on
                  {new Date(notifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
                </p>
              {:else if subscriberCount > 0}
                <p class="hint">Not emailed — this post went out quietly. It can be emailed once.</p>
                <button type="button" class="btn btn-sm" onclick={sendNow} disabled={sendingNow}>
                  {sendingNow ? "Sending…" : `Email ${subscriberCount} subscriber${subscriberCount === 1 ? "" : "s"} now`}
                </button>
              {:else}
                <p class="hint">Not emailed. Nobody has subscribed yet — you can send it once people do.</p>
              {/if}
            </div>
          {/if}

          {#if accessTier !== "public" && !excerpt.trim()}
            <!-- A nudge, not a blocker: nothing here stops a publish. -->
            <p class="nbr-nudge">
              No summary set, so the teaser will be built from the first ~75 words.
              Write one below to control exactly what non-paying readers see.
            </p>
          {/if}

          {#if format === "audio"}
            <fieldset class="nbr-field">
              <legend class="nr-eyebrow">Episode</legend>
              <div class="nbr-episode-numbers">
                <div class="nbr-field">
                  <label for="episode_number">Number <span class="hint">(optional)</span></label>
                  <input id="episode_number" type="text" inputmode="numeric" pattern="[0-9]*" bind:value={episodeNumber} />
                </div>
                <div class="nbr-field">
                  <label for="season_number">Season <span class="hint">(optional)</span></label>
                  <input id="season_number" type="text" inputmode="numeric" pattern="[0-9]*" bind:value={seasonNumber} />
                </div>
              </div>
              <p class="hint">Podcast apps order and label episodes by these. The share image below doubles as the episode's cover art.</p>
            </fieldset>
          {/if}
        {/if}

        <div class="nbr-field">
          <label for="excerpt">Summary</label>
          <textarea id="excerpt" name="excerpt" rows="3" bind:value={excerpt}></textarea>
          <p class="hint">Shown in listings, the feed and search results.</p>
        </div>

        {#if kind === "post"}
          <div class="nbr-field">
            <label for="tags">Tags <span class="hint">(comma-separated)</span></label>
            <input type="text" id="tags" name="tags" bind:value={tags} />
          </div>
        {/if}

        {#if kind !== "home"}
          <div class="nbr-field">
            <label for="slug">Page address</label>
            <div class="nbr-slug-row">
              <span class="nbr-slug-prefix">{kind === "post" ? "posts/" : "/"}</span>
              <input
                type="text"
                id="slug"
                name="slug"
                bind:value={slug}
                oninput={() => (slugManuallyEdited = true)}
                required
                pattern="[a-z0-9-]+"
                title="Lowercase letters, numbers, and hyphens only"
              />
            </div>
            <p class="hint">Filled in from the title. Best changed before publishing, not after.</p>
          </div>
        {:else}
          <input type="hidden" name="slug" value={slug || "home"} />
        {/if}

        <div class="nbr-field">
          <label for="date">Date</label>
          <input type="date" id="date" name="date" bind:value={date} />
        </div>

        {#if kind === "post"}
          <div class="nbr-field">
            <label class="nbr-check">
              <input type="checkbox" bind:checked={commentsEnabled} />
              <span>Allow discussion</span>
            </label>
            <p class="hint">
              {commentsEnabled
                ? "Readers can comment and reply on this post."
                : "Comments are closed for this post."}
            </p>
          </div>

          <div class="nbr-field">
            <label class="nbr-check">
              <input type="checkbox" bind:checked={inFeed} />
              <span>Include in RSS feed</span>
            </label>
            <p class="hint">
              {inFeed
                ? "This post appears in your RSS / podcast feed."
                : "This post is excluded from the feed."}
            </p>
          </div>

          <details class="nbr-field nbr-advanced">
            <summary>Social sharing</summary>
            <div class="nbr-field">
              <label for="seo_og_image">Share image</label>
              <p class="hint">
                Defaults to the first image in the post, or the site default if there isn't one.
              </p>
              <div class="nbr-image-row">
                <input
                  type="text"
                  id="seo_og_image"
                  name="seo_og_image"
                  placeholder="https://… or choose below"
                  bind:value={seoOgImage}
                />
                <button type="button" class="btn btn-sm btn-ghost" onclick={() => openPicker("seo")}>
                  Choose…
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-ghost"
                  onclick={() => (coverPanelOpen = !coverPanelOpen)}
                >
                  Generate with AI
                </button>
              </div>
              {#if seoOgImage}
                <img
                  src={seoOgImage}
                  alt="Share preview"
                  class="nbr-image-preview"
                  onerror={(e) => { (e.target as HTMLImageElement).hidden = true; }}
                />
              {/if}

              {#if coverPanelOpen}
                <div class="nbr-control">
                  <label class="nr-eyebrow" for="cover-prompt">Image prompt</label>
                  <textarea
                    id="cover-prompt"
                    class="nbr-ai-prompt"
                    rows="3"
                    bind:value={coverPromptText}
                    disabled={coverGenerating}
                    placeholder="Describe the cover image, or draft one from the post below"
                  ></textarea>

                  <div class="nbr-ai-actions">
                    <button
                      type="button"
                      class="btn btn-sm"
                      onclick={draftCoverPrompt}
                      disabled={!currentId || coverDrafting || coverGenerating}
                    >
                      {coverDrafting ? "Drafting…" : "Draft from post"}
                    </button>
                    <button
                      type="button"
                      class="btn btn-primary btn-sm"
                      onclick={generateCoverImagePreview}
                      disabled={coverGenerating || !coverPromptText.trim()}
                    >
                      {coverGenerating ? "Generating…" : generatedCoverUrl ? "Regenerate" : "Generate"}
                    </button>
                  </div>
                  {#if !currentId}
                    <p class="hint">Save the post first to draft a prompt from its content — or just write one above.</p>
                  {/if}
                  {#if coverError}
                    <p class="nbr-nudge">{coverError}</p>
                  {/if}

                  {#if generatedCoverUrl}
                    <img src={generatedCoverUrl} alt="Generated cover preview" class="nbr-image-preview" />
                    <div class="nbr-ai-actions">
                      <button type="button" class="btn btn-primary btn-sm" onclick={useGeneratedCover}>
                        Use this image
                      </button>
                      <button type="button" class="btn btn-sm" onclick={() => (generatedCoverUrl = null)}>
                        Discard
                      </button>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
            <div class="nbr-field">
              <label for="seo_twitter_card">Card style</label>
              <select id="seo_twitter_card" name="seo_twitter_card" bind:value={seoTwitterCard}>
                <option value="summary">Summary (small image)</option>
                <option value="summary_large_image">Large image</option>
              </select>
            </div>
          </details>
        {/if}

        {#if kind === "page" || kind === "home"}
          <details class="nbr-field nbr-advanced">
            <summary>Navigation</summary>
            <div class="nbr-field">
              <label for="nav_label">Nav label</label>
              <input type="text" id="nav_label" name="nav_label" bind:value={navLabel} />
            </div>
            <div class="nbr-field">
              <label for="nav_order">Nav order</label>
              <input type="number" id="nav_order" name="nav_order" bind:value={navOrder} />
            </div>
          </details>
        {/if}

        {#if !isNew}
          <div class="nbr-drawer-danger">
            <button
              type="submit"
              formaction={`${editorBase}/delete/${currentId}`}
              class="btn btn-danger btn-sm"
              onclick={(e) => { if (!confirm("Delete this page permanently?")) e.preventDefault(); }}
            >Delete {kindLabel.toLowerCase()}</button>
          </div>
        {/if}
      </div>

      <div class="nbr-drawer-foot">
        <button type="submit" class="btn btn-sm">{published ? "Save" : "Save draft"}</button>
        {#if published}
          <button type="button" class="btn btn-sm" onclick={unpublish}>Unpublish</button>
        {:else}
          <button type="button" class="btn btn-primary btn-sm" onclick={openPublish}>Publish…</button>
        {/if}
      </div>
    </aside>
  </form>

  <PublishDialog
    open={publishOpen}
    phase={publishPhase}
    busy={publishBusy}
    error={saveError}
    {kind}
    {format}
    {title}
    url={publicUrl}
    {subscriberCount}
    {emailEnabled}
    {notifiedAt}
    bind:accessTier
    bind:inFeed
    bind:navLabel
    bind:notify={notifyChoice}
    emailed={justEmailed}
    onPublish={confirmPublish}
    onClose={closePublish}
  />

  {#if focusMode}
    <p class="nbr-focus-hint" transition:fade={{ duration: 200 }}>Esc to bring everything back</p>
  {/if}

  <!-- Reopenable help. Everything explains itself, but only when asked. -->
  <button
    type="button"
    class="nr-help-disc"
    onclick={() => (helpOpen = !helpOpen)}
    aria-expanded={helpOpen}
    aria-label="Help"
  >?</button>

  {#if helpOpen}
    <aside class="nbr-help" transition:fly={{ y: 12, duration: 180 }} aria-label="Editor help">
      <div class="nbr-help-head">
        <span class="nr-eyebrow">Writing here</span>
        <button type="button" class="nbr-icon-btn" onclick={() => (helpOpen = false)} aria-label="Close help">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <dl class="nbr-help-list">
        <dt><kbd>/</kbd></dt>
        <dd>Insert an image, link, quote, code block, list or embed.</dd>
        <dt>Select text</dt>
        <dd>A formatting bar appears above the selection.</dd>
        <dt><kbd>⌘S</kbd></dt>
        <dd>Save a draft. Typing autosaves anyway.</dd>
        <dt><kbd>⌘⇧F</kbd></dt>
        <dd>Focus mode — hide everything but the words.</dd>
        <dt><code>[[page-id]]</code></dt>
        <dd>Link to another post or page — or press / and pick one.</dd>
        <dt><code>{"{{collection:slug}}"}</code></dt>
        <dd>Embed a collection of posts.</dd>
        <dt><code>![alt|400px|right]</code></dt>
        <dd>Size and align an image.</dd>
      </dl>
    </aside>
  {/if}

  {#if pickerOpen}
    <MediaPicker
      listUrl={`${adminBase}/media/list`}
      upload={uploadImage}
      onSelect={insertImage}
      onClose={closePicker}
      onError={(m) => showToast(m, "error", 4000)}
    />
  {/if}

  {#if collectionPickerOpen}
    <CollectionPicker
      listUrl={`${adminBase}/collections/list`}
      collectionsBase={`${adminBase}/collections`}
      onSelect={insertCollection}
      onClose={() => (collectionPickerOpen = false)}
      onError={(m) => showToast(m, "error", 4000)}
    />
  {/if}

  {#if linkPickerOpen}
    <LinkPicker
      listUrl={`${editorBase}/link-targets`}
      initialKind={linkPickerKind}
      onSelect={insertLink}
      onClose={() => (linkPickerOpen = false)}
    />
  {/if}

  {#if toast}
    <div class={`nbr-toast nbr-toast--${toast.type}`} role="status" aria-live="polite" transition:fade={{ duration: 150 }}>
      <span class="nbr-toast-dot"></span>{toast.message}
    </div>
  {/if}
</main>
