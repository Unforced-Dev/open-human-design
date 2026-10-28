import { test } from 'node:test';
import assert from 'node:assert/strict';
import { birthToParams, paramsToBirth } from '../src/lib/share.js';

const full = {
  name: 'Alex',
  birthDate: '1990-06-15',
  birthTime: '14:30',
  timeUnknown: false,
  timezone: -6,
  location: {
    lat: 39.7392,
    lon: -104.9847,
    timezone: -6,
    iana: 'America/Denver',
    name: 'Denver, Colorado, United States'
  }
};

test('round-trips full birth data', () => {
  const out = paramsToBirth(birthToParams(full).toString());
  assert.deepEqual(out, full);
});

test('minimal: date only', () => {
  const out = paramsToBirth('d=1990-06-15');
  assert.equal(out.birthDate, '1990-06-15');
  assert.equal(out.birthTime, '12:00');
  assert.equal(out.timezone, 0);
  assert.equal(out.location, null);
  assert.equal(out.name, null);
});

test('rejects malformed dates', () => {
  assert.equal(paramsToBirth('d=junk'), null);
  assert.equal(paramsToBirth('t=14:30'), null);
  assert.equal(paramsToBirth(''), null);
});

test('ignores malformed time/tz, keeps date', () => {
  const out = paramsToBirth('d=1990-06-15&t=banana&tz=soup');
  assert.equal(out.birthTime, '12:00');
  assert.equal(out.timezone, 0);
});

test('fractional timezone offsets survive', () => {
  const out = paramsToBirth('d=1985-03-20&t=08:00&tz=5.5');
  assert.equal(out.timezone, 5.5);
});

test('timeUnknown round-trips', () => {
  const out = paramsToBirth(birthToParams({ ...full, timeUnknown: true }).toString());
  assert.equal(out.timeUnknown, true);
  assert.equal(paramsToBirth('d=1990-06-15').timeUnknown, false);
});

test('the stand-in name "Me" never goes into a link', () => {
  const p = birthToParams({ ...full, name: 'Me' });
  assert.equal(p.has('n'), false);
  assert.equal(birthToParams({ ...full, name: 'Meg' }).get('n'), 'Meg');
});
