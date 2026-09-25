import { formatOffset } from './location.js';

const HOUR = 3600000;

/** Resolve a wall time to every matching instant (two during a DST fall-back). */
export function transitInstants(date, time, zone) {
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) throw new Error('Enter a valid date and time.');
  const clock = time.length === 5 ? `${time}:00` : time;
  const wall = Date.parse(`${date}T${clock}Z`);
  if (!Number.isFinite(wall)) throw new Error('Enter a valid date and time.');

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const partsAt = instant => Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value])
  );
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = wall + hours * HOUR;
    const p = partsAt(sample);
    const shown = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    offsets.add((shown - sample) / HOUR);
  }

  return [...offsets].map(offset => ({ instant: wall - offset * HOUR, offset }))
    .filter(({ instant }) => {
      const p = partsAt(instant);
      return `${p.year}-${p.month}-${p.day}` === date && `${p.hour}:${p.minute}:${p.second}` === clock;
    })
    .sort((a, b) => a.instant - b.instant);
}

/** Reuse the app's offset style, retaining seconds in historical zone offsets. */
export function formatTransitOffset(offset) {
  const seconds = Math.round(Math.abs(offset) * 3600);
  if (seconds % 60 === 0) return formatOffset(offset);
  return `UTC${offset < 0 ? '-' : '+'}${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** NatalEngine reads a Date through browser-local getters before applying its offset. */
export function engineTransitArguments(instant) {
  const date = new Date(instant);
  // getTimezoneOffset() truncates historical offsets to minutes (e.g. Nepal
  // used +05:41:16 in 1900). Reconstruct the local clock in UTC to retain seconds.
  const localClock = new Date(instant);
  localClock.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  localClock.setUTCHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  return [date, (localClock.getTime() - instant) / HOUR];
}
