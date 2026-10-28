import test from 'node:test';
import assert from 'node:assert/strict';
import { zoomWindow, panWindow, clampWindow, panTimeline, instantAt, ratioAt, clipInterval } from '../src/features/transit-timeline/viewport.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test('zoom keeps a pointer anchor and gives second-aligned boundaries', () => {
  const range = { start: Date.parse('2026-09-24T00:00:00Z'), end: Date.parse('2026-09-25T00:00:00Z') };
  const anchor = instantAt(range, 0.25);
  const zoomed = zoomWindow(range, 2, 0.25);
  assert.equal(zoomed.end - zoomed.start, 12 * HOUR);
  assert.equal(instantAt(zoomed, 0.25), anchor);
  assert.equal(zoomed.start % 1000, 0);
  assert.equal(ratioAt(zoomed, anchor), 0.25);
  assert.deepEqual(zoomWindow(range, 2, 0), { start: range.start, end: range.start + 12 * HOUR });
  assert.deepEqual(zoomWindow(range, 2, 1), { start: range.end - 12 * HOUR, end: range.end });
});

test('zoom enforces minimum and maximum spans, including fine custom spans', () => {
  const range = { start: 0, end: DAY };
  assert.equal(zoomWindow(range, 1000).end - zoomWindow(range, 1000).start, HOUR);
  assert.equal(zoomWindow(range, 0.001).end - zoomWindow(range, 0.001).start, 28 * DAY);
  const fine = zoomWindow({ start: 0, end: 10_000 }, 4, 0.5, { minSpan: 1000, maxSpan: DAY });
  assert.deepEqual(fine, { start: 4000, end: 7000 });
  assert.ok(Math.abs(instantAt(fine, 0.5) - 5000) <= 500);
});

test('pan preserves span in both directions and rounds a fractional second', () => {
  const range = { start: 1000, end: 9000 };
  assert.deepEqual(panWindow(range, 2250), { start: 3000, end: 11_000 });
  assert.deepEqual(panWindow(range, -2500), { start: -1000, end: 7000 });
  assert.equal(panWindow(range, -2500).end - panWindow(range, -2500).start, 8000);
  assert.deepEqual(range, { start: 1000, end: 9000 });
});

test('clamp keeps a viewport within calculated bounds and preserves a fitting span', () => {
  const bounds = { start: 10_000, end: 20_000 };
  const inside = { start: 12_000, end: 16_000 };
  assert.deepEqual(clampWindow(inside, bounds), inside);
  assert.notStrictEqual(clampWindow(inside, bounds), inside);
  assert.deepEqual(clampWindow({ start: 8_000, end: 14_000 }, bounds),
    { start: 10_000, end: 16_000 });
  assert.deepEqual(clampWindow({ start: 17_000, end: 23_000 }, bounds),
    { start: 14_000, end: 20_000 });
  assert.deepEqual(clampWindow({ start: -50_000, end: -46_000 }, bounds),
    { start: 10_000, end: 14_000 });
  assert.deepEqual(clampWindow({ start: 50_000, end: 54_000 }, bounds),
    { start: 16_000, end: 20_000 });
  assert.deepEqual(clampWindow({ start: 0, end: 30_000 }, bounds), bounds);
  assert.deepEqual(clampWindow({ start: 0, end: 10_000 }, bounds), bounds);
  assert.deepEqual(inside, { start: 12_000, end: 16_000 });
  assert.deepEqual(bounds, { start: 10_000, end: 20_000 });
});

test('clamp composes with second-rounded zoom and pan at exclusive boundaries', () => {
  const bounds = { start: 0, end: 10_000 };
  const range = { start: 1000, end: 5000 };
  assert.deepEqual(clampWindow(panWindow(range, -2500), bounds),
    { start: 0, end: 4000 });
  assert.deepEqual(clampWindow(panWindow(range, 6250), bounds),
    { start: 6000, end: 10_000 });
  assert.deepEqual(clampWindow(zoomWindow(range, 0.1, 0.5,
    { minSpan: 1000, maxSpan: DAY }), bounds), bounds);
  assert.deepEqual(clampWindow({ start: 6000, end: 10_000 }, bounds),
    { start: 6000, end: 10_000 });
});

test('panTimeline continues moving the cursor after the right or left window bound', () => {
  const bounds = { start: 0, end: 10_000 };
  const right = { start: 6000, end: 10_000 };
  assert.deepEqual(panTimeline(right, 7000, 2000, bounds),
    { range: right, selected: 9000 });
  assert.deepEqual(panTimeline(right, 7000, 9000, bounds),
    { range: right, selected: 9000 });
  const left = { start: 0, end: 4000 };
  assert.deepEqual(panTimeline(left, 3000, -2000, bounds),
    { range: left, selected: 1000 });
  assert.deepEqual(panTimeline(left, 3000, -9000, bounds),
    { range: left, selected: 0 });
});

