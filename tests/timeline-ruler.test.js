import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarRuler } from '../src/features/transit-timeline/ruler.js';

const at = iso => Date.parse(iso);
const DAY = 86_400_000;

test('New York spring and fall DST days have their real widths', () => {
  const spring = calendarRuler({ start: at('2026-03-07T05:00:00Z'), end: at('2026-03-10T04:00:00Z') }, 'America/New_York', 'en-US');
  assert.deepEqual(spring.cells.map(cell => cell.date), ['2026-03-07', '2026-03-08', '2026-03-09']);
  assert.deepEqual(spring.cells.map(cell => (cell.end - cell.start) / 3_600_000), [24, 23, 24]);
  assert.deepEqual(spring.cells.map(cell => (cell.dayEnd - cell.dayStart) / 3_600_000), [24, 23, 24]);
  assert.deepEqual(spring.boundaries, [at('2026-03-08T05:00:00Z'), at('2026-03-09T04:00:00Z')]);
  const fall = calendarRuler({ start: at('2026-10-31T04:00:00Z'), end: at('2026-11-03T05:00:00Z') }, 'America/New_York', 'en-US');
  assert.deepEqual(fall.cells.map(cell => (cell.end - cell.start) / 3_600_000), [24, 25, 24]);
  assert.deepEqual(fall.cells.map(cell => (cell.dayEnd - cell.dayStart) / 3_600_000), [24, 25, 24]);
  assert.deepEqual(fall.boundaries, [at('2026-11-01T04:00:00Z'), at('2026-11-02T05:00:00Z')]);
});

test('Shanghai cells cross month and year using local midnight', () => {
  const ruler = calendarRuler({ start: at('2026-12-30T16:00:00Z'), end: at('2027-01-02T16:00:00Z') }, 'Asia/Shanghai', 'zh-CN');
  assert.deepEqual(ruler.cells.map(cell => cell.date), ['2026-12-31', '2027-01-01', '2027-01-02']);
  assert.deepEqual(ruler.boundaries, [at('2026-12-31T16:00:00Z'), at('2027-01-01T16:00:00Z')]);
  assert.equal(ruler.cells[1].date, '2027-01-01');
  assert.ok(ruler.cells.every(cell => cell.showLabel));
});

test('one-hour and six-hour windows retain their true date cells without artificial quarters', () => {
  const hour = calendarRuler({ start: at('2026-09-24T01:00:00Z'), end: at('2026-09-24T02:00:00Z') }, 'Asia/Shanghai', 'zh-CN');
  assert.equal(hour.cells.length, 1);
  assert.deepEqual(hour.boundaries, []);
  assert.equal(hour.cells[0].showLabel, false);
  assert.equal(hour.cells[0].date, '2026-09-24');
  assert.equal(hour.cells[0].dayStart, at('2026-09-23T16:00:00Z'));
  assert.equal(hour.cells[0].dayEnd, at('2026-09-24T16:00:00Z'));
  const six = calendarRuler({ start: at('2026-09-23T14:00:00Z'), end: at('2026-09-23T20:00:00Z') }, 'Asia/Shanghai', 'zh-CN');
  assert.deepEqual(six.cells.map(cell => cell.date), ['2026-09-23', '2026-09-24']);
  assert.deepEqual(six.boundaries, [at('2026-09-23T16:00:00Z')]);
  assert.deepEqual(six.cells.map(cell => (cell.end - cell.start) / 3_600_000), [2, 4]);
});

