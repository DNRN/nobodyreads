# Handoff: nobodyreads Admin UI Redesign ("Studio" direction)

## Overview
A calmer, less-cluttered redesign of the nobodyreads admin (the OSS engine that runs on
port 3000). It keeps the existing information architecture — fixed top header, fixed left
sidebar, main content area — but softens the visual language: airy spacing, rounded shapes,
gentle shadows, a sage-green accent, softened section labels, and light **+** dark themes.
The tone leans into the product's voice ("No feed. No algorithm.", "Nobody reads it anyway —
and that's the point.").

Covered screens: **Home / Dashboard, Content, Design (Theme Editor), Settings, Admin Login**,
plus soft empty-state placeholders for **Media, Views, AI, Community**.

## About the Design Files
The file in this bundle — `Nobodyreads Admin.dc.html` — is a **design reference created in
HTML**, a working prototype showing the intended look and behavior. It is **not production
code to copy directly**. The task is to **recreate this design in the nobodyreads codebase
using its existing patterns and libraries** (its current templating/JS setup, CSS
conventions, component structure). Treat the HTML/inline-styles here as a spec for layout,
color, type, spacing, copy, and interaction — not as files to ship.

> Note: the prototype uses CSS custom properties for theming and inline styles for layout
> (a constraint of the prototyping tool). In the real codebase, move these into whatever
> styling system already exists (CSS files, a token file, etc.).

## Fidelity
**High-fidelity.** Final colors, typography, spacing, radii, and interactions are all
specified below. Recreate the UI to match, using the codebase's existing libraries/patterns.

---

## Design Tokens

The theme is driven by CSS custom properties, with a `[data-theme="dark"]` override on a
wrapper element. Define these once and reference them everywhere.

### Light (default `:root`)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#EEF1EC` | App background + sidebar |
| `--surface` | `#F7F9F6` | Header bar |
| `--card` | `#FFFFFF` | Cards, panels, inputs-on-surface |
| `--ink` | `#23302A` | Primary text |
| `--muted` | `#7C8A82` | Secondary text |
| `--faint` | `#9AA79F` | Group labels, tertiary text |
| `--border` | `#E4EAE3` | All hairline borders |
| `--accent` | `#4E8A6B` | Primary actions, active states, links |
| `--accent-ink` | `#FFFFFF` | Text/icon on accent fills |
| `--accent-soft` | `#DDECE3` | Active nav pill bg, soft chips |
| `--accent-tint` | `#EEF6F1` | Hover washes, info panels |
| `--pos` | `#4E8A6B` | "published" status |
| `--pos-soft` | `#E7F0EA` | "published" badge bg |
| `--shadow` | `rgba(30,50,40,.26)` | Card drop shadows |
| `--code` | `#415147` | Code text |
| `--codebg` | `#F2F5F1` | Code panel bg |

### Dark (`[data-theme="dark"]`)
| Token | Value |
|---|---|
| `--bg` | `#141A17` |
| `--surface` | `#1A211D` |
| `--card` | `#1F2823` |
| `--ink` | `#E8EFE9` |
| `--muted` | `#8FA096` |
| `--faint` | `#6C7D72` |
| `--border` | `#2A342E` |
| `--accent` | `#6FB894` |
| `--accent-ink` | `#0F1512` |
| `--accent-soft` | `#25382D` |
| `--accent-tint` | `#1C2822` |
| `--pos` | `#6FB894` |
| `--pos-soft` | `#1E3329` |
| `--shadow` | `rgba(0,0,0,.5)` |
| `--code` | `#B9CABF` |
| `--codebg` | `#161C19` |

### Typography
- **UI font:** `'Hanken Grotesk', sans-serif` (weights 400/500/600/700/800). Google Fonts.
- **Monospace** (URLs, code, token chips): `'IBM Plex Mono', monospace` (400/500).
- Scale used:
  - Page title: 30–34px / 800 / letter-spacing `-0.025em`
  - Card title: 16–22px / 700
  - Body: 14.5–15.5px / 400–500
  - Secondary/meta: 13–14px / `--muted`
  - Uppercase group & section labels: 11–12.5px / 700 / letter-spacing `0.04–0.07em` / uppercase / `--faint` or `--muted` (this is the **softened** replacement for the old harsh mono labels)

### Spacing, radius, shape
- Main content padding: `44px 52px`; content max-width ~760–960px depending on screen.
- Radii: cards `16–20px`, pills/buttons `999px` or `10–12px`, nav items `12px`, big login card `24px`.
- Shadows: soft, low-opacity, large-blur, e.g. `0 8px 24px -18px var(--shadow)` for cards,
  `0 30px 60px -34px var(--shadow)` for the login card.
