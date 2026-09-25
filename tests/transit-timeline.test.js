import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTimeline, intervalAt, adjacentEvent, MINUTE, DAY, MAX_TIMELINE_SPAN } from '../src/features/transit-timeline/core.js';
import { snapshot, stateAt, catalog, natalIdentity } from '../src/features/transit-timeline/provider.js';
import { wallTime, displayTime } from '../src/features/transit-timeline/time.js';
import { buildTransitGraph } from '../src/lib/transit-graph.js';

const at = key => row => row.key === key;
const intervals = (result, key) => result.rows.find(at(key)).intervals;

function synthetic({ start = 0, end = MINUTE, crossings, natal = [], mode = 'transit-only', rows }) {
  const birth = { gates: { all: natal }, centers: { definedNames: [] } };
  const snapshotAt = time => Object.fromEntries(Object.entries(crossings).map(([planet, history]) => {
    const gate = history.filter(([at]) => at <= time).at(-1)[1];
    return [planet, { gate, line: 1 }];
  }));
  return calculateTimeline({ start, end, snapshot: snapshotAt,
    states: activations => stateAt(birth, activations, mode),
    catalog: rows.map(id => ({ key: `gate:${id}`, kind: 'gate', id })), scanStep: MINUTE });
}

test('two planets crossing in one sample preserve the brief gap between them', () => {
  const result = synthetic({
    crossings: { sun: [[0, 10], [10_000, 20]], moon: [[0, 30], [20_000, 10]] },
    rows: [10, 20, 30]
  });
  assert.deepEqual(result.events, [10_000, 20_000]);
  assert.deepEqual(intervals(result, 'gate:10'), [
    { start: 0, end: 10_000, source: 'transit', clippedStart: true },
    { start: 20_000, end: MINUTE, source: 'transit', clippedStart: false, clippedEnd: true }
  ]);
  assert.equal(intervalAt(result.rows.find(at('gate:10')), 15_000), undefined);
  assert.equal(adjacentEvent(result.events, 10_000, 1), 20_000);
  assert.equal(adjacentEvent(result.events, 20_000, -1), 10_000);
});

test('a shared gate stays active until its last planet departs', () => {
  const result = synthetic({
    crossings: { sun: [[0, 10], [10_000, 20]], moon: [[0, 10], [20_000, 30]] },
    rows: [10], natal: [10], mode: 'overlay'
  });
  assert.deepEqual(intervals(result, 'gate:10'), [
    { start: 0, end: 20_000, source: 'both', clippedStart: true },
    { start: 20_000, end: MINUTE, source: 'natal', clippedStart: false, clippedEnd: true }
  ]);
});

test('birth state remains continuous and overlay and sky modes match the graph model', () => {
  const birth = { gates: { all: [20] }, centers: { definedNames: [] } };
  const sky = { sun: { gate: 57, line: 1 }, moon: { gate: 10, line: 2 } };
  for (const mode of ['overlay', 'transit-only']) {
    const model = buildTransitGraph(birth, sky, mode);
    const state = stateAt(birth, sky, mode);
    const expected = new Map([
      ...[...model.activeGates].map(gate => [`gate:${gate}`, model.gateSource(gate)]),
      ...model.channels.map(channel => [`channel:${channel.gates.join('-')}`, model.channelSource(channel)]),
      ...[...model.definedCenters].map(center => [`center:${center}`, mode === 'overlay' && model.natalCenters.has(center) ? 'natal' : 'transit'])
    ]);
    assert.deepEqual(state, expected);
  }
  const result = synthetic({
    crossings: { sun: [[0, 57], [10_000, 10]], moon: [[0, 30], [20_000, 34]] },
    rows: [20], natal: [20], mode: 'overlay'
  });
  assert.deepEqual(intervals(result, 'gate:20'), [
    { start: 0, end: MINUTE, source: 'natal', clippedStart: true, clippedEnd: true }
  ]);
  assert.equal(catalog().filter(row => row.key === 'gate:20').length, 1);
  assert.deepEqual(natalIdentity({ gates: { all: [20, 10] }, centers: { definedNames: ['throat', 'spleen'] } }),
    { gates: { all: [10, 20] }, centers: { definedNames: ['spleen', 'throat'] } });
});

test('birth channel and its centers remain defined through unrelated sky changes', () => {
  const birth = { gates: { all: [10, 34] }, centers: { definedNames: ['g', 'sacral'] } };
  const result = calculateTimeline({ start: 0, end: MINUTE,
    snapshot: time => ({ sun: { gate: time < 10_000 ? 20 : 57, line: 1 } }),
    states: activations => stateAt(birth, activations, 'overlay'),
    catalog: [
      { key: 'channel:10-34' }, { key: 'center:g' }, { key: 'center:sacral' }
    ] });
  for (const key of ['channel:10-34', 'center:g', 'center:sacral']) {
    assert.deepEqual(intervals(result, key), [
      { start: 0, end: MINUTE, source: 'natal', clippedStart: true, clippedEnd: true }
    ]);
  }
});

