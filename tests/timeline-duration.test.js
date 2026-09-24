import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration } from '../src/features/transit-timeline/time.js';
import { translator } from '../src/features/transit-timeline/messages.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const en = translator();
const zh = translator({
  durationDay: '{count} 天', durationDays: '{count} 天',
  durationHour: '{count} 小时', durationHours: '{count} 小时',
  durationMinute: '{count} 分钟', durationMinutes: '{count} 分钟',
  durationUnderMinute: '不足 1 分钟', durationZero: '无持续时间',
});

test('duration keeps days and omits zero units', () => {
  assert.equal(formatDuration(7 * DAY, zh), '7 天');
  assert.equal(formatDuration(DAY + 2 * HOUR + 5 * MINUTE, zh), '1 天 2 小时 5 分钟');
  assert.equal(formatDuration(2 * HOUR, zh), '2 小时');
  assert.equal(formatDuration(5 * MINUTE, zh), '5 分钟');
});

test('English units use singular and plural forms', () => {
  assert.equal(formatDuration(DAY + HOUR + MINUTE, en), '1 day 1 hour 1 minute');
  assert.equal(formatDuration(2 * DAY + 3 * HOUR + 4 * MINUTE, en), '2 days 3 hours 4 minutes');
});

test('sub-minute positive spans and exact zero have distinct labels', () => {
  assert.equal(formatDuration(1000, zh), '不足 1 分钟');
  assert.equal(formatDuration(59_999, en), 'Less than 1 minute');
  assert.equal(formatDuration(0, zh), '无持续时间');
  assert.equal(formatDuration(0, en), 'No duration');
});

test('invalid durations fail clearly', () => {
  assert.throws(() => formatDuration(-1, zh), RangeError);
  assert.throws(() => formatDuration(Number.NaN, zh), RangeError);
});
