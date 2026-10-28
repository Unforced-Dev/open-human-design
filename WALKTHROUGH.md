# Walkthrough — Start here (branch `start-here-on-main`, on top of main with the tablet pass)

No video for this one. The tablet pass's own walkthrough is now `walkthrough/WALKTHROUGH-tablet-pass.md`.

## How to run it

- **On a phone or the Daylight (tailnet):** https://uni.taildf9ce2.ts.net:8534/ — a static build of this branch.
  Use a private window (or clear site data) to see it as a newcomer. No Worker behind it, so "Save image" and
  Sync don't work there.
- **Locally:** `npm run dev`, open the printed URL.
- **Test data:** tap "Enter UTC offset manually instead", leave Name blank, enter 1990-01-01 · 21:15 · offset 0.
  (That chart has a birth-time-sensitive Moon, so the reliability note shows.)
- Screenshots: `walkthrough/start-here/` (390×844 and 800×1280, from the running dev build of this branch;
  `E2E_URL=<dev url> node walkthrough/start-here/shoot.mjs` retakes them). `before-390.png` (full page) and
  `before-800.png` are main without this change.

## Steps

1. **Name is optional, really** (`walkthrough/start-here/01-entry-390.png`).
   The name field just says "(optional)". On main, a chart made without a name is gone on reload.
   *"A newcomer can leave the name blank."*

2. **The first chart is kept, as "Me", with Start here under the banner** (`02-start-here-390.png`).
   "Add your name" sits under the title. The card has three steps: strategy, authority in practice, and one
   open (or undefined) center to notice, each with one practical line.
   *"Their first chart is kept anyway, as Me. Under the type banner, a calm Start here card gives three steps."*

3. **Each step opens the detail panel** (`03-authority-sheet-390.png`, `04-center-sheet-390.png`).
   Tap step 2: Sacral Authority opens as a sheet. Step 3 opens the Throat center with its gates and channels.
   It's the same panel the chart, Transits and Timeline use.
   *"Each step opens the same detail panel as everything else in the app."*

4. **On phones the reading comes first** (`05-foundation-390.png`; full page: `before-390.png` vs `10-after-full-390.png`).
   The Foundation moves up, right after the card, as two columns of compact tiles (tap for the full text). The
   planet columns under the bodygraph give way to the Planets tab. The reliability note now reads: "Your Moon
   could change if your birth time is off by 15 minutes or less. The rest of your foundation holds within that
   range. If you know your time to the minute, the chart as shown is right."
   *"The Foundation starts about one screen down instead of one point six; the tabs at about two and a third instead of three."*

5. **Rename, and "Me" stays private** (`06-rename-390.png`).
   "Add your name" opens the edit dialog. "Me" is never put in the address bar, share links, invites, image
   cards or the saved image's file name.
   *"Add your name opens the edit dialog. Me never leaves this device."*

6. **Got it is remembered; the tablet shows steps side by side** (`07-dismissed-reloaded-390.png`, `08-start-here-800.png`, `09-strategy-sheet-800.png`).
   "Got it" hides the card for good (also for other charts). At 800 px the three steps sit in a row.
   *"Got it hides the card, and it stays hidden after a reload."*

## Measured positions (top of each block, in screen heights)

Same chart, dev builds of origin/main (1e11811) and this branch.

| | Foundation | Tabs | Bodygraph |
|---|---|---|---|
| 390×844, before (main) | 1.60 | 3.08 | 0.54 |
| 390×844, after, card showing | **1.02** | **2.34** | 1.69 |
| 390×844, after, card dismissed | **0.56** | **1.88** | 1.23 |
| 800×1280, before (main) | 0.94 | 1.43 | 0.27 |
| 800×1280, after, card showing | 1.21 | 1.68 | 0.53 |
| 800×1280, after, card dismissed | 1.00 | 1.48 | 0.33 |

The tablet layout wasn't reordered (the brief asked for the phone), so there the card adds about a quarter
screen until it's dismissed.
