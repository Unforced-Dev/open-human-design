/**
 * Every tappable item must open a real panel: for a spread of charts (all
 * five types, every authority we can reach), render every gate, line,
 * channel, center, planet, foundation item, connection item and team item,
 * and fail on a missing panel or leaked "undefined"/"NaN"/"[object".
 * Also checks that every onward link inside a panel resolves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateHumanDesign, compareHumanDesign, analyzePenta, calculateTransitGates, CHANNELS, GATES, CENTERS } from 'natalengine';
import { renderDetail } from '../src/lib/details.js';
import { pairModel } from '../src/lib/pair.js';
import { buildTransitGraph } from '../src/lib/transit-graph.js';
import { PLANET_ORDER, AUTHORITY_TEXT, DEFINITION_TEXT } from '../src/lib/glossary.js';

const BIRTHS = [
  ['1990-06-15', 14.5, -6], // Manifestor, emotional
  ['1985-03-20', 8, 0],     // Generator, sacral
  ['1992-11-02', 12, 9],    // MG
  ['1975-12-01', 6.5, -5],
  ['1968-02-11', 23.75, 1],
  ['2001-09-09', 3.25, 5.5],
  ['1955-07-04', 17, -4],
  ['1981-01-31', 9.5, 10],
  ['1999-04-17', 0.5, 2],
  ['1979-08-27', 11, -7],
  // Found by search so every type, authority and definition is covered:
  ['1950-02-01', 7, 0],   // Projector, splenic, quadruple split
  ['1950-05-04', 4, 0],   // mental
  ['1950-08-07', 1, 0],   // self-projected
  ['1950-05-28', 4, 0],   // triple split
  ['1953-08-07', 1, 0],   // ego
  ['1959-11-10', 22, 0]   // Reflector, lunar, no definition
];
const charts = BIRTHS.map(([d, h, tz]) => calculateHumanDesign(d, h, tz));

// "Undefined" is a real center status; a leaked JS value is lowercase and bare.
const BAD = /\bundefined\b|\bNaN\b|\[object|\bnull\b/;
const LEGIT = /\b(an |are )?undefined (center|and open)s?\b/gi;

function assertPanel(scope, kind, id, ctx) {
  const r = renderDetail(scope, kind, id, ctx);
  assert.ok(r, `${scope}/${kind}:${id} rendered nothing`);
  const text = `${r.label} ${r.title} ${r.body}`;
  assert.ok(r.title && r.body.replace(/<[^>]+>/g, '').trim().length > 20, `${scope}/${kind}:${id} is empty`);
  assert.doesNotMatch(text.replace(/<[^>]+>/g, ' ').replace(LEGIT, '').replace(/\bUndefined\b/g, ''), BAD, `${scope}/${kind}:${id} leaks a bad value`);
  return r;
}

/** Every data-detail link in a panel body must resolve in the same scope. */
function assertLinksResolve(scope, r, ctx, where) {
  for (const [, kind, id] of r.body.matchAll(/data-detail="([a-z]+):([^"]+)"/g)) {
    assert.ok(renderDetail(scope, kind, id, ctx), `${where}: link ${kind}:${id} goes nowhere`);
  }
}

test('chart scope: every gate, line, channel, center, planet and foundation item opens', () => {
  for (const chart of charts) {
    const ctx = { chart };
    const items = [
      ...Object.keys(GATES).map(g => ['gate', g]),
      ...chart.gates.all.flatMap(g => [1, 2, 3, 4, 5, 6].map(l => ['line', `${g}.${l}`])),
      ...CHANNELS.map(ch => ['channel', ch.gates.join('-')]),
      ...Object.keys(CENTERS).map(k => ['center', k]),
      ...['design', 'personality'].flatMap(s => PLANET_ORDER.map(p => ['planet', `${s}.${p}`])),
      ['type', chart.type.name], ['authority', chart.authority.name], ['profile', chart.profile.numbers],
      ['definition', chart.definition], ['cross', 'self'],
      ...['individual', 'tribal', 'collective', 'integration'].map(c => ['circuit', c]),
      ...['determination', 'environment', 'perspective', 'motivation'].map(v => ['variable', v])
    ];
    for (const [kind, id] of items) {
      const r = assertPanel('chart', kind, id, ctx);
      assertLinksResolve('chart', r, ctx, `chart ${kind}:${id}`);
    }
  }
});

test('every authority and definition the engine produces has original text', () => {
  const seen = new Set(charts.flatMap(c => [c.type.name, c.authority.name, c.definition]));
  for (const k of ['Reflector', 'Projector', 'Manifestor', 'Generator', 'Manifesting Generator', 'Lunar Authority',
    'Mental/Environment', 'Self-Projected Authority', 'Ego/Heart Authority', 'Splenic Authority', 'No Definition', 'Quadruple Split Definition']) {
    assert.ok(seen.has(k), `sample charts no longer cover ${k}`);
  }
  for (const chart of charts) {
    assert.ok(AUTHORITY_TEXT[chart.authority.name], `no text for ${chart.authority.name}`);
    assert.ok(DEFINITION_TEXT[chart.definition], `no text for ${chart.definition}`);
  }
});

