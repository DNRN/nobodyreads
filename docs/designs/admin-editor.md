# nobodyreads.me — Admin & Editor redesign

Design spec for the writing editor and the admin shell (nav, Design, Collections,
Settings). Companion to `plot-density.md` (reader-facing frontpage & post layouts).
Reference comp: `Editor Comps.dc.html` (sections numbered 00–12).

Theme: **Forest & Oat**. Same tokens as the reader redesign — this doc restates the
subset the admin uses.

---

## 1. Guiding philosophy

**Progressive disclosure.** Encourage writing/creating; keep power one step away, never
in the user's face. Every screen starts calm and reveals complexity only when reached for.

Four principles (comp footer):

1. **Blank by default** — a new page is a title and a cursor; no toolbar wall.
2. **Power on demand** — every function is one keystroke, hover, or drawer away.
3. **Everything explains itself** — rich tooltips + a reopenable `?` help panel + a
   3-step first-run tour teach tools in place. No manual.
4. **Complexity, contained** — media/layout/code controls live on the object they affect,
   using one repeated pattern so learning one teaches them all.

Recurring problem across the product: **crowded surfaces** (always-open metadata columns,
raw code panels, over-full sidebars). The fix is always the same — move secondary controls
into contextual bars, collapsible "Advanced" panels, or on-demand drawers, and give the
primary task the full canvas.

---

## 2. Type

- **Newsreader** (serif) — post titles, screen titles, site name, editorial voice. Weight 500, `letter-spacing:-0.02em`, `line-height:~1.1`.
- **Hanken Grotesk** — all UI: labels, buttons, body of controls, descriptions. 400–800.
- **IBM Plex Mono** — metadata, section eyebrows (uppercase, `letter-spacing:0.1–0.14em`), tokens, code, status text.

Body copy in previews and posts uses Newsreader or the reading serif; UI chrome never does.

---

## 3. Color tokens

CSS-var names as used in the comp frames. Set per-frame so light/dark are just different
var blocks on the same markup.

### Light

```
--canvas #f4f7f2   page/editor background
--bg     #eef1ec   app background / recessed wells
--nav    #e7ece4   left nav
--card   #f7f9f6   raised cards, menus, inputs
--ink    #23302a   primary text / titles
--body   #2f3c34   body text
--muted  #7c8a82   secondary text, inactive icons
--faint  #9aa89f   tertiary text, placeholders
--accent #40765b   primary action, active state
--bright #4e8a6b   "live/saved" dot, accent highlight
--border #dbe3da   hairlines
--strong #c3d0c8   stronger borders, input outlines
--chipbg #d7e7dd   accent chip / selected pill background
--chipfg #2f6249   accent chip text
--onacc  #ffffff   text on accent
```

### Dark

```
--bg     #141a17   --card #1f2823   --ink #e8efe9   --body #c6d5cb
--muted  #8fa096   --faint #6c7d73  --accent #6fb894 --bright #86c8a6
--border #26302a   --strong #39463f --chipbg #25382d --onacc #0f1512
```

### Utility / semantic

```
Dark surface (tooltips, selection toolbar, code blocks)  #1c2621  text #e8efe9
Unsaved / draft-pending                                  dot #d79a2b  text #a06a1f
Warning (missing alt text nudge)                          bg #fbf3d6  border #e6d79a  text #6b5b17
Destructive (delete icon on dark toolbar)                #f0a8a0
```

### Sample generated theme ("Field Journal", used in AI/Design previews only)

Paper `#f6f4ec`, ink `#2e4636`, accent `#5b8a6a`, gold `#c8a24a`. These are _example
output_, not product tokens.

---

## 4. Information architecture

Left nav, three groups (unchanged structure, one relocation + one rename):

```
CREATE     Home · Content · Media
CUSTOMIZE  Design · Collections          ← was: AI · Design · Views
MANAGE     Community · Moderation · Payments · Settings
```

Decisions:

- **AI folded into Design.** AI only ever produced a theme that landed in Design, so it's
  no longer a top-level item — it's Design's first tab (shows a small "AI" badge on the
  Design nav row). Design tabs: **AI · Theme · Layout · Components** (+ **Brand** first,
  see §7). "Edit template code" is a right-aligned escape hatch on the tab bar.
