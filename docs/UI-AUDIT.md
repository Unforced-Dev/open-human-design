# Open Human Design — UI Audit & Improvement Plan

Synthesis of a 12-pass UI audit (newbie-mobile, student-desktop, returning-user, share-recipient, signin-sync, dark-mode, a11y-keyboard, edge-cases, transit-connection-flows, visual-critic, copy-critic). Findings are deduped; **consensus count** = how many independent passes flagged the same root issue. Higher consensus + higher impact + lower effort = higher priority.

Effort tags: **S** = under ~1h, **M** = a few hours, **L** = a day+ / structural.

---

## 1. What's already strong — protect these

These landed across multiple passes. Do not regress them while fixing the issues below.

- **The "what am I?" moment.** Color-coded type name + plain-English one-liner (`TYPE_PLAIN`, chart.js:27-33) + Strategy pill gives a newcomer a human answer before any jargon. Flagged as a delight by newbie-mobile, share-recipient, copy-critic.
- **Place autocomplete with invisible timezone resolution.** Fast, disambiguated city results + confidence chip ("UTC-6 at birth · America/Denver"). The newcomer never thinks about UTC. (newbie-mobile, share-recipient, edge-cases)
- **Centers tab explanatory content.** DEFINED/UNDEFINED badges, plain language, not-self reflective questions. The strongest teaching surface. (newbie-mobile, student-desktop)
- **The bodygraph renderer itself** — canonical center colors, candy-striped both-gates, hover dim-and-relight, reveal animation, correct Design-left/Personality-right planet columns. (student-desktop, dark-mode, visual-critic)
- **Gate-detail card richness** — keynote + description + channel meaning + harmonic-gate link that says whether the channel is formed. (student-desktop)
- **Gene Keys Shadow→Gift→Siddhi on the Cross tab** — a cross-system bridge most HD apps lack. (student-desktop)
- **Privacy posture that's actually true.** Footer + subtitle + sync copy all consistent; shared data verified NOT written to recipient localStorage. (newbie-mobile, share-recipient, signin-sync, copy-critic)
- **The "solid chart" reliability badge** — leads with the verdict, concrete, reassuring. This is the model the soft variant must follow. (copy-critic, newbie-mobile, dark-mode)
- **The shared-chart viral loop exists and works** — amber "Looking at Jordan's chart — make your own free chart →" banner, instant URL-to-chart load, low-friction "make your own" form. (share-recipient)
- **People quick-pick chips + last-chart restore + named delete confirm.** Returning-user core loop is solid end to end. (returning-user)
- **Reflector / zero-definition + malformed `?d=junk` + double-submit all handled gracefully**, no console errors, bespoke Reflector copy. (edge-cases)
- **Dark mode is a real hand-tuned theme** — warm near-black, per-circuit-badge dark overrides (the standout), good focus rings, clean tooltips. (dark-mode, visual-critic, a11y-keyboard)
- **Crimson Pro / Inter type pairing** — serif reserved for identity/emotional moments only. (visual-critic)
- **Connection mini-graphs side-by-side** — best information-design moment in the secondary views. (transit-connection-flows, visual-critic)
- **Account-panel copy & recovery UX** — privacy pitch, email-sent confirmation, `INVALID_TOKEN` recovery, reassuring sign-out copy, working copy button. (signin-sync)

---

## 2. P0 — fix immediately (blockers + cross-cutting majors)

These break or badly degrade the experience for **every** user, or kill a core flow dead-on-arrival.

### P0-1. Mobile header is structurally broken — **consensus 5** (newbie-mobile, dark-mode, edge-cases, visual-critic, returning-user) — **M**

The single most-flagged issue. At 390px the logo "Open HD" wraps to two lines, the active "My Chart" pill overlaps the logo, and nav (4 links) + people-switcher + Sync + theme-toggle overflow the viewport (`.header-inner` scrollWidth ≈ 564 vs 390 → ~174px overflow; at 320px → 244px of horizontal page scroll with "Team" clipped on every view, both themes). The `@media(max-width:768px)` block only nudges `.nav` padding — there is no real mobile treatment.

- **File:** `index.html:18-34` (header markup), `src/styles.css` (header block ~115-178, mobile block ~1436-1469).
- **Change:**
  1. `.logo-text { white-space: nowrap; }` and reduce `.header-inner` padding on mobile from `0 24px` to `0 14px`.
  2. At `≤640px`, move the 4 nav links into either a bottom tab bar or a hamburger/overflow menu. Keep only logo + a compact people/sync cluster + theme toggle in the top bar.
  3. Ensure `theme-toggle` and Sync stay pinned and fully visible; make `.nav` its own horizontally-scrollable row if a menu is too heavy short-term.
  4. For a newcomer with no chart, the secondary nav (Transits/Connection/Team) has nothing to do — consider hiding it until a chart exists.
- **Acceptance:** `header.scrollWidth ≤ viewport` and `horizScroll === 0` at 320, 360, 390, 414px in both themes.