test('pair scope: every connection item opens and links onward', () => {
  for (let i = 0; i < charts.length - 1; i++) {
    const a = { chart: charts[i] }, b = { chart: charts[i + 1] };
    const comparison = compareHumanDesign(a.chart, b.chart);
    const ctx = { a, b, nameA: 'Ada', nameB: 'Ben', comparison, model: pairModel(a.chart, b.chart) };
    const items = [
      ...[...ctx.model.activeGates].map(g => ['gate', g]),
      ...ctx.model.compChannels.map(ch => ['channel', ch.gates.join('-')]),
      ...Object.keys(CENTERS).map(k => ['center', k]),
      ...['electromagnetic', 'companionship', 'compromise', 'dominance'].map(k => ['conntype', k]),
      ['person', 'a'], ['person', 'b'], ['pairtypes', '-'], ['pairauthority', '-'], ['pairprofiles', '-'],
      ['composite', '-'], ['conditioning', '-']
    ];
    for (const [kind, id] of items) {
      const r = assertPanel('pair', kind, id, ctx);
      assertLinksResolve('pair', r, ctx, `pair ${kind}:${id}`);
    }
  }
});

test('team scope: every role, member, channel, gate and center opens and links onward', () => {
  const names = ['Ada', 'Ben', 'Cy', 'Dee', 'Eli'];
  const group = charts.slice(0, 5);
  const result = analyzePenta(group, names);
  const ctx = { result, charts: group, names };
  const items = [
    ...Object.keys(result.roles).map(k => ['role', k]),
    ...names.map((_, i) => ['member', i]),
    ...result.groupChannels.map(ch => ['teamchannel', ch.gates.join('-')]),
    ...result.sharedGates.map(g => ['teamgate', g.gate]),
    ...Object.keys(CENTERS).map(k => ['teamcenter', k]),
    ['grouptype', '-']
  ];
  for (const [kind, id] of items) {
    const r = assertPanel('team', kind, id, ctx);
    assertLinksResolve('team', r, ctx, `team ${kind}:${id}`);
  }
});

test('the panel says which side of a channel you carry', () => {
  // A hanging gate: active gate whose partner is not active.
  const chart = charts[0];
  const active = new Set(chart.gates.all);
  const hanging = CHANNELS.find(ch => active.has(ch.gates[0]) !== active.has(ch.gates[1]));
  const have = hanging.gates.find(g => active.has(g));
  const r = renderDetail('chart', 'channel', hanging.gates.join('-'), { chart });
  assert.match(r.body, new RegExp(`You carry Gate ${have}, one half`));
});

test('unknown kinds and ids render nothing instead of an empty panel', () => {
  const ctx = { chart: charts[0] };
  assert.equal(renderDetail('chart', 'gate', 99, ctx), null);
  assert.equal(renderDetail('chart', 'nope', 1, ctx), null);
  assert.equal(renderDetail('chart', 'channel', '1-2', ctx), null);
});

// Transits and Timeline pass the transiting planets and the graph model, so
// the panel says the same thing the transit graph shows.
const transitCtx = (chart, date, mode) => {
  const activations = calculateTransitGates(date, 0).gates;
  return { chart, transit: { activations, model: buildTransitGraph(chart, activations, mode) } };
};

test('transit scope: every gate, channel and center opens in both graph modes', () => {
  for (const chart of charts.slice(0, 4)) {
    for (const mode of ['overlay', 'transit-only']) {
      const ctx = transitCtx(chart, new Date(Date.UTC(2026, 8, 23, 12)), mode);
      const items = [
        ...Object.keys(GATES).map(g => ['gate', g]),
        ...CHANNELS.map(ch => ['channel', ch.gates.join('-')]),
        ...Object.keys(CENTERS).map(c => ['center', c])
      ];
      for (const [kind, id] of items) assertLinksResolve('chart', assertPanel('chart', kind, id, ctx), ctx, `${mode} ${kind}:${id}`);
    }
  }
});

test('transit scope: a gate lists its transiting planets, and transit-only drops the birth side', () => {
  const chart = charts[0];
  const ctx = transitCtx(chart, new Date(Date.UTC(2026, 8, 23, 12)), 'overlay');
  const [planet, act] = Object.entries(ctx.transit.activations).find(([, a]) => a);
  const overlay = renderDetail('chart', 'gate', String(act.gate), ctx).body;
  assert.match(overlay, new RegExp(`Transit [A-Za-z ]+ · ${act.gate}\\.${act.line}`), `transit ${planet} missing`);
  assert.match(overlay, /Birth activations/);
  const natalGate = chart.gates.personality.sun.gate;
  const only = transitCtx(chart, new Date(Date.UTC(2026, 8, 23, 12)), 'transit-only');
  const body = renderDetail('chart', 'gate', String(natalGate), only).body;
  assert.doesNotMatch(body, /Birth activations|Personality Sun/, 'transit-only view shows birth activations');
});

test('transit scope: center status follows the graph model, not the birth chart', () => {
  for (const chart of charts) {
    const ctx = transitCtx(chart, new Date(Date.UTC(2026, 8, 23, 12)), 'overlay');
    const { model } = ctx.transit;
    for (const key of Object.keys(CENTERS)) {
      const tag = renderDetail('chart', 'center', key, ctx).body.match(/class="center-status ([a-z-]+)">([^<]+)</);
      const expected = model.natalCenters.has(key) ? 'defined' : model.definedCenters.has(key) ? 'transit-defined' : 'undefined';
      assert.equal(tag[1], expected, `${key}: ${tag[2]}`);
    }
  }
});