- **Views → Collections.** "View" is a DB term; a Collection is "a reusable, embeddable
  set of posts." (Alternatives considered: Feeds, Lists.) Embed token renamed
  `{{view:slug}}` → `{{collection:slug}}`.
- **Site identity split by purpose** (was orphaned under `/editor/site`, only linked from
  Settings). Seen _on_ the site → **Design › Brand** (name, tagline, logo). Seen
  _elsewhere_ → **Settings › Sharing & SEO** (favicon, default social/OG image).

---

## 5. Global UI patterns

- **Editor/screen top bar** carries only what you act on: breadcrumb, status pill,
  word/secondary count, 1–2 outlined secondary actions (Preview, Settings/Save draft),
  one accent primary (Publish). Everything else is elsewhere.
- **Status + unsaved indicator.** `● Draft · saved` (bright dot) vs `● Unsaved changes`
  (amber `#d79a2b` dot, `#a06a1f` text). Autosave is silent; the amber state signals
  pending work before an explicit Save draft / Publish.
- **Save is a two-step, and non-destructive.** Changes save as a _draft_ first; Publish is
  a separate, deliberate accent action. Theme edits also support **Saved trials** — bank a
  named look (e.g. "Field Journal"), keep others alongside, switch, publish only when sure.
- **Live preview** accompanies every generative/visual surface (AI, Theme, Layout,
  Components, Brand, Collection create). One preview panel; visual edits and hand code both
  render into it, so cause/effect is always visible. Small "Regenerate" where AI is involved.
- **Contextual controls, not global.** Formatting appears on text selection; block controls
  (image/embed/code/callout) appear on the block on hover, as one compact dark bar
  (`#1c2621`) — same grammar for every block type.
- **Rich tooltips** on hover/focus: label + one-line plain-language description + keyboard
  shortcut. This is how users graduate to shortcuts on their own.
- **Reopenable `?` help** — accent disc, bottom-right of the canvas. First-run gets a
  dismissible 3-step coach tour ("Tip 1 of 3").
- **Drawers for "about the post," tabs for "about the site."** Per-post shipping settings
  (visibility, cover, tags, slug, comments, schedule) slide in from the right on demand.
  Site-wide customization uses Design's tabs.
- **Advanced = opt-in, never removed.** Raw SQL/JS/HTML/CSS always exist behind an
  "Advanced" / "Edit template code" affordance, labelled (e.g. "Written by AI"), editable,
  with safety notes — beginners never see it, power users lose nothing.
- **Gentle nudges, not blockers.** e.g. missing alt text shows a soft warning card; it
  never prevents publishing.
- **Layout:** frames are inline-styled, ~1000px content width for admin screens, 680px
  reading measure for the canvas. Cards `border-radius:10–12px`; controls `7–8px`; pills
  `20px`. Flex/grid + `gap` throughout.

---

## 6. Writing editor (comp 00–06)

- **00 Shell** — app header (wordmark, View site, theme toggle, Sign out) + left nav +
  editor. **No metadata column** — the canvas runs full width (this was the core fix; the
  old editor split attention with an always-open slug/excerpt/tags/status column).
- **01 Canvas** — slim top bar; single centered column; block gutter handle (+ / drag) in
  the margin; placeholder line "Keep writing, or press `/`…"; first-run coach mark.
- **02 Slash menu (`/`)** — insert anything. Grouped Basic / Media / Structure, ordered by
  frequency. Each row: icon + name + one-line description + markdown shortcut. Filters as
  you type.
- **03 Selection toolbar** — appears above a text selection. Only the six reached-for:
  bold, italic, link, highlight, inline code, turn-into (H2/quote/list). Dark bar; rich
  tooltip per control. Disappears on deselect.
- **04 Media/image block** — contextual hover bar (align L/center/full, Replace, Alt,
  delete). Caption field. Soft alt-text nudge if empty. Same pattern reused by embeds,
  code, callouts.
