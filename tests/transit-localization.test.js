import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHDTransits } from 'natalengine';
import { buildTransitGraph } from '../src/lib/transit-graph.js';
import { renderTransitLegend, renderTransitSummary } from '../src/views/transit-presentation.js';
import { setLocale, t } from '../src/lib/i18n.js';
import { readFileSync } from 'node:fs';

const natal = { gates: { all: [11, 12, 22, 13, 33, 7, 21, 41, 55] },
  centers: { definedNames: ['throat', 'g', 'solar'] }, channels: [] };
const overlay = calculateHDTransits(natal, '2026-09-24');

function render(locale, mode, data = overlay) {
  const previous = globalThis.document;
  const nodes = { 'transit-content': { innerHTML: '' }, 'transit-graph-legend': { innerHTML: '' } };
  globalThis.document = { getElementById: id => nodes[id] };
  setLocale(locale, { persist: false });
  try {
    renderTransitLegend(mode);
    renderTransitSummary(data, buildTransitGraph(natal, data.transitGates, mode));
    return { summary: nodes['transit-content'].innerHTML, legend: nodes['transit-graph-legend'].innerHTML };
  } finally {
    setLocale('en', { persist: false });
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

for (const [locale, transit, natalLabel, centerLabel] of [
  ['zh-CN', '行运', '出生图激活', '行运定义的中心'],
  ['zh-Hant', '流日', '出生圖啟動', '流日定義的中心'],
]) {
  test(`${locale}: both transit modes translate summaries, sources, details and engine prose`, () => {
    const before = JSON.stringify({ natal, overlay });
    const { summary, legend } = render(locale, 'overlay');
    assert.ok(legend.includes(natalLabel));
    assert.ok(summary.includes(`${transit}完成的通道`));
    assert.doesNotMatch(summary, /At the selected|Your Gate|Pure transit|Transit Sun|defined in your chart|reinforces your natal|at the selected time/);
    const sky = render(locale, 'transit-only');
    assert.ok(sky.summary.includes(`${transit}通道`));
    assert.ok(sky.summary.includes(centerLabel));
    assert.ok(!sky.legend.includes(natalLabel));
    assert.doesNotMatch(sky.summary, /本命|出生|your chart|reinforces|Reinforced Gates/);
    assert.equal(JSON.stringify({ natal, overlay }), before);
  });
}

test('interpolated transit analysis remains escaped in every locale', () => {
  const altered = structuredClone(overlay);
  altered.channelCompletions.find(c => c.natalGate).transitPlanet = '<img src=x onerror=alert(1)>';
  for (const locale of ['en', 'zh-CN', 'zh-Hant']) {
    const { summary } = render(locale, 'overlay', altered);
    assert.ok(summary.includes('&lt;img'));
    assert.ok(!summary.includes('<img'));
  }
});

test('all transit time validation messages have separate Simplified and Traditional translations', () => {
  for (const locale of ['zh-CN', 'zh-Hant']) {
    setLocale(locale, { persist: false });
    for (const source of ['Enter a valid date and time.', 'Enter a valid IANA timezone.',
      'This local time does not exist in that timezone. Choose another time.']) {
      assert.notEqual(t(source), source);
    }
  }
  setLocale('en', { persist: false });
});

test('locale redraw uses cached transit results, separate from the calculation path', () => {
  const source = readFileSync(new URL('../src/views/transits.js', import.meta.url), 'utf8');
  const refresh = source.slice(source.indexOf('export function refreshTransitLanguage'), source.indexOf('export function renderTransitContent'));
  assert.match(refresh, /drawTransitResult\(lastTransitResult, true\)/);
  assert.doesNotMatch(refresh, /transitInstants\(|calculateHDTransits\(|calculateTransitGates\(|\.value\s*=/);
  assert.match(refresh, /refreshTransitDetail\(transitDetailContext\)/);
});
