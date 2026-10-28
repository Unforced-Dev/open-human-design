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

## Next
- Update tests/e2e.mjs selectors; browser test for the panel (keyboard, sheet/side, back trail).
- Dark-mode layout run; after screenshots; WALKTHROUGH.md; video; tailnet preview.

## Open questions
- (none yet)
