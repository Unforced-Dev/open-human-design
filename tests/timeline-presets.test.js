import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY } from '../src/features/transit-timeline/core.js';
import { RANGE_OPTIONS, presetWindow } from '../src/features/transit-timeline/presets.js';
import { wallTime } from '../src/features/transit-timeline/time.js';
import { transitInstants } from '../src/lib/transit-time.js';

const at = iso => Date.parse(iso);
const resolve = (date, time, zone) => transitInstants(date, time, zone)[0].instant;

test('the six presets retain a centered exact 24-hour window', () => {
  assert.deepEqual(RANGE_OPTIONS.map(([value]) => value), ['1', '3', '7', '28', 'year', 'past-year']);
  const instant = at('2026-09-24T09:50:00Z');
  const window = presetWindow(instant, '1', 'Asia/Shanghai', transitInstants);
  assert.deepEqual(window, { start: instant - DAY / 2, end: instant + DAY / 2 });
});

test('3, 7 and 28 days use complete Shanghai calendar dates independent of clock time', () => {
  const morning = resolve('2026-09-24', '09:50:00', 'Asia/Shanghai');
  const evening = resolve('2026-09-24', '23:30:00', 'Asia/Shanghai');
  const expected = {
    '3': ['2026-09-22T16:00:00Z', '2026-09-25T16:00:00Z'],
    '7': ['2026-09-20T16:00:00Z', '2026-09-27T16:00:00Z'],
    '28': ['2026-09-09T16:00:00Z', '2026-10-07T16:00:00Z']
  };
  for (const [preset, [start, end]] of Object.entries(expected)) {
    const window = { start: at(start), end: at(end) };
    assert.deepEqual(presetWindow(morning, preset, 'Asia/Shanghai', transitInstants), window);
    assert.deepEqual(presetWindow(evening, preset, 'Asia/Shanghai', transitInstants), window);
  }
});

test('natural-day windows include 23- and 25-hour New York DST dates', () => {
  const spring = resolve('2026-03-08', '03:30:00', 'America/New_York');
  const springWindow = presetWindow(spring, '3', 'America/New_York', transitInstants);
  assert.deepEqual(springWindow, { start: at('2026-03-07T05:00:00Z'), end: at('2026-03-10T04:00:00Z') });
  assert.equal((springWindow.end - springWindow.start) / 3_600_000, 71);
  const fall = resolve('2026-11-01', '01:30:00', 'America/New_York');
  const fallWindow = presetWindow(fall, '3', 'America/New_York', transitInstants);
  assert.deepEqual(fallWindow, { start: at('2026-10-31T04:00:00Z'), end: at('2026-11-03T05:00:00Z') });
  assert.equal((fallWindow.end - fallWindow.start) / 3_600_000, 73);
});

test('a skipped local date resolves to the next existing day boundary', () => {
  const instant = resolve('2011-12-31', '12:00:00', 'Pacific/Apia');
  const window = presetWindow(instant, '3', 'Pacific/Apia', transitInstants);
  assert.equal(wallTime(window.start, 'Pacific/Apia').date, '2011-12-31');
  assert.equal(wallTime(window.end, 'Pacific/Apia').date, '2012-01-02');
});

test('forward and past calendar years handle February 29 and exclusive end', () => {
  const leap = at('2024-02-29T12:34:56Z');
  const future = presetWindow(leap, 'year', 'UTC', transitInstants);
  assert.deepEqual(future, { start: leap, end: at('2025-02-28T12:34:56Z') });
  const past = presetWindow(leap, 'past-year', 'UTC', transitInstants);
  assert.deepEqual(past, { start: at('2023-02-28T12:34:56Z'), end: leap + 1000 });
  assert.ok(past.start <= leap && leap < past.end);
  const midnight = presetWindow(at('2026-12-31T23:59:59Z'), 'past-year', 'UTC', transitInstants);
  assert.deepEqual(midnight, { start: at('2025-12-31T23:59:59Z'), end: at('2027-01-01T00:00:00Z') });
  const leapMidnight = presetWindow(at('2024-02-29T23:59:59Z'), 'past-year', 'UTC', transitInstants);
  assert.equal(leapMidnight.start, at('2023-02-28T23:59:59Z'));
  const ordinary = presetWindow(at('2026-09-24T09:50:00Z'), 'year', 'UTC', transitInstants);
  assert.equal(ordinary.end, at('2027-09-24T09:50:00Z'));
});

test('spring anniversary moves through an IANA DST gap to the next valid minute', () => {
  const instant = resolve('2025-03-08', '02:30:00', 'America/New_York');
  const window = presetWindow(instant, 'year', 'America/New_York', transitInstants);
  assert.equal(window.start, instant);
  assert.deepEqual(wallTime(window.end, 'America/New_York'), { date: '2026-03-08', time: '03:00:00' });
  assert.equal(window.end, at('2026-03-08T07:00:00Z'));
});

test('fall anniversary chooses the matching offset in an IANA DST fold', () => {
  const source = resolve('2025-11-01', '01:30:00', 'America/New_York');
  const window = presetWindow(source, 'year', 'America/New_York', transitInstants);
  const matches = transitInstants('2026-11-01', '01:30:00', 'America/New_York');
  assert.equal(matches.length, 2);
  assert.equal(window.end, matches.find(match => match.offset === -4).instant);
  const pastSource = resolve('2027-11-01', '01:30:00', 'America/New_York');
  const past = presetWindow(pastSource, 'past-year', 'America/New_York', transitInstants);
  assert.equal(past.start, transitInstants('2026-11-01', '01:30:00', 'America/New_York').find(match => match.offset === -4).instant);
  assert.equal(past.end, pastSource + 1000);
});

test('invalid presets and instants fail clearly', () => {
  assert.throws(() => presetWindow(0, 'hours6', 'UTC', transitInstants), RangeError);
  assert.throws(() => presetWindow(Number.NaN, 'year', 'UTC', transitInstants), RangeError);
});
