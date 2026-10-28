# PROGRESS — tablet-on-main

Brief: ~/Code/open-human-design/BRIEF-ohd-tablet-rebase.md. Worktree ~/Code/wt/ohd-tablet-on-main,
branch `tablet-on-main` from origin/main (923d758, natalengine 1.6.1; first built on 2951216, rebased). Not pushed.

Deps: `npm ci --ignore-scripts` (sharp fails to build from source; nothing we run needs it).

## Done
- The 5 tablet-pass commits replayed (376b3e1..3aabd84). PR #5's dialog (`src/lib/detail-dialog.js`,
  `#gate-detail`) is removed; Transits and Timeline open the shared panel via 'transit' / 'timeline'
  scopes. Build + `npm test` green after the first commit.

- Integration commit: transit-aware renderers in lib/details.js (birth vs transit activations,
  transit planets, source badges, transit-only, center status from the graph model); Timeline
  timing block inside the panel; Transits list uses data-detail; Connection theme toggle keeps
  the panel; 5-item nav fits one row at 360/390. Tests: details.test.js (transit scope),
  e2e.mjs, timeline-e2e.mjs, detail.mjs (Transits + Timeline), layout.mjs (+ Timeline states,
  nav-fits check). All green against vite on 127.0.0.1:5197.

- /code-review (medium) on 2951216..HEAD: fixed 5 findings (bf96780); the rest are listed in the report.
- Screenshots: walkthrough/tablet-on-main/ (390 + 800); WALKTHROUGH.md steps 7–9 (b7b7141).
- Preview: `sudo tailscale serve --bg --https=8533 ~/Code/wt/ohd-tablet-on-main/dist-preview`
  (rebuild: `npx vite build --outDir dist-preview --emptyOutDir`; dist-preview is in .git/info/exclude).
  curl https://uni.taildf9ce2.ts.net:8533/ → 200.

## Next
- Nothing left in the brief. Not pushed.
- ~/Code/uni-ops/ports.md row 8533 still names ~/Code/wt/ohd-ux/dist-preview (other repo; not edited).
