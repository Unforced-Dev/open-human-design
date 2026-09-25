# Localization

The header selector supports English (`en`), Simplified Chinese (`zh-CN`) and Traditional Chinese (`zh-Hant`) without reloading the page. English uses upstream UI copy and NatalEngine descriptions, not a back-translation. Calculations, stored profiles, URLs, MCP payloads and server-rendered share images are unchanged.

## Resource ownership

| Location | Responsibility |
|---|---|
| `src/locales/index.js` | Registers complete locale providers; the selector and browser-language resolver use this registry. |
| `src/locales/en.js`, `src/locales/{zh-CN,zh-Hant}/index.js` | Each provider supplies `code`, `label`, `matches`, `messages`, `vocabulary`, `content`, `format` and `timeline`. Each Chinese directory owns its own complete dictionaries, using the layout below. |
| `src/locales/zh-CN/{gates,lines,channels,hexagrams,gene-keys}.json` | Final domain dictionaries keyed by gate/line/channel identifiers. No review overlays. |
| `src/locales/zh-CN/vocabulary.js` | Named terminology; classical hexagram names are derived from `hexagrams.json`. |
| `src/locales/zh-CN/engine-messages.json`, `engine-templates.json` | Remaining engine text and dynamic sentence patterns. `content.js` derives lookups for already-owned readings and vocabulary rather than storing their prose twice. |
| `src/locales/zh-CN/ui-*.json` | Feature-specific UI messages. Every source key has one owner; shared keys live in `ui-common.json`. |
| `src/locales/{zh-CN,zh-Hant}/timeline.json` | Timeline messages keyed by the feature's stable identifiers. These are injected separately, never merged into the source-keyed UI catalog. |
| `src/locales/ui-contexts.json` | Explicit context keys for identical English phrases with different meanings. Includes the English fallback. |
| `src/locales/chinese-readings.js` | Shared source-string lookup and template matching, parameterized with each locale's dictionaries and cross labels. It performs no script conversion and imports no locale-specific text. |
| `src/lib/{i18n,vocabulary,content,format}.js` | Generic display adapters and locale state; views do not select a language or import a language-specific resource. |

The provider's `format` functions own language-specific punctuation, lists, date formatting, optional source labels and tooltip titles. Keep markup and user-value escaping in the view. The public helper `formatDisplay(kind, ...args)` uses the active provider; `t(source, params)` interpolates source-keyed UI messages. `setMessage` and `setHtmlMessage` mark dynamic DOM nodes for retranslating. `setHtmlMessage` is only for trusted application markup with escaped user values. Never mark a container containing form controls for text replacement.

Chinese Gene Keys spectrum keywords include the source term after a space, without parentheses or added category prefixes. Chinese gate hover titles use the translated upstream gate name followed by the classical hexagram in parentheses. English keeps upstream titles and the original three-keyword spectrum. Existing tooltip and modal geometry is unchanged; `language-switcher.css` only adds the selector and narrow-screen header wrapping.

## Preference and state

The `ohd-language` browser preference is independent of chart storage. A supported saved choice wins; otherwise supported browser languages are checked in order, with English as fallback. If preference storage is unavailable, switching still works for the current page. Unsupported locales are not advertised as translated.

Changes redraw descriptions from existing calculated objects and preserve the selected view, chart panel, detail lens, form inputs, saved-person selection and team choices. They must not submit forms, save people or alter share URLs. Only explicitly marked application-owned UI is translated; user-entered names and places are never scanned or replaced.

## Traditional Chinese

`zh-Hant` uses Taiwan-oriented UI vocabulary and terminology checked against Taiwanese publishers and Human Design teaching sources, with Hong Kong practitioner usage compared explicitly. It is a reviewed language choice, not a claim that all Traditional Chinese communities use identical terms. Examples include 薦骨權威, 輪迴交叉, 流日, 探究者／烈士／人生典範 and the published title 基因天命. Regional alternatives and provenance are recorded in [the Traditional Chinese glossary](./术语对照表.zh-Hant.md).

