import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration } from '../src/features/transit-timeline/time.js';
import { t } from '../src/features/transit-timeline/messages.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test('duration keeps days and omits zero units', () => {
  assert.equal(formatDuration(7 * DAY, t), '7 days');
  assert.equal(formatDuration(DAY + 2 * HOUR + 5 * MINUTE, t), '1 day 2 hours 5 minutes');
  assert.equal(formatDuration(2 * HOUR, t), '2 hours');
  assert.equal(formatDuration(5 * MINUTE, t), '5 minutes');
});

test('English units use singular and plural forms', () => {
  assert.equal(formatDuration(DAY + HOUR + MINUTE, t), '1 day 1 hour 1 minute');
  assert.equal(formatDuration(2 * DAY + 3 * HOUR + 4 * MINUTE, t), '2 days 3 hours 4 minutes');
});

test('sub-minute positive spans and exact zero have distinct labels', () => {
  assert.equal(formatDuration(1000, t), 'Less than 1 minute');
  assert.equal(formatDuration(59_999, t), 'Less than 1 minute');
  assert.equal(formatDuration(0, t), 'No duration');
});

test('invalid durations fail clearly', () => {
  assert.throws(() => formatDuration(-1, t), RangeError);
  assert.throws(() => formatDuration(Number.NaN, t), RangeError);
});