### P0-2. `/auth/verify` and `/authorize` serve the SPA instead of the Worker — **consensus 1** (signin-sync) — **S** — entire sync/AI feature dead on arrival

Blocker despite single-pass flag because it kills a whole feature for all real users. Cloudflare static assets match before the Worker on browser navigations (`Sec-Fetch-Mode: navigate`), and `not_found_handling: "single-page-application"` returns `index.html` for unknown paths. Verified on **both** localhost:8788 and production. A user who clicks the magic-link email can never reach "Finish signing in"; the OAuth `/authorize` consent page is never shown.

- **File:** `wrangler.jsonc` (assets block, `not_found_handling` at line 12; no `run_worker_first`). Routes are defined but unreachable in `worker/index.js:70-72`, `worker/oauth-ui.js:58-73,96-106`.
- **Change:** add to the `assets` block:
  ```jsonc
  "run_worker_first": ["/auth/verify", "/authorize", "/api/*"]
  ```
- **Acceptance:** in a real browser, `/auth/verify` renders "Finish signing in", `/authorize` renders the consent page, and the full magic-link + OAuth flows complete end to end.

### P0-3. Reliability-badge soft/time-sensitive copy — **consensus 3** (copy-critic, newbie-mobile, a11y-keyboard via contrast) — **S** — founder-flagged

The founder-flagged badge. Three defects: (1) leads with a conditional that makes the reader audit themselves before any reassurance — the opposite of the "solid" variant; (2) dumps HD jargon as the things that "could shift", reading as "your chart is unstable"; (3) **grammar bug** — singular branch emits "your Variable arrows **sits** near a boundary and **is** worth" (plural noun, singular verbs).

- **File:** `src/views/chart.js:105-110` (reliability-soft block). Label source: `src/lib/chartdata.js:41-45`.
- **Change** — replace the soft block to lead with the verdict, say what to do, collapse jargon into one calm sentence, and add a `humanList()` helper so 1/2/N items all read grammatically:
  ```js
  // helper (top of module)
  function humanList(arr) {
    if (arr.length <= 1) return arr[0] || '';
    if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
    return `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`;
  }
  ```
  ```html
  <div class="reliability reliability-soft">
    <span class="reliability-dot"></span>
    <span>Your chart is solid. One fine detail — your <strong>${esc(humanList(sensitivity.shifts))}</strong> — sits right on a line, so it's the only thing a birth time off by 15+ minutes could nudge. Everything else holds no matter what. If your time came from a birth certificate, even that is settled.</span>
  </div>
  ```
  Optionally relabel "Variable arrows" → "Variable" and "Moon line" → "Moon" in `chartdata.js` for the badge, since these are the most opaque terms.

### P0-4. Time-unknown chart has NO reliability caveat — **consensus 2** (newbie-mobile, edge-cases) — **S**

When "I don't know my birth time" is checked, `sensitivity` is `null`, so the reliability block is omitted **entirely** (chart.js:94 only renders when sensitivity is present). A noon-guess chart is then presented with full confidence — only a tiny italic "time unknown — chart uses noon" in the birth line. This is the most consequential caveat and it's the one that's missing: Type/Authority/Profile can genuinely be wrong.

- **File:** `src/views/chart.js:94` (reliability render guard); `main.js` sets `sensitivity = null` when `timeUnknown`.
- **Change:** when `birth.timeUnknown`, render a calm, prominent caveat in the Foundation panel reusing the reassuring-badge tone:
  > "No birth time — this chart is a best guess using noon. Your Type, Authority and Profile can change significantly with the real time; treat this as provisional until you find it."
- **Related (P2):** also append a one-line noon caveat to the Planets/Gates/Cross tab intros (edge-cases) so the line-level data stops claiming to be "the moment of birth".

### P0-5. Bodygraph gate tap targets ~8px — **consensus 2** (newbie-mobile blocker-for-mobile, a11y-keyboard) — **M**

Gate circles render at ~8.4px diameter (`r:12.3` in a 300-unit SVG rendered ~300px) — about a fifth of the 44px touch minimum. A finger cannot reliably hit a gate; a keyboard user can't reach one at all (see P0-6). This breaks the single most curiosity-driven interaction.

- **File:** `src/bodygraph.js:206-212` (gate `<g>` + circle).
- **Change:** add an invisible larger hit area per gate — a transparent circle of `r≈20-22` SVG units (or a 44px-equivalent pointer target) on the `.bg-gate` group, without enlarging the visible circle. Visual design stays delicate.

### P0-6. Bodygraph is non-perceivable & non-operable for AT/keyboard — **consensus 1** (a11y-keyboard, two blockers) — **M**

The core artifact fails for assistive tech: (1) the SVG is a single `role="img"` labeled only "Human Design bodygraph" — no `<title>`/`<desc>`, 128 gate elements with zero aria-labels, no text alternative for which centers/channels/gates are active (WCAG 1.1.1); (2) gates (`<g data-gate>`) and planet rows (`.bg-planet-row` divs) have no tabindex/role and mouse-only handlers, so 60 Tab presses never reach a gate or planet row — the primary "click a gate to learn" interaction has no keyboard path (WCAG 2.1.1).

