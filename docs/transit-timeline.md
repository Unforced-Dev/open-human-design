# Transit timeline

The Timeline page shows when gates, channels, and centers are active across a chosen time range. It reuses the chart, transit source model, and detail dialogs; all calculations run locally in a Web Worker.

## Exploring a range

Choose a saved chart, date, time, and IANA timezone. The graph shows the selected instant; the timeline shows activation intervals. Birth chart + transits and Transit only use the same source meanings as the Transits page.

The range menu controls the **complete calculated range**, independently of viewport zoom:

| Preset | Calculated range |
| --- | --- |
| 24 hours | 12 hours before and after the selected instant |
| 3 days | Yesterday, the selected local date, and tomorrow |
| 7 days | Three local dates before the selected date through three dates after it |
| 28 days | Fourteen local dates before the selected date through thirteen dates after it |
| 1 year | From the selected instant to its next local calendar anniversary |
| Past year | From its previous local calendar anniversary through the selected second |

Day presets start and end at local date boundaries. A daylight-saving transition can make a local day 23 or 25 hours long. Calendar anniversaries clamp February 29 to February 28 when necessary; a nonexistent anniversary time advances to the next valid minute, and an ambiguous time prefers the original UTC offset.

Changing the date, choosing Now, or choosing a range recalculates its boundaries. Changing the timezone realigns calendar-day and calendar-year ranges. Switching chart mode or person recalculates the same overall interval. Progress appears inside the timeline panel; changing the request or leaving the page cancels an obsolete calculation.

- Drag across tracks to select an instant. Hold near an edge to pan within the calculated range.
- Use horizontal trackpad movement or Shift + wheel to move time. Vertical scrolling browses rows.
- Pinch, Ctrl + wheel, or the + / - keys zoom the viewport. The range menu keeps its selected preset.
- With the timeline focused, arrow keys move one minute; Shift + arrow moves one hour.
- Use category, search, and Changes filters to narrow the rows. Rows remain stable while panning or zooming, even when their bars leave the visible area.

At a calculated boundary, the viewport stops while the cursor can still reach the endpoint. Reversing direction first moves the cursor inward before the viewport follows. Zoom is limited to one hour through the complete range. Longer views use calendar-month columns; shorter views use local-date columns.

## Sources and details

Birth activations use the original warm-neutral source styling; transit activations use the transit palette. A gate active in both sources uses stripes. A channel completed by combining natal and transit gates has a transit bar with a natal-colored leading edge. These are different states.

Click a bar, a row symbol, or a graph element to open its existing chart detail. Selecting a bar first moves the selected instant inside that interval when needed. Temporary transit participation adds a compact start/end/duration summary; permanent natal activation has no timing summary. Durations use days, hours, and minutes. Complete planet and line descriptions remain visible below the detail heading.

The planet columns include line-fixing marks. See [line-fixing provenance and limitations](line-fixing-research.md), including the unavailable rule for 54.4, shown as `?`.

## Accuracy and limits

The worker samples every minute, detects gate changes, and refines detected crossings to approximately one second. Boundaries are estimates: a planet that leaves and returns to the same gate between two samples can be missed. A bar clipped by the calculated range does not imply that its activation began or ended at that boundary. The short labels “Started earlier” and “Ends later” retain this distinction; hover text supplies the fuller explanation.

Annual ranges require substantially more computation than short ranges. Jobs can be cancelled, and a bounded in-memory cache avoids repeating identical requests. No background service, external API, or persisted calculation cache is added.

## Integration

The app entry is `src/views/timeline.js`. It supplies chart access, source models, IANA time resolution, graph rendering, and detail dialogs to `createTransitTimeline()` in `src/features/transit-timeline/view.js`.

| Module | Responsibility |
| --- | --- |
| `core.js` | Sample transitions and assemble gate, channel, and center intervals |
| `provider.js` | Adapt NatalEngine snapshots and build the row catalogue |
| `client.js`, `timeline.worker.js` | Worker lifecycle, cancellation, progress, and cache |
| `presets.js`, `time.js`, `ruler.js` | Calendar ranges, duration formatting, and date/month boundaries |
| `viewport.js` | Bounded panning, anchored zoom, selection, and clipping |
| `line-fixing.js`, `line-fixing-data.js` | Pure fixing calculation and attributed rule data |
| `view.js`, `timeline.css`, `messages.js` | UI, theme styles, and English messages |

The view exposes `activate()`, `deactivate()`, `refresh()`, `setLanguage({ messages, locale, label })`, and `destroy()`. Deactivation cancels current work; destruction releases workers and listeners. Language updates preserve the calculation lifecycle, current selection, viewport and form/filter state. The existing detail renderer accepts optional `decorateDetail` and `onDetailClose` callbacks so timeline navigation can update the same dialog without introducing another modal. An optional `host.refreshDetail(context)` refreshes an open detail after its display language changes.

The feature accepts message, locale, and row-label overrides and retains its standalone English fallback. The app bridge supplies English, Simplified Chinese or Traditional Chinese from independent [locale resources](localization.md). The feature itself imports no app localization framework or language pack. It uses the app's palette and transit CSS properties; this display integration introduces no skin editor or renderer replacement.

## Development and validation

Use Node 20+ and install the locked dependencies with `npm ci`. No sibling checkout is required. The existing install patch preserves seconds in NatalEngine 1.6.0.

```sh
npm run test:timeline
npm run build
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

In another terminal, with Google Chrome installed:

```sh
E2E_URL=http://127.0.0.1:5173 npm run e2e:timeline
```

`CHROME_PATH` overrides the browser executable; `CHROME_CHANNEL` chooses a Playwright channel. CI installs Playwright Chromium and uses `CHROME_CHANNEL=chromium`. Set `SKIP_TIMELINE_YEAR=1` to omit the two slower full-year browser calculations; the default run includes them.

The dedicated checks cover interval boundaries, cancellation, calendar days and DST, line fixing, stable rows, source highlights, gestures, details, desktop/mobile layout, and panel-contained progress. They use synthetic chart fixtures and do not call geocoding services. The repository's broader `npm test` and `npm run e2e` checks remain separate and include external-service behavior.