- Smooth color transitions on theme switch: `transition: background-color .35s, color .35s, border-color .35s`.
- Entrance animation `riseIn`: `opacity 0 → 1`, `translateY(10px) → 0`, ~`.4s ease`.

---

## Layout (shared shell)

- **Header** — sticky top, height `66px`, `--surface` bg, bottom `1px --border`. Left:
  wordmark `nobodyreads` in `--ink` 800 with a `--accent` period. Right (flex, gap 8px):
  "View site ↗" text button, a **theme toggle** (36px square, moon icon in light / sun icon
  in dark), and a "Sign out" pill (`--accent-soft` bg, `--ink`, weight 600).
- **Sidebar** — width `224px`, `--bg`, right `1px --border`, vertical flex gap 5px, padding
  `24px 16px`. Groups with uppercase labels: **Create** (Home, Content, Media),
  **Customize** (AI, Design, Views), **Manage** (Community, Settings). Each item: icon +
  label, `10px 12px`, radius `12px`, `--muted` text. **Active** item: `--accent-soft` bg,
  `--accent` text, weight 600. **Hover** (inactive): `--accent-soft` bg. At the bottom, a
  small quote card: *"Nobody reads it anyway — and that's the point."*
- **Main** — flex-1, screen content renders here.

Icons are simple 17px line SVGs (stroke `currentColor`, stroke-width 1.8). List: Home (house),
Content (doc w/ lines), Media (image), AI (sparkle), Design (pen), Views (eye), Community
(users), Settings (gear).

---

## Screens / Views

### 1. Home / Dashboard (`screen: 'home'`)
- **Purpose:** landing after login; write, resume, finish setup.
- **Layout:** single column, max-width 900px.
- **Components (top→bottom):**
  1. Date eyebrow (`Tuesday, 1 July`, 13px `--muted` 600).
  2. Greeting `A quiet day to write.` (34px/800). Sub: `1 post out in the world · 0 drafts
     waiting · 0 pages` (`--muted`).
  3. Action row: **New post** (accent pill w/ + icon) and **New page** (outline pill;
     navigates to Content).
  4. **Setup nudge card** (see Interactions): title `One thing left — make the home page
     yours`, sub `N of 3 setup steps done.`, a **Finish** accent button, and a progress bar
     (`--accent-soft` track, `--accent` fill, width = `setup/3`). When complete, this card is
     replaced by a `--pos-soft` "You're all set up." confirmation.
  5. `PICK UP WHERE YOU LEFT OFF` label + a clickable card for the "Welcome" post
     (`Published · 29 Jun`, title 22px, `/posts/welcome`, arrow chip). Navigates to Content.
  6. Three shortcut cards: **Design / Media / Settings** (title + one-line sub), each
     navigates to its screen; hover → `--accent` border.

### 2. Content (`screen: 'content'`)
- **Purpose:** create posts/pages; see existing content.
- **Layout:** single column, max-width 900px.
- **Components:**
  1. Title `Content` + sub `Everything you've made, in one calm place.`
  2. Two cards side-by-side: **Post** (desc + "New post" accent pill) and **Page** (desc +
     "New page" outline pill).
  3. Home-page row: `--accent-tint` panel, `HOME` eyebrow + `My site`, `published` badge,
     `Edited 23 Jun 2026`.
  4. `POSTS` label + a table card. Header row (uppercase 11.5px `--faint`): Title / URL /
     Status / Date. One data row: **Welcome** / `/posts/welcome` (mono) / `published` badge /
     `29 Jun 2026`. Row hover → `--accent-tint`.

### 3. Design — Theme Editor (`screen: 'design'`)
- **Purpose:** edit the site template; calmer, less-intimidating framing of the code editor.
- **Layout:** single column, max-width 960px.
- **Components:**
  1. Title `Design` + sub `Your site's template — edit gently. Changes save as a draft first.`
     Right side: a "● Saved" status + **Save draft** accent button.
  2. **Tab pills** in a rounded `999px` container: HTML / CSS / JS / Tokens / Components /
     Advanced / Preview. Active pill: `--accent-soft` bg, `--accent` text.
  3. **Available tokens** panel (`--accent-tint`): mono chips `{{content}} {{nav}}
     {{authLinks}} {{homeHref}} {{year}}`.
  4. **Code card** (`--codebg`): header shows `layout · <filename>` + "read & edit"; body is a
     `<pre>` of mono code that changes per active tab (sample contents in the prototype's
     `codeMap`).