- **File:** `src/bodygraph.js:128-133` (svg), `:205` (gate `<g>`), `:328` (planet row div).
- **Change:**
  1. Replace the static aria-label with a generated summary, e.g. "Generator, 3/5, Sacral authority. Defined centers: Sacral, Throat, G. Active channels: 34-20 Charisma…" (you already compute `definedNames` / `channels` / `gates.all`). Optionally add SVG `<title>`+`<desc>` and/or a visually-hidden readable list.
  2. Make gates and planet rows keyboard-operable: convert planet rows to `<button>` (or `role=button` + `tabindex=0` + Enter/Space keydown); add `tabindex=0 role=button aria-label` + keydown to each `.bg-gate` group (or guarantee every gate is reachable as a focusable control in the Gates/Planets panels).

### P0-7. Primary CTA & trust-banner text fail WCAG AA contrast — **consensus 2** (a11y-keyboard, copy/visual touch on the same tokens) — **S**

The main `View My Chart` / `Compare` / `Analyze` button is white-on-amber at **3.41:1 light / 2.59:1 dark** (fails AA). The reliability/trust banner text is **2.00:1** — nearly unreadable. Repeat offenders: the `--accent` amber as a text/button background, and `--text-tertiary`.

- **File:** `src/styles.css` — `--accent` / `.btn-primary` background, `--text-tertiary` (`#79716a` light / `#6b655e` dark), `.reliability` text.
- **Change:** darken the button background to ~`#9a5e1c` (≈4.5:1 with white). Put `.reliability` text on an opaque card, not 8%-alpha green. Bump `--text-tertiary` to reach 4.5:1 on its real backgrounds. Also affects `center-status.defined` (3.41:1), foundation `.label` (4.10:1 light / 3.42:1 dark), dark `type-birthline` (3.25:1), dark footer (3.25:1).

### P0-8. Magic-link email says "5 minutes" but links last 15 — **consensus 2** (signin-sync, copy-critic) — **S**

Email body (text + HTML) says "This link expires in 5 minutes" but `expiresIn: 900` (15 min), and the code comment explicitly wants 15 ("interstitial adds a human step, so give comfortable slack"). Users may abandon still-valid links or distrust the copy.

- **File:** `worker/auth.js:42` (text) and `:48` (HTML), vs `:80` (`expiresIn: 900`).
- **Change:** make both strings: "This link works once and expires soon. If you didn't request it, you can safely ignore this email." (config-proof) — or literally "15 minutes" to match.

---

## 3. P1 — fix this week (persona-specific majors)

### P1-1. Bodygraph renders tiny on desktop — the hero is a thumbnail — **consensus 2** (visual-critic blocker, student-desktop major) — **M**

On 1440px the SVG renders **218×332px** while the info column is **700px** (3.2x larger). `.chart-layout` caps the chart column at 420px (`minmax(320px,420px) 1fr`); inside it `.bg-grid` (`auto 1fr auto`) lets the two planet columns steal ~200px, squeezing the SVG to ~218px. The product's emotional payload reads as a side diagram.

- **File:** `src/styles.css` — `.chart-layout`, `.bg-grid`, `.bg-planets`, `.bodygraph-container`.
- **Change:** `.chart-layout { grid-template-columns: minmax(420px, 520px) 1fr; gap: 40px; }`. Stop planet columns stealing width — either move Design/Personality activations out of the flanking columns on desktop into the Planets tab (already duplicated there), or `.bg-planets { font-size: 11px }` + cap each column ≈64px so the SVG keeps ≥300px (target rendered width 340-400px). Add `.bodygraph-container { padding: 28px; box-shadow: var(--shadow-lg) }`.

### P1-2. Defined-center fills don't adapt to dark mode — **consensus 1** (dark-mode major) — **S**

`CENTER_COLORS` are hardcoded light-background pastels (head/G `#e9d56b`, Ajna `#a3c46c`, throat/spleen/solar/root `#c2a06b`, heart/sacral `#dd6356`) that glow like candy on `#141210`. The centerpiece is the one element that ignores dark mode.

- **File:** `src/bodygraph.js:55-59`.
- **Change:** add a dark variant keyed off `isDark()` — desaturate ~20-30% and drop lightness: yellow→`#bfa94e`, green→`#7a9c52`, tan→`#9c7f53`, red→`#b54a40`. Keep enough chroma to preserve center identity. Roll the dark reliability green and inactive-gate-number contrast into this same pass.

### P1-3. No `color-scheme: dark` / `accent-color` — white checkboxes, invisible date glyphs — **consensus 1** (dark-mode major) — **S**

