/** Phone-only workspace regression; run against a local Vite server. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.E2E_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH, headless: true }
  : { channel: process.env.CHROME_CHANNEL || 'chrome', headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
    hasTouch: true, locale: 'zh-CN' });
  const page = await context.newPage();
  await page.goto(`${base}/?d=1990-06-15&t=14:30&tz=8&n=Mobile%20Demo&view=timeline`);
  const root = page.locator('#timeline-view');
  const table = root.locator('.tl-table');
  await page.waitForFunction(() => {
    const node = document.querySelector('#timeline-view .tl-table');
    return node?.getAttribute('aria-busy') === 'false' && !!node.querySelector('.tl-bar');
  }, null, { timeout: 120000 });

  const dateCell = root.locator('.tl-ticks .tl-date-cell').nth(3);
  const dateRect = await dateCell.boundingBox();
  const dateY = dateRect.y + dateRect.height / 2;
  const beforeMouseDrag = Number(await table.getAttribute('data-selected'));
  await page.mouse.move(dateRect.x + dateRect.width * .3, dateY);
  await page.mouse.down();
  await page.mouse.move(dateRect.x + dateRect.width * .8, dateY, { steps: 6 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => getSelection()?.toString() || ''), '',
    'dragging across date labels does not select timeline text');
  assert.notEqual(Number(await table.getAttribute('data-selected')), beforeMouseDrag,
    'mouse dragging the date ruler still selects a time');

  for (const [width, height] of [[390, 844], [375, 667], [320, 568]]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const box = selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height };
      };
      return { header: getComputedStyle(document.querySelector('.header')).display,
        root: box('#timeline-view'), workspace: box('#timeline-view .tl-workspace'),
        toolbar: box('#timeline-view .tl-toolbar'),
        stage: box('#timeline-view .tl-stage'), tracks: box('#timeline-view .tl-tracks-panel'),
        scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth };
    });
    assert.equal(layout.header, 'none', 'phone timeline hides the desktop header');
    assert.ok(Math.abs(layout.stage.height / height - .6) < .02 &&
      Math.abs(layout.tracks.height / height - .4) < .02,
      `chart and timeline use a 60/40 phone split: ${JSON.stringify(layout)}`);
    assert.ok(Math.abs(layout.tracks.top - layout.stage.bottom) < 3 && layout.tracks.bottom <= height + 2,
      `both panes remain visible together: ${JSON.stringify(layout)}`);
    assert.ok(layout.scrollWidth <= layout.viewport, `no page overflow at ${width}px`);
    const lanes = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const transit = rect('.tl-transit-column');
      const planetRows = rect('.tl-transit-column .tl-planets');
      const birth = rect('.tl-birth-column');
      const controls = rect('.tl-mobile-controls-trigger');
      return { transitLeft: transit.left, planetRowsBottom: planetRows.bottom, birthLeft: birth.left,
        controlLeft: controls.left, controlTop: controls.top, controlRight: controls.right, controlBottom: controls.bottom,
        stageBottom: rect('.tl-stage').bottom };
    });
    assert.ok(Math.abs(lanes.transitLeft - lanes.controlLeft) < 2 &&
      lanes.controlTop >= lanes.planetRowsBottom && lanes.controlRight < lanes.birthLeft &&
      lanes.stageBottom - lanes.controlBottom <= 12,
      `floating control stays at the chart bottom, left-aligned with transit at ${width}px: ${JSON.stringify(lanes)}`);
    assert.ok(lanes.controlBottom <= lanes.stageBottom,
      `floating control stays inside chart pane at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.MOBILE_SCREENSHOT) await page.screenshot({ path: process.env.MOBILE_SCREENSHOT });

  const trigger = root.locator('[data-action="mobile-controls"]');
  await trigger.click();
  const panel = root.locator('.tl-mobile-controls-panel');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  if (process.env.MOBILE_PANEL_SCREENSHOT) await page.screenshot({ path: process.env.MOBILE_PANEL_SCREENSHOT });
  for (const field of ['date', 'time', 'zone', 'mode', 'kind', 'search', 'span', 'changes'])
    assert.ok(await panel.locator(`[data-field="${field}"]`).count(), `${field} stays available in the floating controls`);
  await panel.locator('[data-field="span"]').selectOption('1');
  await page.waitForFunction(() => {
    const node = document.querySelector('#timeline-view .tl-table');
    return node?.getAttribute('aria-busy') === 'false' &&
      Number(node.dataset.calculatedEnd) - Number(node.dataset.calculatedStart) === 86400000;
  }, null, { timeout: 120000 });
  await trigger.click();
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  if (process.env.MOBILE_HOURLY_SCREENSHOT) await page.screenshot({ path: process.env.MOBILE_HOURLY_SCREENSHOT });
  const hourCells = await root.locator('.tl-ticks .tl-date-cell[data-granularity="hour"]').evaluateAll(nodes =>
    nodes.map(node => ({ label: node.textContent.trim(), width: node.getBoundingClientRect().width })));
  assert.deepEqual(hourCells.map(cell => cell.label),
    Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0')),
    'every hour from 00 to 23 has its own visible cell');
  assert.ok(hourCells.every(cell => cell.width > 0), 'all hourly cells occupy timeline width');

  await table.focus();
  await page.keyboard.press('Equal');
  await page.waitForFunction(() => {
    const node = document.querySelector('#timeline-view .tl-table');
    return Number(node.dataset.end) - Number(node.dataset.start) < 86400000;
  });

  const bar = root.locator('.tl-bar').first();
  await bar.scrollIntoViewIfNeeded();
  const rect = await bar.boundingBox();
  assert.ok(rect, 'a bar is available for touch');
  const client = await context.newCDPSession(page);
  const gate = root.locator('.tl-graph .bg-gate[data-gate]').first();
  const gateRect = await gate.boundingBox();
  assert.ok(gateRect, 'an interactive bodygraph gate is available');
  const gx = gateRect.x + gateRect.width / 2, gy = gateRect.y + gateRect.height / 2;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gx, y: gy, id: 2 }] });
  assert.equal(await root.locator('.tl-graph .bg-tooltip').evaluate(node => getComputedStyle(node).display), 'block',
    'touching a bodygraph gate reveals its tooltip');
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gx + 12, y: gy, id: 2 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await root.locator('.tl-graph .bg-tooltip').evaluate(node => getComputedStyle(node).display), 'none',
    'releasing the bodygraph hides the touch tooltip');
  const x = rect.x + Math.min(rect.width / 2, 12), y = rect.y + rect.height / 2;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 24, y, id: 1 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);
  assert.equal(await root.locator('.bodygraph-svg.bg-dimmed').count(), 0,
    'touching or swiping a bar does not dim the bodygraph as a hover preview');

  const track = root.locator('.tl-row .tl-track').first();
  const trackRect = await track.boundingBox();
  const tx = trackRect.x + trackRect.width * .55, ty = trackRect.y + trackRect.height / 2;
  const beforeHorizontal = await table.evaluate(node => ({ selected: Number(node.dataset.selected), scrollTop: node.scrollTop }));
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty, id: 3 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx - 24, y: ty + 3, id: 3 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx - 75, y: ty + 48, id: 3 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const afterHorizontal = await table.evaluate(node => ({ selected: Number(node.dataset.selected), scrollTop: node.scrollTop }));
  assert.notEqual(afterHorizontal.selected, beforeHorizontal.selected,
    'diagonal touch keeps panning time after a horizontal start');
  assert.ok(Math.abs(afterHorizontal.scrollTop - beforeHorizontal.scrollTop) < 2,
    'the same horizontal gesture does not turn into vertical scrolling');

  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty, id: 4 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx + 2, y: ty - 28, id: 4 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx + 42, y: ty - 75, id: 4 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const afterVertical = await table.evaluate(node => ({ selected: Number(node.dataset.selected), scrollTop: node.scrollTop }));
  assert.ok(afterVertical.scrollTop > afterHorizontal.scrollTop,
    'a gesture starting vertically still scrolls timeline rows');
  assert.equal(afterVertical.selected, afterHorizontal.selected,
    'the vertical gesture does not switch to time panning');

  await root.locator('[data-action="mobile-exit"]').click();
  assert.equal(await page.locator('.header').evaluate(node => getComputedStyle(node).display), 'block');
  assert.equal(await page.locator('#chart-view').isVisible(), true);
  await context.close();
  console.log('Mobile timeline split layout, controls, hour ruler and touch highlight passed.');
} finally {
  await browser.close();
}