test('intervals are clipped to the requested range and end is exclusive', () => {
  const result = synthetic({
    start: 5_000, end: 25_000,
    crossings: { sun: [[0, 10], [10_000, 20], [25_000, 30]] }, rows: [10, 20]
  });
  assert.deepEqual(result.events, [10_000]);
  assert.deepEqual(intervals(result, 'gate:10'), [
    { start: 5_000, end: 10_000, source: 'transit', clippedStart: true }
  ]);
  assert.deepEqual(intervals(result, 'gate:20'), [
    { start: 10_000, end: 25_000, source: 'transit', clippedStart: false, clippedEnd: false }
  ]);
  assert.equal(intervalAt(result.rows.find(at('gate:20')), 25_000), undefined);
});

test('a source change exactly at end is not labelled as continuing beyond the window', () => {
  const result = synthetic({ start: 0, end: MINUTE,
    crossings: { sun: [[0, 10], [MINUTE, 20]] },
    natal: [10], mode: 'overlay', rows: [10, 20] });
  assert.deepEqual(result.events, []);
  assert.deepEqual(intervals(result, 'gate:10'), [
    { start: 0, end: MINUTE, source: 'both', clippedStart: true, clippedEnd: false }
  ]);
  assert.deepEqual(intervals(result, 'gate:20'), []);
});

test('invalid scan settings fail instead of returning a plausible static chart', () => {
  const options = { start: 0, end: MINUTE, snapshot: () => ({ sun: { gate: 1 } }),
    states: () => new Map([['gate:1', 'transit']]), catalog: [{ key: 'gate:1' }] };
  for (const setting of [{ scanStep: NaN }, { scanStep: Infinity }, { tolerance: NaN }, { tolerance: Infinity }]) {
    assert.throws(() => calculateTimeline({ ...options, ...setting }), RangeError);
  }
});

test('calendar-year spans fit while the calculation cap remains finite', () => {
  const options = {
    start: 0, snapshot: () => ({ sun: { gate: 1, line: 1 } }),
    states: () => new Map([['gate:1', 'transit']]), catalog: [{ key: 'gate:1' }],
    scanStep: DAY
  };
  const length = 366 * DAY + 60 * MINUTE;
  const result = calculateTimeline({ ...options, end: length });
  assert.equal(MAX_TIMELINE_SPAN, 367 * DAY);
  const beyondOldCap = calculateTimeline({ ...options, end: 29 * DAY, scanStep: undefined });
  assert.equal(beyondOldCap.scanStep, MINUTE);
  assert.equal(result.end, length);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.rows[0].intervals, [
    { start: 0, end: length, source: 'transit', clippedStart: true, clippedEnd: true }
  ]);
  assert.throws(() => calculateTimeline({ ...options, end: MAX_TIMELINE_SPAN + 1 }), RangeError);
});

test('display clock labels the date and both sides of a DST fold', () => {
  const before = Date.parse('2026-11-01T05:30:00Z');
  const after = Date.parse('2026-11-01T06:30:00Z');
  assert.deepEqual(wallTime(before, 'America/New_York'), { date: '2026-11-01', time: '01:30:00' });
  assert.deepEqual(wallTime(after, 'America/New_York'), { date: '2026-11-01', time: '01:30:00' });
  assert.match(displayTime(before, 'America/New_York'), /GMT-4/);
  assert.match(displayTime(after, 'America/New_York'), /GMT-5/);
  assert.match(displayTime(before, 'America/New_York', 'en-GB', true), /GMT-4/);
  assert.match(displayTime(after, 'America/New_York', 'en-GB', true), /GMT-5/);
  assert.deepEqual(wallTime(Date.parse('2026-01-01T00:30:00Z'), 'America/New_York'),
    { date: '2025-12-31', time: '19:30:00' });
});

test('pinned engine crossing agrees with every visible graph state on both sides', () => {
  const crossing = Date.parse('2026-09-23T06:10:42Z');
  const birth = { gates: { all: [20] }, centers: { definedNames: [] } };
  const rows = catalog();
  assert.equal(snapshot(crossing - 1000).moon.gate, 13);
  assert.equal(snapshot(crossing).moon.gate, 49);
  for (const mode of ['overlay', 'transit-only']) {
    const result = calculateTimeline({ start: crossing - 2 * MINUTE, end: crossing + 2 * MINUTE,
      snapshot, states: activations => stateAt(birth, activations, mode), catalog: rows });
    assert.ok(result.events.includes(crossing), `${mode}: missing exact-second crossing`);
    for (const time of [crossing - 2_000, crossing - 1_000, crossing, crossing + 1_000, crossing + 2_000]) {
      const expected = stateAt(birth, snapshot(time), mode);
      const actual = new Map(result.rows.flatMap(row => {
        const interval = intervalAt(row, time);
        return interval ? [[row.key, interval.source]] : [];
      }));
      assert.deepEqual(actual, expected, `${mode}: ${new Date(time).toISOString()}`);
    }
  }
});
