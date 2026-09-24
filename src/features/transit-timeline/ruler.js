const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const zoneCache = new Map();
const labelCache = new Map();

function calendarZone(zone) {
  if (!zoneCache.has(zone)) {
    zoneCache.set(zone, {
      formatter: new Intl.DateTimeFormat('en-CA', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
      }),
      boundaries: new Map()
    });
  }
  return zoneCache.get(zone);
}

function calendarLabels(zone, locale) {
  const key = `${zone}\0${locale}`;
  if (!labelCache.has(key)) {
    labelCache.set(key, {
      date: new Intl.DateTimeFormat(locale, { timeZone: zone, month: 'numeric', day: 'numeric' }),
      month: new Intl.DateTimeFormat(locale, { timeZone: zone, month: 'short' })
    });
  }
  return labelCache.get(key);
}

const labelWidth = label => Math.ceil([...label].reduce((width, char) =>
  width + (/[^\u0000-\u00ff]/.test(char) ? 9 : /[MW]/.test(char) ? 8 : 5.5), 0)) + 2;

/** Local calendar day cells, or month cells when the range exceeds 60 days.
 * dayStart/dayEnd remain the full cell boundaries for the existing view API.
 */
export function calendarRuler(range, zone, locale, widthPx = 400) {
  if (!Number.isFinite(range?.start) || !Number.isFinite(range?.end) || range.end <= range.start ||
      !Number.isFinite(widthPx) || widthPx <= 0) {
    throw new RangeError('Invalid calendar ruler range or width');
  }
  const { formatter: dateFormat, boundaries: dayBoundaries } = calendarZone(zone);
  const labels = calendarLabels(zone, locale);
  const dateAt = instant => {
    const parts = Object.fromEntries(dateFormat.formatToParts(instant).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const duration = range.end - range.start;
  if (duration >= 20 * HOUR && duration <= 26 * HOUR) {
    const hourTitle = new Intl.DateTimeFormat(locale, {
      timeZone: zone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZoneName: 'shortOffset', hourCycle: 'h23'
    });
    const wallFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
    const wallParts = instant => Object.fromEntries(wallFormatter.formatToParts(instant).map(part => [part.type, part.value]));
    const wall = wallParts(range.start);
    let hourStart = range.start - Number(wall.minute) * 60_000 - Number(wall.second) * 1000
      - new Date(range.start).getUTCMilliseconds();
    const cells = [], boundaries = [];
    while (hourStart < range.end) {
      const next = hourStart + HOUR;
      const start = Math.max(range.start, hourStart);
      const end = Math.min(range.end, next);
      if (end > start) {
        const hour = Number(wallParts(hourStart).hour);
        cells.push({ start, end, dayStart: hourStart, dayEnd: next,
          date: dateAt(start), label: String(hour).padStart(2, '0'), showLabel: true,
          title: hourTitle.format(hourStart),
          tone: cells.length % 2, granularity: 'hour' });
        if (next < range.end) boundaries.push(next);
      }
      hourStart = next;
    }
    return { cells, boundaries, labels: [] };
  }
  if (duration > 60 * DAY) {
    const monthAt = instant => dateAt(instant).slice(0, 7);
    const cells = [];
    const boundaries = [];
    let start = range.start;
    let monthStart;
    while (start < range.end) {
      const month = monthAt(start);
      if (monthStart === undefined) {
        let low = start - 32 * DAY;
        while (monthAt(low) === month) low -= 32 * DAY;
        let high = start;
        while (high - low > 1) {
          const middle = low + Math.floor((high - low) / 2);
          if (monthAt(middle) === month) high = middle;
          else low = middle;
        }
        monthStart = high;
      }
      let high = start + 32 * DAY;
      while (monthAt(high) === month) high += 32 * DAY;
      let low = start;
      while (high - low > 1) {
        const middle = low + Math.floor((high - low) / 2);
        if (monthAt(middle) === month) low = middle;
        else high = middle;
      }
      const monthEnd = high;
      const end = Math.min(range.end, monthEnd);
      const year = Number(month.slice(0, 4));
      const monthNumber = Number(month.slice(5));
      const center = (monthStart + monthEnd) / 2;
      const space = Math.min(center - start, end - center) / duration * widthPx;
      const fullLabel = monthNumber === 1 ? `${year}/${monthNumber}` : labels.month.format(start);
      const shortLabel = monthNumber === 1 ? String(year) : String(monthNumber);
      const label = labelWidth(fullLabel) / 2 <= space ? fullLabel : shortLabel;
      cells.push({
        start, end, dayStart: monthStart, dayEnd: monthEnd,
        date: `${month}-01`, label, dayLabel: String(monthNumber),
        showLabel: labelWidth(label) / 2 <= space,
        tone: (year * 12 + monthNumber) % 2,
        granularity: 'month'
      });
      if (end < range.end) boundaries.push(end);
      start = end;
      monthStart = monthEnd;
    }
    return { cells, boundaries };
  }
  const cells = [];
  const boundaries = [];
  let start = range.start;
  let dayStart;
  while (start < range.end) {
    const date = dateAt(start);
    if (dayStart === undefined) {
      let low = start - DAY;
      while (dateAt(low) === date) low -= DAY;
      let high = start;
      while (high - low > 1) {
        const middle = low + Math.floor((high - low) / 2);
        if (dateAt(middle) === date) high = middle;
        else low = middle;
      }
      dayStart = high;
    }
    let next = dayBoundaries.get(date);
    if (next === undefined || next <= start) {
      let high = start + DAY;
      while (dateAt(high) === date) high += DAY;
      let low = start;
      while (high - low > 1) {
        const middle = low + Math.floor((high - low) / 2);
        if (dateAt(middle) === date) low = middle;
        else high = middle;
      }
      next = high;
      dayBoundaries.set(date, next);
      if (dayBoundaries.size > 128) dayBoundaries.delete(dayBoundaries.keys().next().value);
    }
    const end = Math.min(range.end, next);
    cells.push({ start, end, dayStart, dayEnd: next, date,
      label: labels.date.format(start), dayLabel: String(Number(date.slice(-2))), showLabel: false });
    if (end < range.end) boundaries.push(end);
    start = end;
    dayStart = next;
  }

  // Text is centered in the full local day and clipped to its visible cell.
  const longWindow = duration > 7 * DAY;
  for (const cell of cells) {
    const center = (cell.dayStart + cell.dayEnd) / 2;
    const leftSpace = (center - cell.start) / duration * widthPx;
    const rightSpace = (cell.end - center) / duration * widthPx;
    const full = cell.label;
    cell.label = longWindow || labelWidth(full) / 2 > Math.min(leftSpace, rightSpace)
      ? cell.dayLabel : full;
    cell.showLabel = labelWidth(cell.label) / 2 <= Math.min(leftSpace, rightSpace);
  }
  return { cells, boundaries };
}
