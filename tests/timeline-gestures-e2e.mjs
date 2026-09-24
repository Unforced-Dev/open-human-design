/** Browser regression checks for the compact timeline and its gestures.
 * Run against a local dev server: npm run e2e:timeline
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.E2E_URL || 'http://127.0.0.1:5173';
const entry = `${base}/?d=1990-06-15&t=14:30&tz=8&n=Gesture%20Demo&view=timeline`;
const chrome = process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH }
  : { channel: process.env.CHROME_CHANNEL || 'chrome' };
const root = '#timeline-view';
const tableSelector = `${root} .tl-table`;
const browser = await chromium.launch({ ...chrome, headless: true });
const errors = [];

const state = async page => page.locator(tableSelector).evaluate(table => ({
  selected: Number(table.dataset.selected),
  start: Number(table.dataset.start),
  end: Number(table.dataset.end),
  calculatedStart: Number(table.dataset.calculatedStart),
  calculatedEnd: Number(table.dataset.calculatedEnd),
  scrollTop: table.scrollTop,
}));
const expectedLocalRange = (page, days) => page.evaluate(async days => {
  const table = document.querySelector('#timeline-view .tl-table');
  const selected = Number(table.dataset.selected);
  const zone = document.querySelector('#timeline-view [data-field="zone"]').value;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(selected).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const addDays = offset => new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  const { transitInstants } = await import('/src/lib/transit-time.js');
  const before = days === 1 ? 0 : days === 3 ? 1 : days === 7 ? 3 : 14;
  const after = days === 1 ? 1 : days === 3 ? 2 : days === 7 ? 4 : 14;
  return { start: transitInstants(addDays(-before), '00:00:00', zone)[0].instant,
    end: transitInstants(addDays(after), '00:00:00', zone)[0].instant };
}, days);
const ready = async (page, spanDays, timeout = 120000) => {
  await page.waitForFunction(({ spanDays }) => {
    const table = document.querySelector('#timeline-view .tl-table');
    if (!table || table.getAttribute('aria-busy') !== 'false') return false;
    const { selected } = table.dataset;
    const duration = Number(table.dataset.calculatedEnd) - Number(table.dataset.calculatedStart);
    return Number.isFinite(Number(selected)) && Number.isFinite(duration)
      && duration > 0
      && Number.isFinite(Number(table.dataset.calculatedStart))
      && Number.isFinite(Number(table.dataset.calculatedEnd))
      && (!spanDays || document.querySelector('#timeline-view [data-field="span"]')?.value === String(spanDays))
      && !!table.querySelector('.tl-bar');
  }, { spanDays }, { timeout });
};
const moonMatches = async page => {
  await page.waitForFunction(async () => {
    const table = document.querySelector('#timeline-view .tl-table');
    const actual = document.querySelector('#timeline-view .tl-planets [data-planet="moon"] strong')?.textContent;
    if (!table || !actual) return false;
    const { snapshot } = await import('/src/features/transit-timeline/provider.js');
    const moon = snapshot(Number(table.dataset.selected)).moon;
    return actual === `${moon.gate}.${moon.line}`;
  }, null, { timeout: 10000 });
};
const birthMoon = page => page.locator(`${root} .tl-birth-value[data-birth-planet="moon"]`).evaluateAll(nodes =>
  Object.fromEntries(nodes.map(node => [node.dataset.side, node.querySelector('.bg-planet-act')?.textContent.trim()])));
const birthValues = page => page.locator(`${root} .tl-birth-value`).evaluateAll(nodes =>
  Object.fromEntries(nodes.map(node => [`${node.dataset.side}:${node.dataset.birthPlanet}`, node.querySelector('.bg-planet-act')?.textContent.trim()])));
const checkFixings = async (page, mode) => {
  const result = await page.evaluate(async mode => {
    // Vite may append an HMR timestamp. Import the same chart module instance
    // as the running app so its current chart is the real engine result.
    const chartUrl = performance.getEntriesByType('resource')
      .map(resource => resource.name)
      .filter(name => /\/src\/views\/chart\.js(?:\?|$)/.test(name)).at(-1);
    if (!chartUrl) throw new Error('active chart module was not loaded');
    const [{ getCurrentChart }, { snapshot }, { calculateLineFixings, calculateTransitLineFixings }] = await Promise.all([
      import(chartUrl), import('/src/features/transit-timeline/provider.js'),
      import('/src/features/transit-timeline/line-fixing.js'),
    ]);
    const chart = getCurrentChart().chart;
    const selected = Number(document.querySelector('#timeline-view .tl-table').dataset.selected);
    const transit = snapshot(selected);
    const birth = calculateLineFixings(chart, transit);
    const sky = calculateTransitLineFixings(chart, transit);
    const transitRows = [...document.querySelectorAll('#timeline-view .tl-planet[data-planet]')].map(node => ({
      planet: node.dataset.planet,
      actual: node.querySelector('.tl-fixing-mark')?.dataset.state,
      expected: mode === 'transit-only' ? sky[node.dataset.planet]?.transitOnlyState : sky[node.dataset.planet]?.combinedState,
      value: node.querySelector('.bg-planet-act')?.textContent.trim(),
      expectedValue: `${transit[node.dataset.planet]?.gate}.${transit[node.dataset.planet]?.line}`,
    }));
    const birthRows = [...document.querySelectorAll('#timeline-view .tl-birth-value[data-side][data-birth-planet]')].map(node => ({
      side: node.dataset.side, planet: node.dataset.birthPlanet,
      actual: node.querySelector('.tl-fixing-mark')?.dataset.state,
      expected: birth[node.dataset.side]?.[node.dataset.birthPlanet]?.transitAdjustedState,
      value: node.querySelector('.bg-planet-act')?.textContent.trim(),
      expectedValue: `${chart.gates[node.dataset.side]?.[node.dataset.birthPlanet]?.gate}.${chart.gates[node.dataset.side]?.[node.dataset.birthPlanet]?.line}`,
    }));
    return { transitRows, birthRows };
  }, mode);
  assert.ok(result.transitRows.length >= 10 && result.birthRows.length >= 20, 'real chart planets are rendered');
  for (const row of [...result.transitRows, ...result.birthRows]) {
    assert.equal(row.actual, row.expected, `${mode} ${row.side || 'transit'} ${row.planet} fixing`);
    assert.equal(row.value, row.expectedValue, `${mode} ${row.side || 'transit'} ${row.planet} value`);
  }
};
const checkWidth = async (page, label) => {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(dimensions.html <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1,
    `${label} horizontal overflow: ${JSON.stringify(dimensions)}`);
};
const checkCompactPlanets = async (page, label, mobile = false) => {
  const layout = await page.evaluate(() => {
    const root = document.querySelector('#timeline-view');
    const gaps = selector => [...root.querySelectorAll(selector)].flatMap(node => {
      const mark = node.querySelector('.tl-fixing-mark');
      if (!mark?.textContent.trim()) return [];
      return [mark.getBoundingClientRect().left - node.querySelector('.bg-planet-act').getBoundingClientRect().right];
    });
    const span = root.querySelector('[data-field="span"]');
    return { transitGaps: gaps('.tl-transit-column .tl-planet'),
      personalityGaps: gaps('.tl-birth-value[data-side="personality"]'),
      spanWidth: span.getBoundingClientRect().width,
      spanAlign: getComputedStyle(span).textAlign,
      spanInMobilePanel: !!span.closest('.tl-mobile-controls-panel'),
      selectedSpan: span.value };
  });
  assert.ok(layout.transitGaps.length > 0 && layout.personalityGaps.length > 0,
    `${label} has visible arrow marks: ${JSON.stringify(layout)}`);
  for (const gap of [...layout.transitGaps, ...layout.personalityGaps])
    assert.ok(Math.abs(gap - 2) < 1, `${label} value-to-arrow gap ${gap}px`);
  assert.equal(layout.selectedSpan, '7');
  if (mobile) assert.ok(layout.spanInMobilePanel, `${label} range moved to floating controls`);
  else assert.ok(layout.spanWidth < 79 && layout.spanAlign === 'right',
    `${label} compact right-aligned range: ${JSON.stringify(layout)}`);
};
const checkMidnightRuler = async (page, date, expectedHours) => {
  const result = await page.evaluate(async ({ date }) => {
    const { transitInstants } = await import('/src/lib/transit-time.js');
    const table = document.querySelector('#timeline-view .tl-table');
    const zone = document.querySelector('#timeline-view [data-field="zone"]').value;
    const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const midnight = transitInstants(date, '00:00:00', zone)[0].instant;
    const nextMidnight = transitInstants(next, '00:00:00', zone)[0].instant;
    const start = Number(table.dataset.start);
    const end = Number(table.dataset.end);
    const ticks = table.querySelector('.tl-ticks').getBoundingClientRect();
    const cell = table.querySelector(`.tl-date-cell[data-date="${date}"]`);
    const line = [...table.querySelectorAll('.tl-row .tl-gridline[data-instant]')]
      .find(node => Number(node.dataset.instant) === midnight);
    const track = line?.closest('.tl-track')?.getBoundingClientRect();
    return { hours: (nextMidnight - midnight) / 3600000, inView: midnight >= start && nextMidnight <= end,
      cellCount: table.querySelectorAll('.tl-date-cell[data-date]').length,
      oldTickCount: table.querySelectorAll('.tl-tick').length,
      cellLeft: cell?.getBoundingClientRect().left, cellWidth: cell?.getBoundingClientRect().width,
      expectedLeft: ticks.left + (midnight - start) / (end - start) * ticks.width,
      expectedWidth: (nextMidnight - midnight) / (end - start) * ticks.width,
      lineLeft: line?.getBoundingClientRect().left,
      expectedLineLeft: track && track.left + (midnight - start) / (end - start) * track.width };
  }, { date });
  assert.equal(result.hours, expectedHours, `${date} is a ${expectedHours}-hour civil day`);
  assert.equal(result.inView, true, `${date} is fully visible: ${JSON.stringify(result)}`);
  assert.ok(result.cellCount >= 2 && result.oldTickCount === 0, `date-only ruler: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.cellLeft - result.expectedLeft) < 2 && Math.abs(result.cellWidth - result.expectedWidth) < 2,
    `${date} cell follows real local midnights: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.lineLeft - result.expectedLineLeft) < 2 && Math.abs(result.lineLeft - result.cellLeft) < 2,
    `${date} gridline aligns with ruler: ${JSON.stringify(result)}`);
};
const log = async (label, fn) => { await fn(); console.log(`✓ ${label}`); };

try {
  const context = await browser.newContext({ viewport: { width: 927, height: 713 } });
  await context.addInitScript(() => {
    window.__tlWorkerCount = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); window.__tlWorkerCount++; }
    };
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`desktop: ${error.message}`));
  await page.goto(entry);
  await ready(page, 7);
  await moonMatches(page);
  await log('overlay fixing marks match chart and transit algorithms', () => checkFixings(page, 'overlay'));

  await log('compact desktop layout and fixed birth values', async () => {
    await checkWidth(page, '927px');
    assert.equal(await page.locator(`${root} .tl-scrubber, ${root} .tl-stats`).count(), 0);
    const layout = await page.evaluate(() => {
      const table = document.querySelector('#timeline-view .tl-table');
      const header = table.querySelector('.tl-panel-header');
      const row = document.querySelector('#timeline-view .tl-row');
      const name = row.querySelector('.tl-row-name').getBoundingClientRect();
      const track = row.querySelector('.tl-track').getBoundingClientRect();
      const fields = ['kind', 'search', 'span', 'changes'].map(key => header.querySelector(`[data-field="${key}"]`));
      const fieldRects = fields.map(field => field.getBoundingClientRect());
      const headerTop = header.getBoundingClientRect().top;
      table.scrollTop = 180;
      const stuckTop = header.getBoundingClientRect().top;
      table.scrollTop = 0;
      return { headerHeight: header.getBoundingClientRect().height,
        sticky: getComputedStyle(header).position === 'sticky',
        stickyShift: stuckTop - headerTop,
        fieldRowSpread: Math.max(...fieldRects.slice(1).map(rect => rect.top)) - Math.min(...fieldRects.slice(1).map(rect => rect.top)),
        removedControls: document.querySelectorAll('#timeline-view .tl-steps, #timeline-view .tl-window-controls').length,
        nameWidth: name.width, trackWidth: track.width };
    });
    assert.ok(layout.headerHeight <= 60 && layout.sticky && Math.abs(layout.stickyShift) < 2
      && layout.fieldRowSpread < 12 && layout.removedControls === 0,
      `compact sticky track header: ${JSON.stringify(layout)}`);
    assert.ok(layout.nameWidth < 90 && layout.trackWidth > layout.nameWidth, `compact symbol column: ${JSON.stringify(layout)}`);
    const channelNames = await page.locator(`${root} .tl-row[data-key^="channel:"] .tl-row-name`).allTextContents();
    assert.ok(channelNames.length > 0 && channelNames.every(value => /^\s*\d{1,2}\s*[-–]\s*\d{1,2}\s*$/.test(value)),
      `channel labels are gate numbers: ${JSON.stringify(channelNames.slice(0, 5))}`);
    assert.ok(await page.locator(`${root} .bg-planet-row`).count() > 0);
    assert.ok((await page.locator(`${root} .tl-bar span`).first().innerText()).trim().length > 0);
    const values = await birthMoon(page);
    assert.deepEqual(Object.keys(values).sort(), ['design', 'personality']);
    assert.ok(values.design && values.personality);
    const presets = await page.locator(`${root} [data-field="span"] option`).evaluateAll(options => options.map(o => o.value));
    assert.deepEqual(presets, ['1', '3', '7', '28', 'year', 'past-year']);
    await checkCompactPlanets(page, '927px');
  });

  await log('calculated rows stay ordered and mounted while bars enter and leave the viewport', async () => {
    const table = page.locator(tableSelector);
    await table.scrollIntoViewIfNeeded();
    await table.focus();
    await page.keyboard.press('=');
    assert.equal(await page.locator(`${root} [data-field="span"]`).inputValue(), '7',
      'viewport zoom leaves the overall range selection at seven days');
    await table.evaluate(node => { node.scrollTop = Math.min(320, node.scrollHeight - node.clientHeight); });
    const snapshot = () => page.evaluate(() => {
      const table = document.querySelector('#timeline-view .tl-table');
      const rows = [...table.querySelectorAll('.tl-row')];
      return { keys: rows.map(node => node.dataset.key),
        bars: Object.fromEntries(rows.map(node => [node.dataset.key, [...node.querySelectorAll('.tl-bar')].map(bar => bar.dataset.interval)])),
        empty: rows.filter(node => !node.querySelector('.tl-bar')).length,
        scrollTop: table.scrollTop };
    });
    const remember = async () => page.evaluate(() => {
      window.__tlFixedRows = new Map([...document.querySelectorAll('#timeline-view .tl-row')]
        .map(node => [node.dataset.key, node]));
    });
    const stable = async (baseline, label) => {
      const actual = await snapshot();
      assert.deepEqual(actual.keys, baseline.keys, `${label}: row keys and order stay fixed`);
      assert.ok(Math.abs(actual.scrollTop - baseline.scrollTop) <= 1,
        `${label}: vertical scroll stays fixed (${actual.scrollTop} vs ${baseline.scrollTop})`);
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('#timeline-view .tl-row')]
        .every(node => window.__tlFixedRows.get(node.dataset.key)?.isSameNode(node))), true,
      `${label}: row DOM nodes stay mounted`);
      return actual;
    };
    const ticks = await page.locator(`${root} .tl-ticks`).boundingBox();
    await page.mouse.move(ticks.x + ticks.width * .5, ticks.y + ticks.height * .5);
    await remember();
    const initial = await snapshot();
    assert.ok(initial.keys.length > 20 && initial.scrollTop > 0, 'test has a scrollable calculated row list');
    await page.mouse.wheel(-100000, 0);
    const left = await stable(initial, 'left calculated edge');
    await page.mouse.wheel(100000, 0);
    const right = await stable(initial, 'right calculated edge');
    assert.notDeepEqual(left.bars, right.bars, 'bars enter and leave the seven-day window');
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    const zoomed = await stable(initial, 'gesture zoom');
    assert.notDeepEqual(zoomed.bars, right.bars, 'zoom changes visible bars without dropping rows');
    assert.ok(Math.max(left.empty, right.empty, zoomed.empty) > 0,
      'a row with no bar in the current viewport remains present');

    await page.locator(`${root} [data-field="changes"]`).click();
    assert.equal(await page.locator(`${root} [data-field="changes"]`).getAttribute('aria-pressed'), 'true');
    await remember();
    const changes = await snapshot();
    assert.ok(changes.keys.length > 0 && changes.keys.length <= initial.keys.length);
    await page.mouse.move(ticks.x + ticks.width * .5, ticks.y + ticks.height * .5);
    await page.mouse.wheel(-100000, 0);
    const changesLeft = await stable(changes, 'changes-only left edge');
    await page.mouse.wheel(100000, 0);
    const changesRight = await stable(changes, 'changes-only right edge');
    assert.notDeepEqual(changesLeft.bars, changesRight.bars,
      'changes-only bars still enter and leave the viewport');
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -80);
    await page.keyboard.up('Control');
    await stable(changes, 'changes-only gesture zoom');

    await page.selectOption(`${root} [data-field="kind"]`, 'gate');
    const gateRows = await snapshot();
    assert.ok(gateRows.keys.length > 0 && gateRows.keys.every(key => key.startsWith('gate:')),
      'category filter still applies');
    const name = await page.locator(`${root} .tl-row .tl-row-name`).first().getAttribute('title');
    await page.locator(`${root} [data-field="search"]`).fill(name);
    assert.equal(await page.locator(`${root} .tl-row`).count(), 1, 'search still narrows fixed rows');
    await page.locator(`${root} [data-field="search"]`).fill('');
    assert.deepEqual((await snapshot()).keys, gateRows.keys, 'clearing search restores category rows in order');
    await page.selectOption(`${root} [data-field="kind"]`, 'all');
    await page.locator(`${root} [data-field="changes"]`).click();
    await page.selectOption(`${root} [data-field="span"]`, '7');
    await ready(page, 7);
    await table.evaluate(node => { node.scrollTop = 0; });
    await page.evaluate(() => { delete window.__tlFixedRows; });
  });

  const originalBirthMoon = await birthMoon(page);
  const originalBirthValues = await birthValues(page);
  await log('real horizontal wheel pans viewport and selected instant', async () => {
    await page.locator(tableSelector).focus();
    await page.keyboard.press('=');
    const before = await state(page);
    const table = page.locator(tableSelector);
    await table.scrollIntoViewIfNeeded();
    const box = await table.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width * .7, Math.min(box.y + 90, 690));
    await page.mouse.wheel(175, 0);
    await page.waitForFunction(previous => Number(document.querySelector('#timeline-view .tl-table')?.dataset.selected) !== previous, before.selected);
    const after = await state(page);
    assert.ok(after.selected > before.selected && after.start > before.start);
    assert.ok(Math.abs((after.selected - before.selected) - (after.start - before.start)) <= 1000);
    assert.ok(after.start >= after.calculatedStart && after.end <= after.calculatedEnd);
    await moonMatches(page);
    assert.deepEqual(await birthMoon(page), originalBirthMoon);
  });

  await log('vertical wheel scrolls rows without moving time', async () => {
    const table = page.locator(tableSelector);
    await table.evaluate(node => { node.scrollTop = 0; });
    const before = await state(page);
    assert.ok(await table.evaluate(node => node.scrollHeight > node.clientHeight + 100));
    const box = await table.boundingBox();
    await page.mouse.move(box.x + box.width * .7, Math.min(box.y + 90, 690));
    await page.mouse.wheel(0, 280);
    await page.waitForFunction(() => document.querySelector('#timeline-view .tl-table')?.scrollTop > 0);
    const after = await state(page);
    assert.equal(after.selected, before.selected);
    assert.equal(after.start, before.start);
  });

  await log('ctrl-wheel pinch keeps the pointer time anchored', async () => {
    const before = await state(page);
    const ticks = await page.locator(`${root} .tl-ticks`).boundingBox();
    assert.ok(ticks && ticks.width > 100);
    const x = ticks.x + ticks.width * .38;
    await page.locator(tableSelector).evaluate(node => node.addEventListener('wheel', event => {
      window.__tlLastWheelX = event.clientX;
    }, { once: true }));
    const table = await page.locator(tableSelector).boundingBox();
    const y = Math.max(table.y + 15, Math.min(table.y + 80, 690));
    await page.mouse.move(x, y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -55);
    await page.keyboard.up('Control');
    const clientX = await page.evaluate(() => window.__tlLastWheelX);
    assert.equal(typeof clientX, 'number', 'wheel reached the timeline');
    const ratio = (clientX - ticks.x) / ticks.width;
    const anchor = before.start + ratio * (before.end - before.start);
    await page.waitForFunction(oldSpan => {
      const d = document.querySelector('#timeline-view .tl-table')?.dataset;
      return d && Number(d.end) - Number(d.start) < oldSpan;
    }, before.end - before.start);
    const after = await state(page);
    const anchoredAfter = after.start + ratio * (after.end - after.start);
    assert.ok(Math.abs(anchoredAfter - anchor) < 2000,
      `pointer anchor moved ${anchoredAfter - anchor}ms; before=${JSON.stringify(before)} after=${JSON.stringify(after)} ratio=${ratio}`);
    await moonMatches(page);
  });

  await log('edge pointer zoom retains its anchor and clamps selected instant', async () => {
    await page.selectOption(`${root} [data-field="span"]`, '7');
    await ready(page, 7);
    const ticks = await page.locator(`${root} .tl-ticks`).boundingBox();
    assert.ok(ticks && ticks.width > 100);
    await page.mouse.click(ticks.x + ticks.width * .94, ticks.y + ticks.height * .5);
    const before = await state(page);
    assert.ok(before.selected > before.start + .8 * (before.end - before.start));
    const zoomTicks = await page.locator(`${root} .tl-ticks`).boundingBox();
    await page.locator(tableSelector).evaluate(node => node.addEventListener('wheel', event => {
      window.__tlEdgeWheelX = event.clientX;
    }, { once: true }));
    const ratio = .08;
    const table = await page.locator(tableSelector).boundingBox();
    await page.mouse.move(zoomTicks.x + zoomTicks.width * ratio, Math.max(table.y + 15, Math.min(table.y + 80, 690)));
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -80);
    await page.keyboard.up('Control');
    const actualRatio = (await page.evaluate(() => window.__tlEdgeWheelX) - zoomTicks.x) / zoomTicks.width;
    const anchor = before.start + actualRatio * (before.end - before.start);
    const after = await state(page);
    assert.ok(after.end - after.start < before.end - before.start);
    assert.ok(Math.abs(after.start + actualRatio * (after.end - after.start) - anchor) < 2000,
      `pointer anchor moved: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    assert.ok(after.selected >= after.start && after.selected < after.end,
      `selected instant escaped the zoomed viewport: ${JSON.stringify(after)}`);
    assert.equal(after.selected, after.end - 1000, 'offscreen selection clamps to right edge');
    await moonMatches(page);
    await checkFixings(page, 'overlay');
  });

  await log('keyboard zoom changes range in both directions', async () => {
    const before = await state(page);
    await page.locator(tableSelector).focus();
    await page.keyboard.press('=');
    const zoomed = await state(page);
    assert.ok(zoomed.end - zoomed.start < before.end - before.start);
    await page.keyboard.press('-');
    const restored = await state(page);
    assert.ok(Math.abs((restored.end - restored.start) - (before.end - before.start)) < 1000);
  });

  await log('wheel keeps moving the cursor after viewport reaches both calculated edges', async () => {
    const table = page.locator(tableSelector);
    await table.scrollIntoViewIfNeeded();
    const box = await table.boundingBox();
    await page.mouse.move(box.x + box.width * .7, Math.min(box.y + 90, 690));
    for (const delta of [-100000, 100000]) {
      await page.mouse.wheel(delta, 0);
      const edge = await state(page);
      assert.ok(edge.start >= edge.calculatedStart && edge.end <= edge.calculatedEnd,
        `viewport escaped calculation: ${JSON.stringify(edge)}`);
      assert.equal(delta < 0 ? edge.start : edge.end,
        delta < 0 ? edge.calculatedStart : edge.calculatedEnd, 'viewport reached calculated edge');
      const ticks = await page.locator(`${root} .tl-ticks`).boundingBox();
      await page.mouse.click(ticks.x + ticks.width * .5, ticks.y + ticks.height * .5);
      const middle = await state(page);
      assert.ok(middle.selected > middle.start && middle.selected < middle.end - 1000,
        `ruler selected inside the stopped viewport: ${JSON.stringify(middle)}`);
      const workers = await page.evaluate(() => window.__tlWorkerCount);
      await page.mouse.move(box.x + box.width * .7, Math.min(box.y + 90, 690));
      await page.mouse.wheel(delta < 0 ? -25 : 25, 0);
      const moved = await state(page);
      assert.deepEqual([moved.start, moved.end], [middle.start, middle.end], 'viewport stays at the edge');
      assert.ok(delta < 0 ? moved.selected < middle.selected : moved.selected > middle.selected,
        `continued wheel moves cursor toward ${delta < 0 ? 'left' : 'right'} edge`);
      await page.mouse.wheel(delta, 0);
      const terminal = await state(page);
      assert.equal(terminal.selected, delta < 0 ? terminal.start : terminal.end - 1000,
        'cursor reaches the end of the calculated viewport');
      await page.evaluate(() => {
        window.__tlTerminalSvg = document.querySelector('#timeline-view .tl-graph .bodygraph-svg');
        window.__tlTerminalSvgRemovals = 0;
        window.__tlTerminalObserver = new MutationObserver(records => records.forEach(record =>
          record.removedNodes.forEach(node => {
            if (node.nodeType === 1 && (node.matches('.bodygraph-svg') || node.querySelector('.bodygraph-svg')))
              window.__tlTerminalSvgRemovals++;
          })));
        window.__tlTerminalObserver.observe(document.querySelector('#timeline-view .tl-graph'), { childList: true });
      });
      await page.mouse.wheel(delta, 0);
      await page.waitForTimeout(100);
      const after = await state(page);
      assert.deepEqual([after.selected, after.start, after.end], [terminal.selected, terminal.start, terminal.end]);
      assert.equal(await page.evaluate(() => {
        window.__tlTerminalObserver.disconnect();
        return window.__tlTerminalSvg.isSameNode(document.querySelector('#timeline-view .tl-graph .bodygraph-svg'))
          && window.__tlTerminalSvgRemovals === 0;
      }), true, 'wheel beyond terminal cursor does not rebuild SVG');
      assert.equal(await table.getAttribute('aria-busy'), 'false');
      assert.equal(await page.evaluate(() => window.__tlWorkerCount), workers);
    }
  });

  await log('reverse wheel restores cursor to 35/65 percent before moving viewport', async () => {
    const table = page.locator(tableSelector);
    await table.scrollIntoViewIfNeeded();
    const ticks = await page.locator(`${root} .tl-ticks`).boundingBox();
    const box = await table.boundingBox();
    await page.mouse.move(ticks.x + ticks.width * .5, Math.min(box.y + 90, 690));
    const workers = await page.evaluate(() => window.__tlWorkerCount);
    for (const direction of [-1, 1]) {
      await page.mouse.wheel(direction * 100000, 0);
      const edge = await state(page);
      assert.equal(direction < 0 ? edge.start : edge.end,
        direction < 0 ? edge.calculatedStart : edge.calculatedEnd);
      assert.equal(edge.selected, direction < 0 ? edge.start : edge.end - 1000);
      await page.mouse.wheel(-direction * ticks.width * .2, 0);
      const cursorOnly = await state(page);
      assert.deepEqual([cursorOnly.start, cursorOnly.end], [edge.start, edge.end],
        'small reverse wheel moves only the cursor');
      const cursorRatio = (cursorOnly.selected - cursorOnly.start) / (cursorOnly.end - cursorOnly.start);
      assert.ok(direction < 0 ? cursorRatio > .15 && cursorRatio < .35 : cursorRatio < .85 && cursorRatio > .65,
        `cursor approaches threshold before viewport recovery: ${cursorRatio}`);
      await page.mouse.wheel(-direction * ticks.width * .25, 0);
      const recovered = await state(page);
      assert.ok(direction < 0 ? recovered.start > cursorOnly.start : recovered.start < cursorOnly.start,
        'larger reverse wheel starts moving the viewport');
      const recoveredRatio = (recovered.selected - recovered.start) / (recovered.end - recovered.start);
      assert.ok(direction < 0 ? recoveredRatio >= .34 && recoveredRatio <= .37 : recoveredRatio <= .66 && recoveredRatio >= .63,
        `cursor stays near the 35/65 percent handoff: ${recoveredRatio}`);
      assert.equal(await table.getAttribute('aria-busy'), 'false');
      assert.equal(await page.evaluate(() => window.__tlWorkerCount), workers);
    }
  });

  await log('pointer edge hold pans, then release, cancel and view switch stop it', async () => {
    const table = page.locator(tableSelector);
    await table.scrollIntoViewIfNeeded();
    await table.evaluate(node => { node.scrollTop = 0; });
    const ticks = await page.locator(`${root} .tl-ticks`).boundingBox();
    const y = ticks.y + ticks.height * .5;
    const workers = await page.evaluate(() => window.__tlWorkerCount);
    const startEdgeDrag = async (side = 'right') => {
      await page.mouse.move(ticks.x + ticks.width * .5, y);
      await page.mouse.down();
      await page.mouse.move(side === 'right' ? ticks.x + ticks.width - 2 : ticks.x + 2, y, { steps: 5 });
    };
    const retreat = async () => {
      await page.mouse.move(ticks.x + ticks.width * .7, y);
      await page.mouse.wheel(-ticks.width * .55, 0);
      const away = await state(page);
      assert.ok(away.end < away.calculatedEnd, `room to auto-pan: ${JSON.stringify(away)}`);
      return away;
    };
    const releasedFrom = await retreat();
    await startEdgeDrag();
    await page.waitForFunction(previous => Number(document.querySelector('#timeline-view .tl-table')?.dataset.start) > previous,
      releasedFrom.start, { timeout: 5000 });
    const moving = await state(page);
    assert.ok(moving.start > releasedFrom.start && moving.end <= moving.calculatedEnd);
    await page.mouse.up();
    const released = await state(page);
    await page.waitForTimeout(200);
    const afterRelease = await state(page);
    assert.deepEqual([afterRelease.start, afterRelease.selected], [released.start, released.selected],
      'pointer release stops auto-pan');

    await page.mouse.move(ticks.x + ticks.width * .3, y);
    await page.mouse.wheel(-100000, 0);
    await page.mouse.wheel(ticks.width * .55, 0);
    const leftFrom = await state(page);
    assert.ok(leftFrom.start > leftFrom.calculatedStart, `room to auto-pan left: ${JSON.stringify(leftFrom)}`);
    await startEdgeDrag('left');
    await page.waitForFunction(previous => Number(document.querySelector('#timeline-view .tl-table')?.dataset.start) < previous,
      leftFrom.start, { timeout: 5000 });
    const leftMoving = await state(page);
    assert.ok(leftMoving.start < leftFrom.start && leftMoving.start >= leftMoving.calculatedStart);
    await page.mouse.up();
    const leftReleased = await state(page);
    await page.waitForTimeout(200);
    const afterLeftRelease = await state(page);
    assert.deepEqual([afterLeftRelease.start, afterLeftRelease.selected], [leftReleased.start, leftReleased.selected],
      'left pointer release stops auto-pan');

    await page.mouse.move(ticks.x + ticks.width * .7, y);
    await page.mouse.wheel(100000, 0);
    const boundary = await state(page);
    assert.equal(boundary.end, boundary.calculatedEnd);
    await startEdgeDrag();
    await page.waitForTimeout(250);
    const stoppedAtBoundary = await state(page);
    assert.deepEqual([stoppedAtBoundary.start, stoppedAtBoundary.end], [boundary.start, boundary.end],
      'pointer hold cannot pan beyond calculated boundary');
    assert.ok(stoppedAtBoundary.selected >= stoppedAtBoundary.end - (stoppedAtBoundary.end - stoppedAtBoundary.start) * .02
      && stoppedAtBoundary.selected < stoppedAtBoundary.end,
    'held pointer keeps cursor near the right edge without escaping it');
    await page.mouse.up();

    const cancelFrom = await retreat();
    await startEdgeDrag();
    await page.waitForFunction(previous => Number(document.querySelector('#timeline-view .tl-table')?.dataset.start) > previous,
      cancelFrom.start, { timeout: 5000 });
    await table.dispatchEvent('pointercancel');
    const cancelled = await state(page);
    await page.waitForTimeout(200);
    const afterCancel = await state(page);
    assert.deepEqual([afterCancel.start, afterCancel.selected], [cancelled.start, cancelled.selected],
      'pointercancel stops auto-pan');
    await page.mouse.up();

    const switchFrom = await retreat();
    await startEdgeDrag();
    await page.waitForFunction(previous => Number(document.querySelector('#timeline-view .tl-table')?.dataset.start) > previous,
      switchFrom.start, { timeout: 5000 });
    await page.evaluate(() => document.querySelector('.nav-link[data-view="chart"]').click());
    const switched = await state(page);
    await page.waitForTimeout(200);
    const afterSwitch = await state(page);
    assert.deepEqual([afterSwitch.start, afterSwitch.selected], [switched.start, switched.selected],
      'leaving timeline stops auto-pan');
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.__tlWorkerCount), workers, 'edge gestures did not request another worker');
    await page.locator('.nav-link[data-view="timeline"]').click();
    await ready(page);
    assert.equal(await table.getAttribute('aria-busy'), 'false');
  });

  await log('one-hour shallow edge hold accumulates sub-second pan steps', async () => {
    await page.selectOption(`${root} [data-field="span"]`, '1');
    await ready(page, 1);
    const table = page.locator(tableSelector);
    await table.focus();
    for (let index = 0; index < 5; index++) await page.keyboard.press('=');
    assert.ok((await state(page)).end - (await state(page)).start <= 3600000,
      'one-hour viewport is available inside the 24-hour calculation');
    assert.equal(await page.locator(`${root} [data-field="span"]`).inputValue(), '1');
    await table.scrollIntoViewIfNeeded();
    await table.evaluate(node => { node.scrollTop = 0; });
    const ticks = await page.locator(`${root} .tl-ticks`).boundingBox();
    const edgeWidth = Math.min(32, ticks.width * .08);
    const x = ticks.x + ticks.width - edgeWidth + .4;
    const y = ticks.y + ticks.height * .5;
    const before = await state(page);
    const workers = await page.evaluate(() => window.__tlWorkerCount);
    await page.evaluate(() => {
      const root = document.querySelector('#timeline-view');
      const row = [...root.querySelectorAll('.tl-row[data-key^="center:"]')]
        .find(node => node.querySelector('.tl-bar[data-source="natal"]'));
      const bar = row?.querySelector('.tl-bar[data-source="natal"]');
      const svg = root.querySelector('.tl-graph .bodygraph-svg');
      if (!row || !bar || !svg) throw new Error('a stable natal center bar and chart must exist');
      const mutations = { removedRows: 0, removedBars: 0, removedSvgs: 0 };
      const countRemoved = node => {
        if (node.nodeType !== 1) return;
        if (node.matches('.tl-row')) mutations.removedRows++;
        if (node.matches('.tl-bar')) mutations.removedBars++;
        mutations.removedRows += node.querySelectorAll('.tl-row').length;
        mutations.removedBars += node.querySelectorAll('.tl-bar').length;
      };
      const rowsObserver = new MutationObserver(records => records.forEach(record =>
        record.removedNodes.forEach(countRemoved)));
      rowsObserver.observe(root.querySelector('.tl-rows'), { childList: true, subtree: true });
      const graphObserver = new MutationObserver(records => records.forEach(record =>
        record.removedNodes.forEach(node => {
          if (node.nodeType === 1 && (node.matches('.bodygraph-svg') || node.querySelector('.bodygraph-svg'))) mutations.removedSvgs++;
        })));
      graphObserver.observe(root.querySelector('.tl-graph'), { childList: true, subtree: true });
      window.__tlStable = { key: row.dataset.key, row, bar, svg, mutations, rowsObserver, graphObserver };
    });
    await page.mouse.move(ticks.x + ticks.width * .5, y);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 5 });
    await page.waitForFunction(previous => Number(document.querySelector('#timeline-view .tl-table')?.dataset.start) > previous,
      before.start, { timeout: 5000 });
    await page.waitForTimeout(650);
    const moving = await state(page);
    assert.ok(moving.start > before.start && moving.end <= moving.calculatedEnd);
    const stableDuringDrag = await page.evaluate(() => {
      const root = document.querySelector('#timeline-view');
      const { key, row, bar, svg, mutations } = window.__tlStable;
      return { row: row.isSameNode(root.querySelector(`.tl-row[data-key="${key}"]`)),
        bar: bar.isSameNode(root.querySelector(`.tl-row[data-key="${key}"] .tl-bar[data-source="natal"]`)),
        svg: svg.isSameNode(root.querySelector('.tl-graph .bodygraph-svg')),
        ...mutations };
    });
    assert.ok(stableDuringDrag.row && stableDuringDrag.bar,
      `drag preserved row and natal bar nodes: ${JSON.stringify(stableDuringDrag)}`);
    assert.equal(await page.locator(`${root} .tl-graph .bodygraph-svg`).count(), 1,
      'the chart remains mounted while scrubbing');
    assert.ok(stableDuringDrag.removedRows < 5 && stableDuringDrag.removedBars < 20
      && stableDuringDrag.removedSvgs < 5,
    `drag avoided whole-table replacement and excessive chart redraws: ${JSON.stringify(stableDuringDrag)}`);
    await page.mouse.up();
    const stopped = await state(page);
    await page.waitForTimeout(150);
    assert.equal((await state(page)).start, stopped.start);
    assert.equal(await page.evaluate(() => window.__tlWorkerCount), workers);
    await moonMatches(page);
    await checkFixings(page, 'overlay');

    const stableKey = await page.evaluate(() => window.__tlStable.key);
    const natal = page.locator(`${root} .tl-row[data-key="${stableKey}"] .tl-bar[data-source="natal"]`);
    await natal.scrollIntoViewIfNeeded();
    await natal.hover();
    assert.equal(await natal.evaluate(node => node.matches(':hover')), true);
    const beforeHoverWheel = await state(page);
    await page.mouse.wheel(5, 0);
    await page.waitForFunction(previous => Number(document.querySelector('#timeline-view .tl-table')?.dataset.start) !== previous,
      beforeHoverWheel.start, { timeout: 5000 });
    const hoverStable = await page.evaluate(() => {
      const root = document.querySelector('#timeline-view');
      const { key, row, bar, svg } = window.__tlStable;
      return { row: row.isSameNode(root.querySelector(`.tl-row[data-key="${key}"]`)),
        bar: bar.isSameNode(root.querySelector(`.tl-row[data-key="${key}"] .tl-bar[data-source="natal"]`)),
        svg: svg.isSameNode(root.querySelector('.tl-graph .bodygraph-svg')),
        hover: bar.matches(':hover'), rowLit: row.classList.contains('tl-row-lit') };
    });
    assert.ok(Object.values(hoverStable).every(Boolean),
      `hovered natal center bar survives wheel pan: ${JSON.stringify(hoverStable)}`);
    await page.evaluate(() => {
      window.__tlStable.rowsObserver.disconnect();
      window.__tlStable.graphObserver.disconnect();
      delete window.__tlStable;
    });
  });

  await log('gesture and keyboard zoom cannot exceed the calculated range', async () => {
    const table = page.locator(tableSelector);
    const box = await table.boundingBox();
    await page.mouse.move(box.x + box.width * .5, Math.min(box.y + 90, 690));
    const workers = await page.evaluate(() => window.__tlWorkerCount);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 100000);
    await page.keyboard.up('Control');
    await table.focus();
    await page.keyboard.press('-');
    const after = await state(page);
    assert.ok(after.start >= after.calculatedStart && after.end <= after.calculatedEnd,
      `zoom escaped calculation: ${JSON.stringify(after)}`);
    assert.equal(await table.getAttribute('aria-busy'), 'false');
    assert.equal(await page.evaluate(() => window.__tlWorkerCount), workers);
  });

  await log('explicit date change calculates a distant range', async () => {
    const before = await state(page);
    const preset = await page.locator(`${root} [data-field="span"]`).inputValue();
    await page.locator(`${root} [data-field="date"]`).fill('2032-06-15');
    await page.locator(`${root} [data-field="date"]`).dispatchEvent('change');
    await page.waitForFunction(previous => Number(document.querySelector('#timeline-view .tl-table')?.dataset.calculatedStart) !== previous,
      before.calculatedStart, { timeout: 120000 });
    await ready(page);
    const after = await state(page);
    assert.ok(after.selected >= after.calculatedStart && after.selected < after.calculatedEnd);
    assert.ok(after.calculatedStart > before.calculatedEnd);
    assert.equal(await page.locator(`${root} [data-field="span"]`).inputValue(), preset,
      'date jump keeps the selected overall range');
  });

  await log('DST dates use real local-midnight ruler cells and aligned gridlines', async () => {
    await page.selectOption(`${root} [data-field="zone"]`, 'America/New_York');
    await page.selectOption(`${root} [data-field="span"]`, '3');
    for (const [date, hours] of [['2026-03-08', 23], ['2026-11-01', 25]]) {
      await page.locator(`${root} [data-field="date"]`).fill(date);
      await page.locator(`${root} [data-field="time"]`).fill('12:00:00');
      await ready(page, 3);
      await checkMidnightRuler(page, date, hours);
    }
  });

  await log('pointer drag on track selects a time and refreshes transit Moon', async () => {
    await page.selectOption(`${root} [data-field="span"]`, '7');
    await ready(page, 7);
    await page.locator(tableSelector).scrollIntoViewIfNeeded();
    const box = await page.evaluate(() => {
      const table = document.querySelector('#timeline-view .tl-table');
      table.scrollTop = 0;
      const track = table.querySelector('.tl-row .tl-track');
      const rect = track.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    assert.ok(box && box.width > 100);
    const before = await state(page);
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * .2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .8, y, { steps: 8 });
    await page.mouse.up();
    assert.notEqual((await state(page)).selected, before.selected);
    await moonMatches(page);
    assert.deepEqual(await birthMoon(page), originalBirthMoon);
    assert.deepEqual(await birthValues(page), originalBirthValues, 'birth values stay fixed while scrubbing');
    await checkFixings(page, 'overlay');
  });

  await log('transit-only fixing marks use transit providers', async () => {
    await page.selectOption(`${root} [data-field="mode"]`, 'transit-only');
    await ready(page);
    await checkFixings(page, 'transit-only');
    assert.deepEqual(await birthValues(page), originalBirthValues, 'hidden birth values remain fixed');
    await page.selectOption(`${root} [data-field="mode"]`, 'overlay');
    await ready(page);
    await checkFixings(page, 'overlay');
  });

  await log('bar and symbol open one detail sheet with interval timing', async () => {
    await ready(page);
    await page.locator(`${root} .tl-bar:not([data-source="natal"])`).first().click();
    assert.equal(await page.locator('#gate-detail.gate-detail[role="dialog"][aria-modal="true"]:not(.hidden) .tl-detail-timing').isVisible(), true);
    assert.equal(await page.locator(`${root} .tl-interval-detail`).count(), 0);
    assert.equal(await page.locator('#gate-detail .tl-timing-values dd').count(), 3);
    await page.locator('#gate-detail .gate-detail-close').click();
    await page.locator(`${root} .tl-row[data-key^="gate:"][data-active-source]:not([data-active-source="natal"]) .tl-row-name`).first().click();
    await page.waitForSelector('#gate-detail:not(.hidden)');
    const activeRow = await page.locator('#gate-detail .tl-detail-timing').getAttribute('data-kind');
    assert.equal(activeRow, 'gate');
    await page.keyboard.press('Escape');
  });

  await log('rapid range switches and view reentry settle on latest range', async () => {
    await page.selectOption(`${root} [data-field="span"]`, '1');
    await page.selectOption(`${root} [data-field="span"]`, '28');
    await page.locator('.nav-link[data-view="chart"]').click();
    await page.locator('.nav-link[data-view="timeline"]').click();
    await page.selectOption(`${root} [data-field="span"]`, '3');
    await ready(page, 3);
    await page.waitForTimeout(500);
    const final = await state(page);
    assert.deepEqual([final.calculatedStart, final.calculatedEnd], Object.values(await expectedLocalRange(page, 3)));
    assert.equal(await page.locator(`${root} [data-field="span"]`).inputValue(), '3');
    assert.equal(await page.locator(tableSelector).getAttribute('aria-busy'), 'false');
    await moonMatches(page);
  });

  await log('28-day reentry calculates uncached first and last moments', async () => {
    await page.selectOption(`${root} [data-field="span"]`, '28');
    await page.locator('.nav-link[data-view="chart"]').click();
    await page.locator('.nav-link[data-view="timeline"]').click();
    await ready(page, 28);
    const edges = await page.locator(`${root} .tl-bar`).evaluateAll(bars => {
      const intervals = bars.map(bar => ({
        left: parseFloat(bar.style.left),
        right: parseFloat(bar.style.left) + parseFloat(bar.style.width),
      }));
      return {
        first: Math.min(...intervals.map(interval => interval.left)),
        last: Math.max(...intervals.map(interval => interval.right)),
      };
    });
    assert.ok(edges.first < 1 && edges.last > 99, `28-day bars reach both viewport edges: ${JSON.stringify(edges)}`);
    await page.waitForTimeout(350);
    assert.equal(await page.locator(tableSelector).getAttribute('aria-busy'), 'false');
    await page.selectOption(`${root} [data-field="span"]`, '7');
    await ready(page, 7);
  });

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  try {
    const mobile = await mobileContext.newPage();
    mobile.on('pageerror', error => errors.push(`mobile: ${error.message}`));
    await mobile.goto(entry);
    await ready(mobile, 7);
    await log('390px mobile layout has a full-screen chart and tracks without overflow', async () => {
      await checkWidth(mobile, '390px');
      const layout = await mobile.locator(`${tableSelector} .tl-panel-header`).evaluate(header => {
        const rect = header.getBoundingClientRect();
        const stage = document.querySelector('#timeline-view .tl-stage').getBoundingClientRect();
        const tracks = document.querySelector('#timeline-view .tl-tracks-panel').getBoundingClientRect();
        return { height: rect.height, stageBottom: stage.bottom, tracksTop: tracks.top,
          tracksBottom: tracks.bottom, controlsInPanel: !!document.querySelector('#timeline-view [data-field="span"]')
            ?.closest('.tl-mobile-controls-panel') };
      });
      assert.ok(layout.height <= 32 && Math.abs(layout.stageBottom - layout.tracksTop) < 3 &&
        layout.tracksBottom <= 845 && layout.controlsInPanel,
        `390px split timeline: ${JSON.stringify(layout)}`);
    });
  } finally { await mobileContext.close(); }

  const narrowContext = await browser.newContext({ viewport: { width: 422, height: 713 } });
  try {
    const narrow = await narrowContext.newPage();
    narrow.on('pageerror', error => errors.push(`422px: ${error.message}`));
    await narrow.goto(entry);
    await ready(narrow, 7);
    await log('422px planet arrows and compact range remain aligned', async () => {
      await checkWidth(narrow, '422px');
      await checkCompactPlanets(narrow, '422px', true);
    });
  } finally { await narrowContext.close(); }

  const loadingContext = await browser.newContext({ viewport: { width: 927, height: 713 } });
  try {
    await loadingContext.addInitScript(() => {
      window.__tlWorkerCount = 0;
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) { super(...args); window.__tlWorkerCount++; }
        postMessage() { /* Keep the initial calculation pending while testing gestures. */ }
      };
    });
    const loading = await loadingContext.newPage();
    loading.on('pageerror', error => errors.push(`loading: ${error.message}`));
    await loading.goto(entry);
    await loading.waitForSelector(tableSelector);
    await loading.waitForFunction(() => window.__tlWorkerCount === 1);
    await log('gestures do nothing while calculation has no result', async () => {
      const before = await state(loading);
      assert.equal(await loading.locator(tableSelector).getAttribute('aria-busy'), 'true');
      const box = await loading.locator(tableSelector).boundingBox();
      await loading.mouse.move(box.x + box.width * .5, box.y + 40);
      await loading.mouse.wheel(1000, 0);
      await loading.keyboard.down('Control');
      await loading.mouse.wheel(0, -1000);
      await loading.keyboard.up('Control');
      await loading.locator(tableSelector).focus();
      await loading.keyboard.press('=');
      const after = await state(loading);
      assert.deepEqual([after.selected, after.start, after.end], [before.selected, before.start, before.end]);
      assert.equal(await loading.locator(tableSelector).getAttribute('aria-busy'), 'true');
      assert.equal(await loading.evaluate(() => window.__tlWorkerCount), 1);
    });
    await log('planet detail opens safely during initial calculation', async () => {
      const planet = loading.locator(`${root} .tl-planet[data-gate]`).first();
      assert.ok(await planet.count() > 0);
      await planet.click();
      assert.equal(await loading.locator('#gate-detail:not(.hidden)').isVisible(), true);
      assert.equal(await loading.locator('#gate-detail .tl-detail-timing').count(), 0);
      await loading.keyboard.press('Escape');
    });
    await log('progress stays centered inside the timeline panel and hides on page switch', async () => {
      const overlay = loading.locator(`${root} .tl-calculation`);
      assert.equal(await overlay.isVisible(), true);
      assert.equal(await overlay.getAttribute('data-state'), 'loading');
      const presentation = () => overlay.evaluate(node => {
        const panel = node.closest('.tl-tracks-panel');
        const header = panel?.querySelector('.tl-panel-header');
        const card = node.querySelector('.tl-calculation-card');
        const percent = node.querySelector('.tl-loading-percent');
        const bar = node.querySelector('progress');
        const rect = card.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const overlayRect = node.getBoundingClientRect();
        const cardStyle = getComputedStyle(card);
        return { inPanel: node.parentElement === panel, position: getComputedStyle(node).position,
          pointerEvents: getComputedStyle(node).pointerEvents,
          x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
          panelCenterX: panelRect.left + panelRect.width / 2,
          contentCenterY: (headerRect.bottom + panelRect.bottom) / 2,
          overlayTop: overlayRect.top, headerBottom: headerRect.bottom,
          overlayBottom: overlayRect.bottom, panelBottom: panelRect.bottom,
          cardBackground: cardStyle.backgroundColor, cardShadow: cardStyle.boxShadow,
          cardBorder: cardStyle.borderTopWidth,
          fontSize: parseFloat(getComputedStyle(percent).fontSize),
          percent: percent.textContent.trim(), progressMax: Number(bar.max), progressValue: Number(bar.value),
          title: node.querySelector('.tl-load-status').textContent.trim() };
      });
      const checkPanelProgress = async label => {
        const current = await presentation();
        assert.ok(current.inPanel && current.position === 'absolute' && current.pointerEvents === 'none'
          && current.overlayTop >= current.headerBottom - 2
          && current.overlayBottom <= current.panelBottom + 2
          && Math.abs(current.x - current.panelCenterX) < 15
          && Math.abs(current.y - current.contentCenterY) < 30
          && ['transparent', 'rgba(0, 0, 0, 0)'].includes(current.cardBackground)
          && current.cardShadow === 'none' && current.cardBorder === '0px'
          && current.fontSize >= 40 && current.percent === '0%'
          && current.progressMax === 100 && current.progressValue === 0
          && current.title.length > 0,
        `${label} unobtrusive panel-centered loading state: ${JSON.stringify(current)}`);
      };
      await checkPanelProgress('desktop');
      await loading.setViewportSize({ width: 390, height: 844 });
      await checkPanelProgress('mobile');
      await loading.setViewportSize({ width: 927, height: 713 });
      await loading.selectOption(`${root} [data-field="span"]`, '3');
      await loading.waitForFunction(() => window.__tlWorkerCount === 2);
      assert.equal(await loading.locator(`${root} [data-field="span"]`).inputValue(), '3');
      assert.equal(await overlay.isVisible(), true, 'changing range starts a replacement calculation');
      await loading.locator('.nav-link[data-view="chart"]').click();
      assert.equal(await overlay.isVisible(), false, 'leaving the timeline hides progress immediately');
    });
  } finally { await loadingContext.close(); }

  assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
  console.log('Timeline gesture browser checks passed.');
} finally {
  await browser.close();
}
