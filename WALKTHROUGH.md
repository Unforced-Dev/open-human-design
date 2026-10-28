# Walkthrough — tablet pass (branch `ux-tablet-pass`)

Narrated video (118 s, Kokoro voice, signed as Uni): `~/.local/share/uni/videos/ohd-tablet-pass.mp4`
(tailnet: https://uni.taildf9ce2.ts.net:8444/ohd-tablet-pass.mp4).

## How to run it

- **On the Daylight (tailnet):** open https://uni.taildf9ce2.ts.net:8533/ — the static build of this branch.
  It has no Worker behind it, so "Save image" and Sync don't work there (they need openhumandesign.com).
- **Locally:** `npm install && npm run dev`, then open the printed URL.
- **Test data:** on the entry form tap "Enter UTC offset manually instead" and enter
  Ada · 1990-06-15 · 14:30 · −6, then (people menu → "+ New chart…") Ben · 1985-03-20 · 08:00 · 0 and
  Cy · 1992-11-02 · 12:00 · 9. Switch back to Ada. Connection: pick Ben. Team: tick all three.

## Steps

1. **Before — the page ran off the edge** (`walkthrough/01-before-800.png`).
   On main at 800 px wide, the readings column is squeezed and the page scrolls sideways.
   *"This is the chart on main at the Daylight's size. The readings column runs off the right edge."*

2. **After — one column below tablet width** (`02-chart-800.png`, `03-readings-800.png`).
   Below 1024 px the bodygraph sits full-width on top and the readings follow. Tiles and cards carry a quiet ›.
   *"Now the chart stacks. A layout test fails if any screen scrolls sideways at phone, tablet or desktop width."*

3. **Tap a gate — the detail opens in place** (`04-gate-sheet.png`).
   Tap Gate 34 on the bodygraph: a sheet with its activation, the three readings, the active line, all six
   lines, channels and center. The gate stays lit behind it.
   *"Tap anything and it opens in place, as a sheet on the tablet."*

4. **Links onward, with Back** (`05-line-onward.png`, `06-profile.png`).
   Tap "2 · Strength that won't be summoned": the line opens, with what a second line means in general.
   Back returns. Foundation tiles (type, authority, profile, definition, cross, circuit, variable) open the same way.
   *"Everything in the panel links onward, so you never have to switch views to look something up."*

5. **Connection and Team** (`07-connection-list.png`, `08-connection-channel.png`, `09-team-member.png`).
   On Connection, tap a channel under Electromagnetic: who brings each gate, and what kind of bond it is.
   On Team, tap a role, then a person: their type, authority, profile, roles and channels.
   *"Every channel, center, role and person opens to the pair's or the group's view."*

6. **Wide screens — a side panel** (`10-desktop-side.png`).
   At 1280 px the panel sits beside the chart (non-modal), so you can keep tapping the graph.
   *"On a wide screen the same panel sits beside the chart."*

Before/after screenshots of every view at 800×1280, light and dark: `walkthrough/ux-tablet/{before,after}/`.