### 4. Settings (`screen: 'settings'`)
- **Purpose:** minimal essential config.
- **Layout:** single column, max-width 760px.
- **Components:**
  1. Title `Settings` + sub `The essentials. Nothing you don't need.`
  2. **Site identity** card: eyebrow + `Name, tagline, logo, favicon & social image` + **Edit**
     outline button.
  3. `EMAIL SUBSCRIPTIONS` label + card: `Send new posts to subscribers`, sub `Currently
     <Enabled|Disabled>` (state-colored), and a **toggle switch** (48×28 track, 22px knob;
     on = `--accent` track + knob right, off = `--border` track + knob left).
  4. Footnote: `Subscriber numbers live under Community.` (Community is a link → Community screen).

### 5. Admin Login (`screen: 'login'`)
- **Purpose:** password gate; shown when signed out.
- **Layout:** full-viewport centered card (420px, `--card`, radius 24px, big soft shadow).
- **Components:** wordmark, `Welcome back.` (24px/800), sub about the "plot", `PASSWORD` label,
  password input (radius 12px; focus → `--accent` border + `--accent-soft` 3px ring), **Sign
  in** accent button (→ Home), footnote `No feed. No algorithm. Just your work.`

### 6. Placeholders — Media / Views / AI / Community (`screen: 'media' | 'views' | 'ai' | 'community'`)
- **Purpose:** stubs for sections not yet designed; establish the empty-state pattern & voice.
- **Layout:** title + a dashed-border `--card` panel, centered, ~60px vertical padding.
- **Components:** a 56px rounded icon tile (`--accent-tint`), `Nothing here yet`, and a
  witty one-liner per section:
  - Media: *"Drop images here — nobody's judging the alt text."*
  - Views: *"Zero views, beautifully rendered. Vanity metrics not included."*
  - Community: *"Your subscribers will land here. All zero of them, for now."*
  - AI: *"Draft help is on the way. For now, the words are all yours."*

---

## Interactions & Behavior
- **Sidebar navigation:** clicking a nav item sets the active screen and highlights the item.
  Home shortcut cards, "New page", the "Welcome" card, and the Community link also navigate.
- **Theme toggle:** header button flips `data-theme` between light/dark; all colors transition
  over `.35s`. Icon swaps moon↔sun. (Persist the choice per user in the real app.)
- **Setup progress:** Home nudge starts at 2/3. Clicking **Finish** sets it to 3/3 → progress
  bar animates to 100% (`width .4s ease`) and the card is replaced by the "all set up"
  confirmation. (In the real app, drive this from actual onboarding completion, not a click.)
- **Email subscriptions toggle:** flips enabled/disabled; knob slides (`left .25s`), track
  color and the "Currently …" label update.
- **Sign out / Sign in:** Sign out → Login screen; Sign in → Home.
- **Hover states:** nav items → `--accent-soft`; cards/pills/inputs → `--accent` border or
  slight brightness reduction; row hover → `--accent-tint`.
- **Entrance:** each screen's content plays the `riseIn` fade/slide on mount.

## State Management
Prototype state (recreate with the codebase's equivalent — component state, store, or route):
- `screen` — which view is active (`'home' | 'content' | 'design' | 'settings' | 'login' |
  'media' | 'views' | 'ai' | 'community'`). In production this is likely **routing** (the real
  admin uses real URLs like `/admin`, `/admin/editor`, `/admin/layout`, `/admin/settings`).
- `dark` — boolean theme; persist per user.
- `setup` — number 0–3 of completed onboarding steps; derive from real onboarding data.
- `emailOn` — boolean; backed by the site's email-subscription setting.
- `tab` — active Theme Editor tab.

Real data to wire: post/page list & counts, "published/draft" statuses, last-edited dates,
subscriber counts (Community), the actual layout template source (Theme Editor), and site
identity fields.

## Assets
- **Fonts:** Hanken Grotesk + IBM Plex Mono (Google Fonts). Self-host in the real app if
  preferred.
- **Icons:** inline stroke SVGs (house, doc, image, sparkle, pen, eye, users, gear, sun, moon,
  plus, arrow, check). Swap for the codebase's existing icon set if it has one — keep sizes
  (~17px nav, ~16px inline) and stroke weight (~1.8).
- No raster images or logos required; the wordmark is plain text.

## Files
- `Nobodyreads Admin.dc.html` — the full working prototype (all screens, nav, theme toggle,
  and micro-interactions). Open it in a browser to click through every state referenced above.
