import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTransitGates, calculateHDTransits, calculateBirthPositions } from 'natalengine';
import { transitInstants, engineTransitArguments, formatTransitOffset } from '../src/lib/transit-time.js';

test('Shanghai wall time resolves to the intended UTC instant, including 45-minute zones', () => {
  assert.equal(new Date(transitInstants('2026-09-23', '14:30', 'Asia/Shanghai')[0].instant).toISOString(), '2026-09-23T06:30:00.000Z');
  assert.equal(new Date(transitInstants('2026-09-23', '14:30', 'Asia/Kathmandu')[0].instant).toISOString(), '2026-09-23T08:45:00.000Z');
});

test('DST gap is rejected and repeated hour offers both instants', () => {
  assert.deepEqual(transitInstants('2026-03-08', '02:30', 'America/New_York'), []);
  const matches = transitInstants('2026-11-01', '01:30', 'America/New_York');
  assert.deepEqual(matches.map(m => new Date(m.instant).toISOString()), [
    '2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z'
  ]);
});

test('engine receives the selected minute and changes transit output during the day', () => {
  const times = ['08:00', '14:00', '20:00'].map(time => {
    const instant = transitInstants('2026-09-23', time, 'Asia/Shanghai')[0].instant;
    const [date, offset] = engineTransitArguments(instant);
    return calculateTransitGates(date, offset);
  });
  assert.deepEqual(times.map(t => `${t.gates.moon.gate}.${t.gates.moon.line}`), ['13.3', '13.6', '49.4']);
  // 20:00 in Shanghai is the engine's legacy date-only default: noon UTC.
  assert.deepEqual(times[2].gates, calculateTransitGates('2026-09-23').gates);
});

test('historical DST, half-hour zones and midnight use the selected date', () => {
  for (const [date, time, zone, expected] of [
    ['1944-06-15', '12:00', 'Europe/London', '1944-06-15T10:00:00.000Z'],
    ['2026-09-23', '00:00', 'Asia/Kolkata', '2026-09-22T18:30:00.000Z'],
    ['2026-01-15', '12:00', 'America/New_York', '2026-01-15T17:00:00.000Z'],
    ['2026-07-15', '12:00', 'America/New_York', '2026-07-15T16:00:00.000Z']
  ]) {
    assert.equal(new Date(transitInstants(date, time, zone)[0].instant).toISOString(), expected);
  }
});

test('same wall time in different zones changes the engine instant', () => {
  const shanghai = transitInstants('2026-09-23', '14:30', 'Asia/Shanghai')[0].instant;
  const london = transitInstants('2026-09-23', '14:30', 'Europe/London')[0].instant;
  assert.equal((london - shanghai) / 3600000, 7);
});

test('optional seconds survive timezone conversion, midnight and DST folds', () => {
  assert.deepEqual(transitInstants('2026-09-23', '14:30', 'Asia/Shanghai'), transitInstants('2026-09-23', '14:30:00', 'Asia/Shanghai'));
  for (const [date, time, zone, expected] of [
    ['2026-09-23', '14:30:25', 'Asia/Shanghai', '2026-09-23T06:30:25.000Z'],
    ['2026-09-23', '00:00:01', 'Asia/Kathmandu', '2026-09-22T18:15:01.000Z'],
    ['2026-12-31', '23:59:59', 'America/New_York', '2027-01-01T04:59:59.000Z']
  ]) {
    assert.equal(new Date(transitInstants(date, time, zone)[0].instant).toISOString(), expected);
  }
  assert.deepEqual(transitInstants('2026-03-08', '02:30:25', 'America/New_York'), []);
  assert.deepEqual(transitInstants('2026-11-01', '01:30:25', 'America/New_York').map(m => new Date(m.instant).toISOString()), [
    '2026-11-01T05:30:25.000Z', '2026-11-01T06:30:25.000Z'
  ]);
  for (const time of ['14:30:60', '24:00:00', '14:30:25.5', '']) {
    assert.throws(() => transitInstants('2026-09-23', time, 'UTC'), /valid date and time/);
  }
});

test('historical offsets retain seconds in conversion and display', () => {
  const { instant, offset } = transitInstants('1900-01-01', '12:00:25', 'Asia/Kathmandu')[0];
  assert.equal(new Date(instant).toISOString(), '1900-01-01T06:19:09.000Z');
  assert.equal(formatTransitOffset(offset), 'UTC+5:41:16');
  assert.equal(formatTransitOffset(-offset), 'UTC-5:41:16');
  assert.equal(formatTransitOffset(8), 'UTC+8');
  assert.equal(formatTransitOffset(5.75), 'UTC+5:45');
});

test('both transit APIs match direct astronomy at the exact second, not the start of the minute', () => {
  // Include host DST boundaries and year rollover; run with several host TZ values.
  for (const iso of ['1900-01-01T12:00:25Z', '2026-09-23T06:30:25Z', '2026-03-08T10:00:01Z', '2026-11-01T09:30:25Z', '2027-01-01T00:00:01Z']) {
    const instant = Date.parse(iso);
    const utc = new Date(instant);
    const expected = calculateBirthPositions(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate(),
      utc.getUTCHours() + utc.getUTCMinutes() / 60 + utc.getUTCSeconds() / 3600, 0, null, null, { preserveSeconds: true });
    const args = engineTransitArguments(instant);
    const gates = calculateTransitGates(...args).gates;
    for (const planet of ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'northNode']) {
      assert.ok(Math.abs(gates[planet].longitude - expected[planet].longitude) < 1e-8, `${iso}: ${planet}`);
    }
    assert.notEqual(gates.moon.longitude, calculateTransitGates(...engineTransitArguments(instant - utc.getUTCSeconds() * 1000)).gates.moon.longitude);
    assert.deepEqual(calculateHDTransits({}, ...args).transitGates, gates);
  }
});

test('adjacent seconds can cross a transit gate boundary in the pinned engine', () => {
  const moons = ['14:10:41', '14:10:42'].map(time => {
    const { instant } = transitInstants('2026-09-23', time, 'Asia/Shanghai')[0];
    return calculateTransitGates(...engineTransitArguments(instant)).gates.moon;
  });
  assert.deepEqual(moons.map(moon => `${moon.gate}.${moon.line}`), ['13.6', '49.1']);
});