- **05 Post settings drawer** — slides from right. **Visibility** first and clearest:
  Public · **Members** (anyone who's joined the plot, free or paying) · Supporters only
  (paying) · Unlisted. Then cover, tags, page address (slug auto from title), discussion
  toggle. Footer: Publish now / Schedule. Sensible defaults so the drawer can be ignored.
- **06 Focus mode** — one shortcut hides all chrome; column centers; faint "Esc to bring
  everything back" hint. `/` and selection still work, just invisible. Reading-type
  specimen so writing matches the published feel.

---

## 7. Design (comp 07, 08, 08b, 08c, 11)

Tab bar: **Brand · AI · Theme · Layout · Components** + "Edit template code".
Three-part shell reused across tabs: **controls (left) · live preview (right)**
(Components adds a component list rail, so: list · specimen · controls).

- **Brand (11)** — Site name, Tagline, Logo (upload/from library). Live header preview.
  Notes favicon/social live in Settings. First tab: identity before styling. Feeds
  `{{siteName}}`, `{{siteTagline}}`, `{{siteLogo}}` tokens.
- **AI (07)** — "Describe your space" prompt + starter chips (warm & literary, brutalist
  zine, calm podcast, minimal mono). Returns a **reviewable proposal** — Palette / Type /
  Layout, each with a "Tweak" pill (outlined + sliders icon) that opens the same visual
  controls as the other tabs — beside a live site preview. Actions: Regenerate /
  **Apply to Design**. Nothing touches the live site until applied.
- **Theme (08)** — visual-first: color tokens (swatch + name + hex), type pairing picker,
  density slider, corner radius. Live preview. **Saved trials** strip. Collapsed
  "Advanced — template code" drawer (HTML/CSS/JS/tokens) marked "for developers".
- **Layout (08b)** — structure not style: home arrangement (List/Grid/Cards), reading
  width slider, header contents toggles, per-post metadata chips (date, read more, tags,
  excerpt). Live home-page preview.
- **Components (08c)** — gallery of live specimens (buttons, post cards, tags, quotes, code
  blocks, subscribe form). Select one → shape/fill/weight controls. "Applies everywhere
  this component is used."

---

## 8. Collections (comp 09, 10) — formerly Views

- **09 List** — cards, each showing a mini render, the plain-language rule
  ("by tag · newest first · cards"), a copy-ready `{{collection:slug}}` token, live/draft
  status, edit/duplicate. Prominent "New collection". Keeps the calm "Nothing here yet"
  empty state.
- **10 Create/Edit** (one screen for both) — flips SQL-first to **describe-first**:
    - Sidebar collapses to a "← Collections" breadcrumb so create is a focused task.
    - **"What do you want to show?"** free-text (e.g. "My posts tagged fishing, newest
      first, as cards") + presets (All posts, By tag, Most liked, A series).
    - **"Build it"** — AI writes the SQL **and** the template; shows a live preview.
    - Name + slug (auto), embed token field.
    - **Advanced — query & template** panel: generated SQL + template, labelled
      "Written by AI", editable, with the read-only/tenant-scoped safety note. Preview stays
      in sync with hand edits.

Constraints carried from the real feature: single `SELECT`, tenant-scoped
(`:tenant_id`), read-only allowed tables (`page_public`, `post_like`, `comment`,
`content_view`, `media`); JS templates are self-hosting-only. AI generation respects these.

---

## 9. Settings (comp 12)

"The essentials. Nothing you don't need." After the identity split:

- Pointer: "Looking for name, tagline & logo? They moved to **Design · Brand**."
- **Sharing & SEO** — favicon (browser-tab icon) + default social image (1200×630, OG),
  with a real preview (browser tab chrome + social share card). This is the split-out home
  for the metadata half of the old "Site identity".
- **Email subscriptions** — "Send new posts to subscribers" toggle. Subscriber numbers
  live under Community.

---

## 10. Naming

- Product name / wordmark: **nobodyreads.** (accent dot); `.me` in the reader monogram.
- A user's blog space = a **plot** ("joined the plot", "your plot").
- Reusable post display = **Collection** (was View).
- Membership tiers referenced in visibility: **Members** (joined, free or paying) vs
  **Supporters** (paying).
- Voice: dry, self-aware, minimal ("Nobody reads it anyway — and that's the point.").

---

## 11. Open questions / decisions to confirm

- **Collections** vs Feeds vs Lists — rename not yet ratified.
- AI **Apply** → drop into Design's visual controls (current framing) vs publish directly.
- Site identity: split (current: Brand + Settings) vs all five fields together in Brand.
- Whether the first-run coach tour stays, or tooltips + `?` drawer suffice.
- Complex-editing priorities to detail next: **embeds, layout columns, links/footnotes**
  (only the image block is fully drawn so far; they share the block hover-bar grammar).
