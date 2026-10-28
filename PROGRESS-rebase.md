# PROGRESS — start-here-on-main

Brief: ~/Code/open-human-design/BRIEF-ohd-start-here-rebase.md. Worktree ~/Code/wt/ohd-start-here-on-main,
branch `start-here-on-main` from origin/main (1e11811, tablet pass + Timeline + natalengine 1.6.1). Not pushed.
(The tablet pass's own rebase notes are in git history: `git show 1e11811:PROGRESS-rebase.md`.)

Deps: node_modules copied from ~/Code/wt/ohd-tablet-on-main (same lockfile; `npm ci` fails building sharp).

## Done
- Replayed the three code commits from `start-here` (1b77ebd, 1cbc52d, 3026e74). Only conflict:
  package.json scripts (kept main's `e2e:timeline` and `e2e`, added `e2e:start`). The Start-here card
  uses main's panel unchanged (data-detail + registerScope 'chart').
- New on main: the share-card download was named after the chart, so a first chart saved as
  `me-chart.png`. Fixed; tests/starthere.mjs now reads the copied link, invite, /og/card.png request
  and download name (seen red without the fix, and red again with the share.js guard removed).
- /code-review (medium): reload booted from the address bar (no id), so "Me", "Add your name" and the card
  vanished on reload, and the "Got it stays hidden after reload" check was vacuous. Fixed in main.js boot
  (52adff8); new reload check seen red before the fix, and the Got-it check now goes red with dismissal broken.
- 389e875 (walkthrough/video/progress) not replayed as-is: WALKTHROUGH.md rewritten for this base,
  main's tablet walkthrough moved to walkthrough/WALKTHROUGH-tablet-pass.md, no video files.
- Screenshots retaken from this branch (walkthrough/start-here/); before-390/800 retaken from origin/main.
- Tests (vite on 127.0.0.1:5198): npm test, build, e2e:start, detail, layout, e2e, timeline-e2e all green.
- Preview 8534: `sudo tailscale serve --bg --https=8534 ~/Code/wt/ohd-start-here-on-main/dist-preview`
  (rebuild: `npx vite build --outDir dist-preview --emptyOutDir`; dist-preview is in .git/info/exclude).

## Open
- Review findings left as they are (approved behaviour or out of scope): "Me" is a name-string sentinel,
  not a profile flag (a person deliberately named "Me" loses the name in links); the card also shows on
  saved friends' charts; an invited newcomer without a name is labelled "Me" (was "You") in Connection;
  FIRST_CHART_NAME is an alias of SELF_NAME.
- Upstream unset on purpose (it pointed at origin/main); push with `git push -u origin start-here-on-main`.
- Phone trade-off: the bodygraph now starts at 1.69 screens (main: 0.54) because the Foundation moved above it.
- Signed-in user on a new device could get a stray "Me" if they enter a nameless chart before sync pulls.
- No way to bring the card back after "Got it" (other than clearing site data).
- Remove the 8534 serve when done: `sudo tailscale serve --https=8534 off`, and its row in ~/Code/uni-ops/ports.md.