Browser preferences `zh-TW`, `zh-HK`, `zh-MO` and `zh-Hant` (including regional subtags) resolve to this provider; an explicit saved choice takes precedence. Plain `zh`, `zh-CN`, `zh-SG` and `zh-Hans` keep the Simplified provider. A separate Hong Kong provider can be registered later if a distinct full editorial variant is needed.

OpenCC 1.4.2 was used offline to establish an initial character-converted draft, followed by domain and UI vocabulary edits. It is not a project dependency or a runtime translator. The Traditional dictionaries are the sole editable source of their text: do not regenerate them from Simplified Chinese when making future edits. Keep source identifiers and template `source` fields in English; update both Chinese locales independently when upstream meaning changes. Regional vocabulary must never be applied as a global replacement to user input or engine data.

## Adding a language

1. Create a locale directory with reviewed domain dictionaries, vocabulary and UI catalogs. Preserve source meaning and placeholders. Record terminology sources and variant choices in a glossary, following [the Chinese glossary](./术语对照表.zh-CN.md).
2. Add an `index.js` exporting the provider interface shown above. Implement the same `vocabulary` and `format` keys as `en.js`, plus the content dictionaries, text adapter and cross-name formatter. Supply `timeline: { locale, messages }` using an Intl locale and a reviewed timeline catalog. Set `content.bilingualGeneKeys` only if bilingual spectrum keywords are desired.
3. Register the provider in `src/locales/index.js`. No view, selector or resolver branches are needed. Add any context-specific messages to `ui-contexts.json` with an English fallback.
4. Extend preference tests and include the language in coverage and formatting tests. Traditional Chinese needs reviewed terminology and prose; automatic script conversion alone is not a completed translation.
5. Check navigation, open details, unsaved drafts, computed relationships and team selection during round-trip switching in a browser.

## Updating upstream text or Transit features

UI strings use the English source as key and fallback. New English UI copy must be added to its owning catalog; a shared key belongs in `ui-common.json`. Dynamic NatalEngine sentences are matched against the engine's English text because the engine currently returns prose rather than message identifiers. When upgrading it, review `engine-messages.json` and `engine-templates.json` and run the computed-example tests; unfamiliar text falls back to English. This adapter is not a substitute for reviewing changed source text.

Keep new Transit calculations and date/time controls in their feature change. Call the same generic display helpers from new controls, then add their translations to the relevant catalog. Localization does not change `chartdata.js`, `people.js`, calculation dependencies, persistence, authentication or server endpoints.

## Timeline display boundary

`src/views/timeline.js` is the app-to-feature bridge. It injects the provider's timeline messages and Intl locale, labels rows through the shared gate/channel/center vocabulary, and exposes dynamically translated planet names. Worker row IDs, cached intervals, line-fixing rules, and chart objects remain language-independent.

The main language listener calls `timelineView.setLanguage(timelineLanguageOptions())`. This updates labels without recreating the feature, restarting the range worker, or resetting the selected instant, viewport, mode, filters, search, and unresolved date/time drafts. The optional host hook `refreshDetail(context)` redraws the existing selected detail and its timing decoration without firing `onDetailClose`. Hidden views defer ruler drawing until they have a visible width.

For new timeline copy, add a stable key to `src/features/transit-timeline/messages.js` and the same key with identical placeholders to both `timeline.json` files. Keep English wording in the feature as its standalone fallback. Do not import app locale providers into the feature. See [timeline terminology](./timeline-localization-terms.md) for source references and regional choices.

## Verification

```sh
npm run test:localization
node --test --test-skip-pattern='geocodes place|helpful errors' tests/*.test.js
npm run build
```

`npm test` also runs two existing external geocoding checks. Offline-focused runs above exclude them without changing network security or application behavior.

Tests check unique UI ownership, placeholders, locale-provider contracts, English source equivalence, complete Chinese gate/line/channel/Gene Keys coverage, computed summaries and source-data immutability. Browser checks remain necessary for state preservation and layout.

The `Localization validation` pull-request workflow runs the offline localization suite and production build with Node 20 and locked dependencies. It is independent of the timeline's browser workflow and does not require geocoding or account services.
