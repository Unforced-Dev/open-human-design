# PROGRESS — ux-tablet-pass

Brief: ~/Code/open-human-design/BRIEF-ohd-tablet-pass.md (overflow fixes + click-for-more detail panel).

## Done
- Layout check `tests/layout.mjs` (`npm run e2e:layout`): 360/390/800/1280 × light/dark × 15 states.
  Baseline on main: 74 problems; 800px chart page scrolled sideways 116px (two-column grid too wide).
- Before screenshots: walkthrough/ux-tablet/before/.
- Chart goes single-column below 1024px; fluid grids; nav gets own row ≤640px; tabs wrap ≤560px.
- Shared detail panel (src/detail-panel.js) + pure renderers (src/lib/details.js) + original text
  (src/lib/glossary.js, absorbs seo.js line/type/circuit text). Sheet <1024px, side panel ≥1024px.
- Chart, transits, connection, team wired: every item has data-detail="kind:id".
- tests/details.test.js: every item of 16 charts (all types/authorities/definitions) renders, links resolve.

- tests/detail.mjs (`npm run e2e:detail`): taps every trigger in every view at 800px, keyboard + side panel at 1280.
- tests/e2e.mjs updated for #detail-panel; finds Chromium on Linux.
- /code-review (high) findings fixed (commit 5a208fb).
- Preview: port 8533 claimed; `tailscale serve --https=8533 ~/Code/wt/ohd-ux/dist-preview` (static build).
  Rebuild with `npx vite build --outDir dist-preview --emptyOutDir`.
- After screenshots, WALKTHROUGH.md, video ~/.local/share/uni/videos/ohd-tablet-pass.mp4 (118 s).

## Next
- Nothing in the brief left. Not pushed, no PR (per brief).

## Open questions
- Team recommendations stay plain text (engine prose with nothing specific to link to).
- Remove the 8533 serve when done: `tailscale serve --https=8533 off`, and its row in ~/Code/uni-ops/ports.md.