test('daily ruler labels every full local hour cell, including DST gaps and repeats', () => {
  const ordinary = calendarRuler({ start: at('2026-09-23T16:00:00Z'),
    end: at('2026-09-24T16:00:00Z') }, 'Asia/Shanghai', 'zh-CN', 280);
  assert.equal(ordinary.cells.length, 24);
  assert.equal(ordinary.boundaries.length, 23);
  assert.ok(ordinary.cells.every(cell => cell.granularity === 'hour'));
  assert.deepEqual(ordinary.cells.map(cell => cell.label),
    Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0')));
  assert.ok(ordinary.cells.every(cell => cell.showLabel && cell.dayEnd - cell.dayStart === 3_600_000));
  assert.equal(ordinary.cells[1].dayStart, at('2026-09-23T17:00:00Z'));
  assert.equal(ordinary.cells[1].dayEnd, at('2026-09-23T18:00:00Z'));
  assert.equal(ordinary.cells[1].label, '01');
  assert.deepEqual(ordinary.labels, []);

  const spring = calendarRuler({ start: at('2026-03-08T05:00:00Z'),
    end: at('2026-03-09T04:00:00Z') }, 'America/New_York', 'en-US', 1000);
  assert.equal(spring.cells.length, 23);
  assert.ok(spring.cells.some(cell => cell.label === '03'));
  assert.ok(!spring.cells.some(cell => cell.label === '02'));

  const fall = calendarRuler({ start: at('2026-11-01T04:00:00Z'),
    end: at('2026-11-02T05:00:00Z') }, 'America/New_York', 'en-US', 1000);
  assert.equal(fall.cells.length, 25);
  assert.equal(fall.cells.filter(cell => cell.label === '01').length, 2);
  assert.notEqual(...fall.cells.filter(cell => cell.label === '01').map(cell => cell.title));
});

test('28-day window keeps every boundary and uses day numbers within their cells', () => {
  const start = at('2026-09-01T00:00:00Z');
  const ruler = calendarRuler({ start, end: start + 28 * DAY }, 'UTC', 'en-US', 400);
  assert.equal(ruler.cells.length, 28);
  assert.equal(ruler.boundaries.length, 27);
  assert.ok(ruler.cells.every(cell => cell.showLabel));
  assert.deepEqual(ruler.cells.slice(0, 2).map(cell => cell.label), ['1', '2']);
  assert.equal(ruler.cells[0].start, start);
  assert.equal(ruler.cells.at(-1).end, start + 28 * DAY);
  assert.ok(ruler.cells.every((cell, index) => index === 0 || cell.start === ruler.cells[index - 1].end));
});

test('year window uses local calendar months with a visible year crossing', () => {
  const start = at('2026-09-24T00:00:00Z');
  const end = start + 365 * DAY;
  const ruler = calendarRuler({ start, end }, 'UTC', 'zh-CN', 400);
  assert.equal(ruler.cells.length, 13);
  assert.equal(ruler.boundaries.length, 12);
  assert.ok(ruler.cells.every(cell => cell.granularity === 'month'));
  assert.ok(ruler.cells.every(cell => cell.date.endsWith('-01')));
  assert.ok(ruler.cells.every((cell, index) => index === 0 || cell.start === ruler.cells[index - 1].end));
  assert.equal(ruler.cells[0].start, start);
  assert.equal(ruler.cells.at(-1).end, end);
  const january = ruler.cells.find(cell => cell.date === '2027-01-01');
  assert.equal(january.label, '2027');
  assert.equal(january.showLabel, true);
  assert.equal(january.dayStart, at('2027-01-01T00:00:00Z'));
  assert.equal(january.dayEnd, at('2027-02-01T00:00:00Z'));
  assert.ok(ruler.cells.every((cell, index) => index === 0 || cell.tone !== ruler.cells[index - 1].tone));
});

test('New York month boundaries use real spring and fall DST instants', () => {
  const spring = calendarRuler({
    start: at('2026-02-01T05:00:00Z'), end: at('2026-05-01T04:00:00Z')
  }, 'America/New_York', 'en-US');
  assert.deepEqual(spring.cells.map(cell => cell.date), ['2026-02-01', '2026-03-01', '2026-04-01']);
  assert.deepEqual(spring.boundaries, [at('2026-03-01T05:00:00Z'), at('2026-04-01T04:00:00Z')]);
  assert.equal((spring.cells[1].dayEnd - spring.cells[1].dayStart) / 3_600_000, 31 * 24 - 1);

  const fall = calendarRuler({
    start: at('2026-10-01T04:00:00Z'), end: at('2027-01-01T05:00:00Z')
  }, 'America/New_York', 'en-US');
  assert.deepEqual(fall.cells.map(cell => cell.date), ['2026-10-01', '2026-11-01', '2026-12-01']);
  assert.deepEqual(fall.boundaries, [at('2026-11-01T04:00:00Z'), at('2026-12-01T05:00:00Z')]);
  assert.equal((fall.cells[1].dayEnd - fall.cells[1].dayStart) / 3_600_000, 30 * 24 + 1);
});

test('month labels stay centered on full months when range pans and clips edges', () => {
  const first = calendarRuler({
    start: at('2026-12-20T16:00:00Z'), end: at('2027-03-10T16:00:00Z')
  }, 'Asia/Shanghai', 'zh-CN', 400);
  const second = calendarRuler({
    start: at('2026-12-25T16:00:00Z'), end: at('2027-03-11T16:00:00Z')
  }, 'Asia/Shanghai', 'zh-CN', 400);
  const a = first.cells.find(cell => cell.date === '2027-01-01');
  const b = second.cells.find(cell => cell.date === '2027-01-01');
  assert.deepEqual([a.dayStart, a.dayEnd], [b.dayStart, b.dayEnd]);
  assert.equal(a.label, '2027/1');
  assert.equal(a.showLabel, true);
  assert.equal(first.cells[0].showLabel, false);
  assert.equal(first.cells.at(-1).showLabel, false);
});

test('seven full days retain compact daily labels at narrow track width', () => {
  const start = at('2026-09-01T00:00:00Z');
  const ruler = calendarRuler({ start, end: start + 7 * DAY }, 'UTC', 'en-US', 280);
  assert.equal(ruler.cells.length, 7);
  assert.equal(ruler.boundaries.length, 6);
  assert.ok(ruler.cells.every(cell => cell.showLabel));
  assert.equal(ruler.cells[0].label, '9/1');
});

test('partial edge days hide labels that cannot fit, keeping the next full date', () => {
  const ruler = calendarRuler({ start: at('2026-08-31T23:58:00Z'), end: at('2026-09-08T00:10:00Z') }, 'UTC', 'en-US', 280);
  assert.equal(ruler.cells[0].showLabel, false);
  assert.equal(ruler.cells[1].showLabel, true);
  assert.equal(ruler.cells.at(-1).showLabel, false);
  assert.equal(ruler.boundaries.length, ruler.cells.length - 1);
});

test('cross-year labels stay within their own dates', () => {
  const ruler = calendarRuler({ start: at('2026-12-29T00:00:00Z'), end: at('2027-01-03T00:00:00Z') }, 'UTC', 'zh-CN', 160);
  const jan = ruler.cells.find(cell => cell.date === '2027-01-01');
  assert.equal(jan.showLabel, true);
  assert.equal(jan.label, '1/1');
  assert.equal(ruler.cells.find(cell => cell.date === '2026-12-31').showLabel, true);
});

test('panning only clips a date and does not move its full-day label anchor', () => {
  const first = calendarRuler({ start: at('2026-03-08T06:00:00Z'), end: at('2026-03-08T12:00:00Z') }, 'America/New_York', 'en-US');
  const second = calendarRuler({ start: at('2026-03-08T08:00:00Z'), end: at('2026-03-08T14:00:00Z') }, 'America/New_York', 'en-US');
  const a = first.cells[0], b = second.cells[0];
  assert.notEqual(a.start, b.start);
  assert.deepEqual([a.dayStart, a.dayEnd], [b.dayStart, b.dayEnd]);
  assert.deepEqual([a.dayStart, a.dayEnd], [at('2026-03-08T05:00:00Z'), at('2026-03-09T04:00:00Z')]);
  assert.equal((a.dayStart + a.dayEnd) / 2, (b.dayStart + b.dayEnd) / 2);
});

test('a skipped local date creates no empty cell', () => {
  const ruler = calendarRuler({ start: at('2011-12-29T10:00:00Z'), end: at('2011-12-31T10:00:00Z') }, 'Pacific/Apia', 'en-US');
  assert.deepEqual(ruler.cells.map(cell => cell.date), ['2011-12-29', '2011-12-31']);
  assert.deepEqual(ruler.boundaries, [at('2011-12-30T10:00:00Z')]);
});

test('invalid geometry fails clearly', () => {
  assert.throws(() => calendarRuler({ start: 5, end: 5 }, 'UTC', 'en-US'), RangeError);
  assert.throws(() => calendarRuler({ start: 0, end: 1 }, 'UTC', 'en-US', 0), RangeError);
});
