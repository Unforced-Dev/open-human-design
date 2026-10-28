# PROGRESS — tablet-on-main

Brief: ~/Code/open-human-design/BRIEF-ohd-tablet-rebase.md. Worktree ~/Code/wt/ohd-tablet-on-main,
branch `tablet-on-main` from origin/main (2951216). Not pushed.

Deps: `npm ci --ignore-scripts` (sharp fails to build from source; nothing we run needs it).

## Done
- The 5 tablet-pass commits replayed (79c7537..5dccf2d). PR #5's dialog (`src/lib/detail-dialog.js`,
  `#gate-detail`) is removed; Transits and Timeline open the shared panel via 'transit' / 'timeline'
  scopes. Build + `npm test` green after the first commit.

- Integration commit: transit-aware renderers in lib/details.js (birth vs transit activations,
  transit planets, source badges, transit-only, center status from the graph model); Timeline
  timing block inside the panel; Transits list uses data-detail; Connection theme toggle keeps
  the panel; 5-item nav fits one row at 360/390. Tests: details.test.js (transit scope),
  e2e.mjs, timeline-e2e.mjs, detail.mjs (Transits + Timeline), layout.mjs (+ Timeline states,
  nav-fits check). All green against vite on 127.0.0.1:5197.

## Next
- Screenshots 390x844 + 800x1280 (SHOT_DIR=walkthrough/tablet-on-main SHOT_WIDTHS=390,800).
- Tailnet preview on 8533 → this branch (static build in dist-preview); curl 200.
- /code-review; report.
