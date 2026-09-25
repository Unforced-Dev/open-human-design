# Timeline localization integration

## Scope

Integrated the existing formal English, Simplified Chinese and Traditional Chinese resources with timeline base `513e0f1`. The source language resources came from `e1b250a`; the latest timeline, line-fixing calculations, shared transit details and two-source hover labels were retained.

The additional timeline catalog contains 108 messages per Chinese locale. The app bridge injects messages, date locale and row labels; the feature retains its standalone English fallback. Rule tables, calculation workers, chart storage, server/MCP endpoints and graph geometry are unchanged. No local password/database/launcher implementation is included.

See [resource ownership and extension guide](localization.md) and [researched terminology](timeline-localization-terms.md).

## Verification on 2026-09-24

- `npm run build`: passed. Vite reports a large-bundle warning because all three complete reading catalogs are currently bundled together.
- `node --test --test-skip-pattern='geocodes place|helpful errors' tests/*.test.js`: 138 passed, including the final layout/draft regression.
- Unfiltered `npm test`: 137 passed, 2 failed in existing MCP geocoding checks. The first failed with `fetch failed`; the unknown-place assertion consequently did not receive the expected “no match” response. No network or security settings were changed.
- `git diff --check`: passed.

After moving the tested commit into the requested development checkout, its production build and 81 localization/timeline/line-fixing tests passed again. The broader repeat there was stopped when the unrelated MCP test process stalled while loading a dependency; the 138-test result above is from the isolated checkout with a fresh locked dependency install. The development checkout's existing dependencies were not replaced.

Browser checks used a separate local dev server and a synthetic shared chart:

- Simplified → Traditional → English switching translated controls, row names, planet/fixing descriptions, calendar labels, accessibility labels and shared channel descriptions.
- The selected second, timezone, 7-day range, channel filter, search text and overlay/transit-only mode were retained across switching. A completed range stayed ready.
- An open channel interval retained its start, duration and clipped-end information while changing display language.
- Leaving the timeline, switching language while it was hidden, and returning preserved its state without zero-width ruler errors.
- Ruler resize callbacks only redraw geometry and labels; they do not commit pending time-input drafts.
- New York's repeated `2026-11-01 01:30:00` retained the input and both UTC offset choices across a language switch; choosing UTC−5 produced the intended clock display.
- New York's nonexistent `2026-03-08 02:30:00` retained its draft and displayed the correct translated error.
- No browser console errors were observed during these checks.

This is localization-focused verification, not a new full-year or mobile gesture benchmark. Existing calendar/DST/viewport and line-fixing unit tests remain in place; rule-table verification limitations are documented separately in [line-fixing research](line-fixing-research.md).
