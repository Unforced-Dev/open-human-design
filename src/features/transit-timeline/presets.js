import { DAY } from './core.js';
import { wallTime } from './time.js';

export const RANGE_OPTIONS = [
  ['1', 'hours24'], ['3', 'days3'], ['7', 'days7'], ['28', 'days28'],
  ['year', 'year1'], ['past-year', 'pastYear1'],
];

/** Match the local anniversary, clamping February 29 and resolving DST edges. */
function anniversary(instant, direction, zone, resolveTime) {
  const wall = wallTime(instant, zone);
  const [year, month, day] = wall.date.split('-').map(Number);
  const targetYear = year + direction;
  const targetDay = Math.min(day, new Date(Date.UTC(targetYear, month, 0)).getUTCDate());
  const local = Date.UTC(targetYear, month - 1, targetDay, ...wall.time.split(':').map(Number));
  const originalOffset = (Date.parse(`${wall.date}T${wall.time}Z`) - instant) / 3600000;
  // If the anniversary falls in a spring-forward gap, use its next valid minute.
  for (let minute = 0; minute <= 180; minute++) {
    const candidate = new Date(local + minute * 60000).toISOString();
    const matches = resolveTime(candidate.slice(0, 10), candidate.slice(11, 19), zone);
    if (matches.length) return (matches.find(value => value.offset === originalOffset) || matches[0]).instant;
  }
  throw new RangeError('Could not resolve the anniversary in this timezone');
}

function localDayBoundary(date, zone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const localDate = instant => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const utcMidnight = Date.parse(`${date}T00:00:00Z`);
  let low = utcMidnight - 2 * DAY;
  let high = utcMidnight + 3 * DAY;
  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (localDate(middle) < date) low = middle;
    else high = middle;
  }
  // A skipped local date resolves to the first instant of the next date.
  return high;
}

function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function presetWindow(instant, preset, zone, resolveTime) {
  if (!Number.isFinite(instant) || !RANGE_OPTIONS.some(([value]) => value === preset)) {
    throw new RangeError('Invalid timeline preset');
  }
  if (preset === 'year') return { start: instant, end: anniversary(instant, 1, zone, resolveTime) };
  if (preset === 'past-year') {
    const end = instant + 1000; // Include the selected second in the exclusive range.
    return { start: anniversary(instant, -1, zone, resolveTime), end };
  }
  const currentDate = wallTime(instant, zone).date;
  if (preset === '1') return {
    start: localDayBoundary(currentDate, zone),
    end: localDayBoundary(shiftDate(currentDate, 1), zone)
  };
  const daysBefore = { '3': 1, '7': 3, '28': 14 }[preset];
  const daysAfter = Number(preset) - daysBefore;
  return {
    start: localDayBoundary(shiftDate(currentDate, -daysBefore), zone),
    end: localDayBoundary(shiftDate(currentDate, daysAfter), zone)
  };
}