No `color-scheme` or `accent-color` anywhere in styles.css. Native checkboxes render as glaring white squares, checked state is browser-default blue, and date/time picker glyphs render dark-on-dark (nearly invisible) with light-chrome popups.

- **File:** `src/styles.css` (`[data-theme="dark"]`).
- **Change:** `[data-theme="dark"]{ color-scheme: dark; }` and `input[type=checkbox],input[type=radio]{ accent-color: var(--accent); }`.

### P1-4. Shared place-search birth component for Connection + Team — **consensus 4** (transit-connection-flows ×2 major, copy-critic major, visual-critic major, returning-user touches it) — **L** — highest-leverage structural fix

Both Connection (Person B) and Team (member rows) make the user hand-enter a raw **UTC Offset** integer (Connection defaults to `0` = UTC → confidently-wrong charts; Team's field is an unlabeled `0` spinner) with no city search, no DST handling, and no time-unknown affordance — directly contradicting the main form's city-search-with-auto-timezone. The same user who never thought about UTC offset for their own chart must now know it (with silent DST traps) for everyone else.

- **File:** `src/views/entry.js:69-108` (the place-search component to extract) vs `src/views/connection.js:42-50` and `src/views/team.js:43-49` (raw `parseFloat`/number inputs); `index.html:157-160` (conn) and team row markup.
- **Change:** extract the entry place-search (input + `.place-result` dropdown + auto-tz chip + manual-toggle) into one shared birth-input component used by the main form, Connection, and Team. **Short-term stopgap** if the full port slips: relabel to "UTC offset at birth (e.g. -7, 5.5)" matching the main form, add the manual-tz toggle pattern, and stop pre-filling `0` (leave blank + require, mirroring `entry.js:167-177`).

### P1-5. No line-level content anywhere; `LINE_NAMES` unused — **consensus 1** (student-desktop major) — **S→M**

Clicking activation 12.2 describes gate 12 but never line 2 — the whole point of profile/line study. The engine exports `LINE_NAMES` (1 Investigator … 6 Role Model), unused.

- **File:** `src/views/chart.js:169-176` (`showGateDetail` builds `acts`; `g.line` already in hand).
- **Change:** minimum — append the line name to each activation ("☉ Personality Sun — 12.2 Hermit"). Ideally add a short line-level keynote. Surfacing `LINE_NAMES` is the cheap, high-value first step.

### P1-6. Substructure (Color/Tone/Base) hidden; Planets tab is redundant — **consensus 1** (student-desktop major) — **M**

Color/Tone/Base live only in a hover `title` tooltip; the Variable cards drop Base entirely; the Planets tab just re-prints the gate.line already flanking the graph.

- **File:** `src/views/chart.js:339-378` (`renderPlanetsPanel`, `sub()` only used in title), `:393` (arrow-card meta).
- **Change:** render Color/Tone/Base as inline columns in the Planets table (its natural home) and add Base to the Variable arrow cards. Turns a redundant tab into the advanced-study surface.

### P1-7. Edit/rename + post-creation AI-access toggle missing — **consensus 1** (returning-user major) — **M** — plumbing already exists

No way to edit/rename a saved person or toggle AI access after creation. `getAiAccess`/`setAiAccess` (`people.js:107-119`) and id-based `saveProfile` already exist and are sync-aware — only the UI is missing. The `#ai-access` checkbox lives only on the create form (`index.html:57`, read once at `main.js:146`).

- **Change:** add an "Edit person" surface (rename, edit date/time/offset, per-person AI-access toggle bound to `setAiAccess`) reachable from the switcher/quick-pick.

### P1-8. Header people-switcher: low affordance + lies about state — **consensus 2** (returning-user ×2 major, share-recipient touches it) — **M**

The switcher is a bare 12px native `<select>` with no icon/label — reads as a settings dropdown, not "your library." It also **lies about state**: when `currentData` is null (entry screen, after "+New", after deleting current person) no option gets `selected`, so the browser shows the first person ("Alice") as if loaded. It also mixes destructive/creative actions in as fake `<option>`s.

- **File:** `src/main.js:81-98,114-127`; `src/styles.css` `.people-switcher` ~1052-1061.
- **Change:** render a visible chip button ("Carol ▾") with a person glyph; on open show a real menu that separates the people list from actions (divider before "+ New chart" / "Remove"). When `currentData` is null but people exist, prepend a selected+disabled placeholder "— select a chart —" so the header never impersonates a loaded person.

### P1-9. Transits: present-tense bug + no synthesis/"what does this mean today" — **consensus 1** (transit-connection-flows ×2 major) — **M**

Every line is hardcoded present tense regardless of selected date — viewing 2020 still says "amplified today" / "today's transiting planets" (factually wrong, erodes trust). And the view dumps four sections with no headline/synthesis/prioritization — the 6-completion "today" state and the 0-completion 2020 state look structurally identical.

- **File:** `src/views/transits.js:80-84,88-106`; `index.html:129`.
- **Change:** (a) thread the selected date through copy — "today/now" only when date === today, else "on Jan 1, 2020"; add a "Viewing: Mon 1 Jan 2020 (past)" chip. (b) add a 1-2 sentence "Today's weather for you" synthesis generated from the strongest signal, and surface the most significant transit first.

### P1-10. Share link has NO OpenGraph/Twitter tags — **consensus 1** (share-recipient blocker) — **M** — top growth bug

Zero OG/Twitter meta tags; the person's name is client-rendered only, so no crawler (verified for facebookexternalhit/Twitterbot) ever sees "Jordan." The DM/text unfurl is empty — no image, no hook — throttling the entire viral funnel before the click.

- **File:** `index.html` `<head>`; dynamic tier needs a Pages Function / Worker that reads `?d=&t=&n=`.
- **Change:** Tier 1 (now, S): static `og:title`, `og:description`, `og:image` (branded bodygraph), `twitter:card=summary_large_image`. Tier 2 (the real win, L): edge function that detects bot UAs + the chart params and injects dynamic tags ("Jordan is a Manifesting Generator (5/2) — see their Human Design chart") with a generated bodygraph OG image.

### P1-11. Shared person vanishes after creating your own — **consensus 1** (share-recipient major) — **M**

After a visitor makes their own chart, the shared person (Jordan) disappears from the switcher (correctly never saved), silently killing the obvious next move: "now compare ours."

- **Change:** keep the shared person available for the session — either a non-persisted switcher entry, or a one-tap "Compare with {name}" link that routes into Connection pre-filled with both. Turns the shared chart into a second viral surface.

### P1-12. Team empty state is a near-blank dead end — **consensus 3** (transit-connection-flows major, visual-critic major, copy-critic minor) — **M**

Fresh user sees a one-line hint + two buttons, zero input rows, no indication you need 2+ people; "Analyze Team" is tappable before any data and only errors after the click.

- **File:** `src/views/team.js:18-37` (empty state), `:87-91` (post-click count check).
- **Change:** render one empty member row by default; pre-include the current user as a checked/locked first member; state "Add at least 2 people — you're already included" up front; disable "Analyze Team" until 2 valid members exist. Wrap the form in a bordered `.panel` card so controls don't float in a void.

### P1-13. Entry-form noise: noon default, AI checkbox, manual-offset placement — **consensus 1** (newbie-mobile minor, but pre-chart friction for all) — **S**

(1) Birth Time pre-fills `12:00 PM`, so a skipper can submit a noon chart unknowingly; (2) the "Let my connected AI see this person" checkbox appears under Name — meaningless/alarming to a first-timer with no connected AI; (3) "Enter UTC offset manually" sits in the primary path for everyone.

- **File:** `index.html:57,67,81-82`.
- **Change:** leave Birth Time empty with a clear placeholder; hide the AI checkbox behind the sync flow (P1-7's edit surface) so it only appears when relevant; demote "Enter UTC offset manually" to a smaller affordance below the submit button.

### P1-14. Add "what is this" orientation line on landing — **consensus 1** (newbie-mobile major) — **S**

The landing assumes you know what "your design" is — a headline + a birth form, zero explanation. A TikTok newcomer has no idea why date/time/place produce anything.

- **File:** `index.html` (under `.entry-subtitle`).
- **Change:** add one line, e.g. "Human Design maps your energy type, decision-making style and strengths from your birth moment. Enter it below to see your free chart."

### P1-15. Place-not-found error is hidden in the placeholder — **consensus 1** (edge-cases minor; touches the all-user submit path) — **S**

Submitting with unresolved place text correctly blocks, but the guidance is written to the (invisible, because the field is full) placeholder. The user can click repeatedly with no visible reason.

- **File:** `src/views/entry.js:191-196`.
- **Change:** set `aria-invalid` + red border on `#birth-place` and render a visible inline message ("Pick a place from the list, or enter a UTC offset manually."), mirroring the manual-offset invalid pattern at `entry.js:172-175`.

---

## 4. P2 — scheduled polish

| # | Item | File / selector | Change | Journeys | Effort |
|---|------|-----------------|--------|----------|--------|
| P2-1 | **Pluralization bug** "1 channels" | `chart.js:116,146`; `connection.js:97` | `${n} channel${n===1?'':'s'}` everywhere | student-desktop, copy-critic | S |
| P2-2 | **Impossible dates render confident chart** ("undefined 45, 2090", false "Stable chart") | `src/lib/share.js:32`; `src/lib/format.js:16` | After the shape regex, construct a Date and confirm month/day round-trip; else return null. Guard `formatBirth` so `months[m-1] === undefined` renders a fallback | edge-cases | S |
| P2-3 | **Gate-detail card not sticky** (opens off-screen on mobile, scrolls away on desktop) | `chart.js:202-206` | Mobile: bottom-sheet/modal or `scrollIntoView({block:'center'})`. Desktop: make the card sticky in the right column | newbie-mobile, student-desktop | M |
| P2-4 | **Panel tab bar overflows; "Cross" clipped, no scroll hint** | `.panel-tabs` (styles.css), tab markup | Add right-edge fade/gradient or guarantee a peek of the next tab; bump tab height toward 44px (currently 31px) | newbie-mobile, dark-mode | S |
| P2-5 | **`<main>` + real headings missing in chart view** | `index.html:90`; `chart.js:50-55` | Wrap content in `<main>`; chart `<h1>` ("Aria — Generator"); promote `.panel-title`/`.view-title` to `<h2>/<h3>`; label `<nav>`/sections | a11y-keyboard | M |
| P2-6 | **Place autocomplete lacks combobox ARIA** (arrow-key nav silent to SR) | `src/views/entry.js:68-74,119-134` | `role=combobox` + `aria-expanded`/`-controls`/`-autocomplete`; `#place-results` `role=listbox`; options `role=option`+id; update `aria-activedescendant` on arrow; aria-live result count | a11y-keyboard | M |
| P2-7 | **Entry input focus ring invisible** (`outline:none`, no `:focus-visible`) | `src/styles.css:251-255` | `input:focus-visible{ outline:2px solid var(--accent); outline-offset:2px; }` + global `:focus-visible` safety net | a11y-keyboard | S |
| P2-8 | **`.channel-item` is a div with inline onclick, not keyboard-operable** | `chart.js:283` | Convert to `<button>` (or `tabindex=0`+`role=button`+`aria-expanded`+Enter/Space); delegated listener | a11y-keyboard | S |
| P2-9 | **Smooth scroll not suppressed under reduced-motion** | `styles.css:89`; `chart.js:206` | `@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`; in JS pick `'auto'` when reduce matches | a11y-keyboard | S |
| P2-10 | **Gate-detail focus not managed** | `chart.js:191-206` | Move focus to the card/close button on open; return focus to trigger on close | a11y-keyboard | S |
| P2-11 | **Theme toggle missing `aria-pressed` / state** | `index.html:31-33` | Add `aria-pressed`; update label to "Switch to light/dark mode" | a11y-keyboard | S |
| P2-12 | **Personality channels glare in dark; both-stripe too white** | `bodygraph.js:78,141-142` | Soften dark personality stroke `#e8e4de`→`#cfc7bb`; re-tune both-stripe to match | dark-mode | S |
| P2-13 | **Inactive gate numbers unreadable in dark** (`#56504a` on `#28241f`) | `bodygraph.js:80,84` | Lift dark `textInactive` toward `#6f685f` (≥3:1) | dark-mode | S |
| P2-14 | **Reliability dot full-saturation emerald in dark** | `styles.css:1174` (`#27ae60`) | Dark override to muted/warmer `~#3fae6e` to match circuit-badge treatment | dark-mode | S |
| P2-15 | **Variable notation "RL RR" unlabeled/ambiguous** | `chart.js:398` | Label arrows: "Digestion R · Environment L | View R · Motivation R" or show arrow glyphs + slot names | student-desktop | S |
| P2-16 | **Quarter missing from Cross panel** (engine has it 64/64) | `chart.js` `renderCrossPanel` | Add Quarter from Personality-Sun gate's `.quarter`; verify the 4th name (Initiation) isn't mislabeled before shipping | student-desktop | S |
| P2-17 | **No fixing/exaltation-detriment ▲/▼** | planet columns / Planets tab | If engine can provide it, render canonical ▲/▼; else document as a known gap | student-desktop | M/doc |
| P2-18 | **Multi-channel hanging gates shown as separate pills** (gate 34 ×3 → count 18) | channels tab DOM | Group into one pill "Gate 34 seeks 10 · 20 · 57" | student-desktop | S |
| P2-19 | **Definition has no explainer** | Foundation Definition card / Centers | One-liner per type ("Single — all defined centers connected in one piece"); most valuable for split charts | student-desktop | S |
| P2-20 | **Foundation grid: 8 identical flat-gray tiles, no hierarchy** | `.foundation-item` (styles.css) | Give Type + Strategy `--accent-soft` bg + 2px left rule; reduce the rest to `bg-elevated`+1px border (or row dividers). Consider collapsing to Type/Strategy/Authority/Profile + "more details" expander | visual-critic, newbie-mobile (overwhelm) | M |
| P2-21 | **No tab-switch transition** (innerHTML snap) | `#panel-content` | `@keyframes panel-in{from{opacity:0;transform:translateY(4px)}}` applied on each render; subtle hover-lift on cards; inside reduced-motion guard | visual-critic | S |
| P2-22 | **Pill/badge radius & padding drift** (20/16/18px) | styles.css 316,992,1035,1212,1338 | One `--radius-pill` token + single padding; consolidate `.person-chip`/`.team-saved-person`/`.gate-pill` into one `.chip` base | visual-critic | M |
| P2-23 | **Transits rows vs chart cards = two design systems; transit-graph padding differs** | `.transit-completion`, `.transit-graph` | Pick one row idiom (left-accent borderless) for both; unify `.transit-graph` padding to `.bodygraph-container` (20px) | visual-critic | S |
| P2-24 | **Transit rings invisible & decoupled from completion list** | `transits.js`, bodygraph overlay | Bolder/larger rings; cross-highlight list↔graph on hover | transit-connection-flows | M |
| P2-25 | **Connection mini-graphs don't highlight the described channels** | `connection.js:115-116` | Highlight each connection's gates/channels on the relevant mini-graph (EM = half+half, companionship = full both), matching list left-border color | transit-connection-flows, visual-critic | M |
| P2-26 | **Connection defaults to manual entry over saved people** | `src/views/connection.js:18-30` | Default Person-B dropdown to first saved person; keep manual form collapsed until "enter birth data below" chosen | returning-user | S |
| P2-27 | **Delete reachable only after loading the person; no undo** | `src/main.js:96,114-127` | Surface delete (× / context menu) on each quick-pick chip/menu row; add an Undo toast (profile still in memory at delete) | returning-user | M |
| P2-28 | **Long single-word name clips banner at 320px** | `.type-name` | `overflow-wrap:anywhere` (or `word-break`) | edge-cases | S |
| P2-29 | **Nav says "My Chart" over someone else's shared chart** | nav label logic | In shared mode (URL has `?n=` and `getLastPersonId()` null) relabel active tab to "Chart"/"Their Chart" until a personal chart exists | share-recipient | S |
| P2-30 | **Shared→own form copy doesn't acknowledge transition** | entry heading when reached via shared CTA | Swap heading to "Now make yours"; keep "View My Chart" button | share-recipient | S |
| P2-31 | **Redundant "make your own" CTA missing at chart bottom** | shared chart footer area | Add a second "Make your own free chart" CTA above the footer to catch scrollers | share-recipient | S |
| P2-32 | **Strategy chip jargon unglossed** | `chart.js:54` | Gloss once: "Your strategy — how to engage with life: <strong>…</strong>" (or let the plain line carry it) | copy-critic, newbie-mobile | S |
| P2-33 | **Sync "Could not send — sync lives at openhumandesign.com"** confusing on prod | `src/main.js:257` | Branch copy: real app → "Could not send the email just now — please try again in a moment."; reserve the openhumandesign hint for static builds | signin-sync | S |
| P2-34 | **MCP setup copy assumes MCP knowledge; "Tick" not "check"; brittle menu path** | `src/main.js:215-226,221-226` | Add lead-in "Works with Claude (Pro/Team) and other MCP clients."; "Tick"→"check"; link "custom connector" to docs | signin-sync, copy-critic | S |
| P2-35 | **Signed-out sync copy presumes the reader has an AI assistant** | `index.html:37` | Soften: "…back up and sync across devices. If you use Claude or another AI assistant, you can also let it look up your charts by name." | copy-critic | S |
| P2-36 | **Sync popover has no close (X) / Escape** | `index.html:35-43`; `main.js:195-197` | Add an X button + Escape keydown handler | signin-sync | S |
| P2-37 | **Hover tooltip stays open while gate-detail card is open** (redundant) | bodygraph tooltip | Suppress/shrink the floating tooltip while that gate's detail card is open | student-desktop | S |
| P2-38 | **Chart is 5.1 screens of scroll on mobile** | Foundation grid | See P2-20 — collapse to essentials + expander | newbie-mobile | M |
| P2-39 | **Team results: filled vs missing roles not visually split; duplicate gap copy** | `team.js:100-118` | "Roles you have" / "Roles to recruit" divider or filled/hollow icons; dedupe missing-role detail; add "X of 9 roles filled" summary | transit-connection-flows | S |
| P2-40 | **Entry desktop: narrow form floating in empty void; raw native inputs** | entry layout | Faint bodygraph silhouette / two-column teaser; center within ~70vh; style native date/time inputs | visual-critic | M |
| P2-41 | **Type banner consumes the whole first viewport; orange shared-CTA shows on own chart** | `.type-banner`, `.shared-cta` | Reduce padding 32→24px; hide `.shared-cta` for the user's own chart; consider left-aligned banner so the graph is partly above the fold | visual-critic | S |

---

## 5. Recommended implementation order (P0 + P1) — grouped by file to minimize churn

Work top-down; each block is one file (or one cohesive component) so you open it once.

1. **`wrangler.jsonc`** — P0-2 `run_worker_first` (S). *Unblocks the entire sync/AI feature; do first, it's one line.*
2. **`worker/auth.js`** — P0-8 email expiry copy (S).
3. **`src/styles.css`** (one big pass — header + tokens + dark): P0-1 mobile header (M), P0-7 contrast tokens / `.btn-primary` / `.reliability` / `--text-tertiary` (S), P1-3 `color-scheme: dark` + `accent-color` (S), P1-1 `.chart-layout`/`.bg-grid`/`.bg-planets`/`.bodygraph-container` sizing (M), P2-7 focus ring (S).
4. **`src/bodygraph.js`** (one pass — touch targets + a11y + dark color): P0-5 invisible hit areas (M), P0-6 generated aria summary + focusable gates/planet rows (M), P1-2 dark `CENTER_COLORS` (S), P2-12/13 dark stroke + inactive-number contrast (S).
5. **`src/views/chart.js`** (one pass — copy + foundation + caveats + line content): P0-3 reliability-soft rewrite + `humanList()` (S), P0-4 time-unknown caveat (S), P1-5 `LINE_NAMES` on activations (S/M), P1-6 substructure columns + Base on Variable cards (M), P2-1 pluralization (S), P2-3 sticky/centered gate-detail (M).
6. **`src/views/entry.js`** (+ extract shared component) — P1-4 extract place-search birth component (L), P1-13 noon default + AI checkbox + manual-offset demotion (S, also `index.html`), P1-15 visible place-not-found error (S).
7. **`src/views/connection.js` & `src/views/team.js`** — P1-4 consume the shared birth component (part of L), P1-12 Team empty-state default row + pre-include user + disable-until-2 (M).
8. **`src/views/transits.js`** (+ `index.html:129`) — P1-9 date-aware tense + "weather for you" synthesis (M).
9. **`src/main.js`** — P1-7 edit/rename + AI-access toggle surface (M), P1-8 switcher chip + honest placeholder state (M), P1-11 keep shared person + "Compare with {name}" (M).
10. **`index.html` `<head>` + Pages Function** — P1-10 OG/Twitter tags: static tier now (S), dynamic edge function (L); P1-14 landing orientation line (S).

> Notes: do steps 1-2 first (tiny, unblock a dead feature). The styles + bodygraph blocks (3-4) clear the most cross-journey consensus pain (mobile header + tiny hero + dark centers + contrast + tap targets). The shared birth component (P1-4) is the one **L** worth front-loading because it repairs Connection *and* Team at once.

---

## 6. Summary

### Top 10 fixes by (consensus × impact ÷ effort)

| Rank | Fix | Consensus | Effort | Why it's top |
|------|-----|-----------|--------|--------------|
| 1 | **P0-2** `run_worker_first` in wrangler.jsonc | 1 | S | One line revives the entire dead sync/AI/OAuth feature. |
| 2 | **P0-1** Mobile header responsive | 5 | M | Most-flagged issue across passes; broken first impression on the most common device. |
| 3 | **P0-3** Reliability-soft copy + grammar | 3 | S | Founder-flagged; ships a live grammar bug; turns "your chart is unstable" into reassurance. |
| 4 | **P0-8** Email "5 min"→accurate | 2 | S | Trivial string fix; the email is currently factually wrong. |
| 5 | **P0-4** Time-unknown caveat | 2 | S | The most consequential caveat is the one currently omitted entirely. |
| 6 | **P0-7** CTA + trust-banner contrast | 2 | S | The primary button and trust banner fail AA in both themes. |
| 7 | **P1-2 / P1-3** Dark center colors + `color-scheme`/`accent-color` | 1+1 | S | Two small CSS changes fix the candy-glow centerpiece and white-checkbox bleed-through. |
| 8 | **P0-5** Gate tap targets to 44px | 2 | M | The single most curiosity-driven interaction currently misfires on every phone tap. |
| 9 | **P1-1** Desktop bodygraph hero sizing | 2 | M | The product's emotional payload renders 3.2× smaller than the data grid beside it. |
| 10 | **P1-4** Shared place-search birth component | 4 | L | Highest structural leverage — one component repairs Connection *and* Team's confidently-wrong-UTC bug. |

### The 3 most surprising findings

1. **The whole account/sync/AI feature is dead on arrival in real browsers, but every step looks correct.** All the copy, recovery UX, MCP panel, and copy-button work flawlessly once a session exists — yet a single Cloudflare asset-vs-Worker routing default (`not_found_handling: single-page-application` with no `run_worker_first`) means `/auth/verify` and `/authorize` serve the chart SPA, so no real user can ever finish sign-in or connect their AI. Verified on production. The break is purely infra; one line fixes it.

2. **Time-unknown charts are presented with MORE confidence than time-known ones.** Because `sensitivity` is `null` when the time is unknown, the reliability badge is omitted entirely — so the one chart whose Type/Authority/Profile could genuinely be wrong shows no caveat at all, while a precise chart shows a reassuring badge. The safety logic is exactly inverted at the moment it matters most.

3. **The bodygraph — the literal hero and the product's whole emotional payload — is the element most consistently failing.** Independently flagged as a desktop thumbnail (218px next to a 700px grid), a mobile tap-target failure (~8px), a screen-reader/keyboard dead zone (single `role=img`, zero reachable gates), and the one component that ignores dark mode (candy-glow pastels on near-black). The renderer itself is beautiful and accurate — but sizing, hit-targets, a11y, and theming all undercut it at once.
