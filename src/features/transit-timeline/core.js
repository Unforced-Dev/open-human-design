/** Time-domain calculation only. No DOM, language, theme or engine imports. */
export const MINUTE = 60_000;
export const DAY = 86_400_000;
// A 366-day local calendar span may gain an hour across a daylight-saving fold.
export const MAX_TIMELINE_SPAN = 367 * DAY;

/**
 * Scan each planet independently, then merge its transitions into chart states.
 * This preserves short combined intervals between different planets' crossings,
 * even when both crossings fall inside one scan step.
 * Times are estimates: same-planet out-and-back excursions within one scan step
 * can be missed. Never present the refinement tolerance as ephemeris accuracy.
 */
export function calculateTimeline({ start, end, snapshot, states, catalog,
  scanStep = MINUTE, tolerance = 1000, onProgress = () => {} }) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
      !Number.isFinite(scanStep) || !Number.isFinite(tolerance) ||
      scanStep < tolerance || tolerance < 1 || end - start > MAX_TIMELINE_SPAN) {
    throw new RangeError('Invalid timeline calculation range');
  }
  const rows = catalog.map(row => ({ ...row, intervals: [] }));
  const byKey = new Map(rows.map(row => [row.key, row]));
  const open = new Map();
  const transitions = [];
  let previous = snapshot(start);
  let previousTime = start;
  const planets = Object.keys(previous);

  const apply = (time, activations) => {
    const next = states(activations);
    for (const [key, interval] of open) {
      if (next.get(key) !== interval.source) {
        interval.end = time;
        byKey.get(key).intervals.push(interval);
        open.delete(key);
      }
    }
    for (const [key, source] of next) {
      if (!open.has(key) && byKey.has(key)) {
        open.set(key, { start: time, source, clippedStart: time === start });
      }
    }
  };
  apply(start, previous);
  const total = Math.ceil((end - start) / scanStep);
  const progressEvery = Math.max(120, Math.ceil(total / 100));
  for (let i = 1; i <= total; i++) {
    const time = Math.min(start + i * scanStep, end);
    const current = snapshot(time);
    let crossings;
    for (const planet of planets) {
      if (previous[planet].gate === current[planet]?.gate) continue;
      crossings ||= new Set();
      let lo = previousTime;
      let hi = time;
      const gate = previous[planet].gate;
      while (hi - lo > tolerance) {
        const mid = Math.floor((lo + hi) / 2 / tolerance) * tolerance;
        if (mid <= lo) break;
        if (snapshot(mid)[planet].gate === gate) lo = mid;
        else hi = mid;
      }
      crossings.add(hi);
    }
    if (crossings) for (const crossing of [...crossings].sort((a, b) => a - b)) {
      // end is an exclusive range boundary, not a visible event.
      if (crossing >= end) continue;
      apply(crossing, snapshot(crossing));
      transitions.push(crossing);
    }
    previous = current;
    previousTime = time;
    if (i % progressEvery === 0 || i === total) onProgress(i / total);
  }
  const endState = states(previous);
  for (const [key, interval] of open) {
    byKey.get(key).intervals.push({ ...interval, end,
      clippedEnd: endState.get(key) === interval.source });
  }
  return { start, end, rows, events: [...new Set(transitions)], scanStep, tolerance };
}

export function intervalAt(row, instant) {
  return row.intervals.find(interval => interval.start <= instant && instant < interval.end);
}

export function adjacentEvent(events, instant, direction) {
  return direction > 0 ? events.find(time => time > instant)
    : events.findLast(time => time < instant);
}

export function centeredWindow(instant, duration) {
  const start = Math.floor((instant - duration / 2) / 1000) * 1000;
  return { start, end: start + duration };
}