test('panTimeline uses the full requested shift when one gesture crosses a bound', () => {
  const bounds = { start: 0, end: 10_000 };
  const range = { start: 3000, end: 7000 };
  assert.deepEqual(panTimeline(range, 5000, 9000, bounds),
    { range: { start: 6000, end: 10_000 }, selected: 9000 });
  assert.deepEqual(panTimeline(range, 5000, -9000, bounds),
    { range: { start: 0, end: 4000 }, selected: 0 });
  assert.deepEqual(range, { start: 3000, end: 7000 });
});

test('panTimeline works with a full-range view and normal or reverse pans', () => {
  const bounds = { start: 0, end: 10_000 };
  assert.deepEqual(panTimeline(bounds, 5000, -4000, bounds),
    { range: bounds, selected: 1000 });
  assert.deepEqual(panTimeline(bounds, 1000, 5000, bounds),
    { range: bounds, selected: 6000 });
  const normal = panTimeline({ start: 2000, end: 6000 }, 4000, 2250, bounds);
  assert.deepEqual(normal, { range: { start: 4000, end: 8000 }, selected: 6000 });
  assert.deepEqual(panTimeline(normal.range, normal.selected, -1500, bounds),
    { range: { start: 3000, end: 7000 }, selected: 5000 });
});

test('reverse pan first brings a boundary cursor into the window', () => {
  const bounds = { start: 0, end: 20_000 };
  const left = { start: 0, end: 10_000 };
  assert.deepEqual(panTimeline(left, 1000, 2000, bounds),
    { range: left, selected: 3000 });
  assert.deepEqual(panTimeline(left, 1000, 4000, bounds),
    { range: { start: 1000, end: 11_000 }, selected: 5000 });
  const right = { start: 10_000, end: 20_000 };
  assert.deepEqual(panTimeline(right, 19_000, -2000, bounds),
    { range: right, selected: 17_000 });
  assert.deepEqual(panTimeline(right, 19_000, -4000, bounds),
    { range: { start: 9000, end: 19_000 }, selected: 15_000 });
});

test('several short reverse pans equal one long pan across recovery and view motion', () => {
  const bounds = { start: 0, end: 20_000 };
  for (const [range, selected, delta] of [
    [{ start: 0, end: 10_000 }, 1000, 4000],
    [{ start: 10_000, end: 20_000 }, 19_000, -4000]
  ]) {
    const first = panTimeline(range, selected, delta / 2, bounds);
    const second = panTimeline(first.range, first.selected, delta / 2, bounds);
    assert.deepEqual(second, panTimeline(range, selected, delta, bounds));
  }
});

test('mapping extrapolates outside the viewport', () => {
  const range = { start: 1000, end: 5000 };
  assert.equal(instantAt(range, -0.25), 0);
  assert.equal(ratioAt(range, 6000), 1.25);
});

test('clipping uses exclusive end, preserves metadata and earlier clip flags', () => {
  const viewport = { start: 10, end: 20 };
  assert.deepEqual(clipInterval({ start: 5, end: 25, source: 'transit', key: 'moon' }, viewport),
    { start: 10, end: 20, source: 'transit', key: 'moon', clippedStart: true, clippedEnd: true });
  assert.deepEqual(clipInterval({ start: 10, end: 15, source: 'natal', clippedStart: true }, viewport),
    { start: 10, end: 15, source: 'natal', clippedStart: true, clippedEnd: false });
  assert.deepEqual(clipInterval({ start: 12, end: 20, clippedEnd: false }, viewport),
    { start: 12, end: 20, clippedStart: false, clippedEnd: false });
  assert.equal(clipInterval({ start: 0, end: 10 }, viewport), null);
  assert.equal(clipInterval({ start: 20, end: 30 }, viewport), null);
});

test('invalid geometry fails clearly', () => {
  assert.throws(() => zoomWindow({ start: 0, end: 0 }, 2), RangeError);
  assert.throws(() => zoomWindow({ start: 0, end: HOUR }, 0), RangeError);
  assert.throws(() => zoomWindow({ start: 0, end: HOUR }, 2, -0.1), RangeError);
  assert.throws(() => panWindow({ start: 0, end: HOUR }, NaN), RangeError);
  assert.throws(() => clampWindow({ start: 0, end: 0 }, { start: 0, end: HOUR }), RangeError);
  assert.throws(() => clampWindow({ start: 0, end: HOUR }, { start: 5, end: 5 }), RangeError);
  assert.throws(() => panTimeline({ start: 0, end: HOUR }, NaN, 1000, { start: 0, end: DAY }), RangeError);
  assert.throws(() => clipInterval({ start: 3, end: 2 }, { start: 0, end: HOUR }), RangeError);
});
