/** Real Chromium touch input against the mobile timeline. Run with E2E_URL set to a dev server. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.E2E_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch(process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH, headless: true }
  : { channel: process.env.CHROME_CHANNEL || 'chrome', headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'en-US',
  });
  const page = await context.newPage();
  await page.goto(`${base}/?d=1990-06-15&t=14:30&tz=8&n=Touch%20Test&view=timeline`);
  const table = page.locator('#timeline-view .tl-table');
  await page.waitForFunction(() => {
    const node = document.querySelector('#timeline-view .tl-table');
    return node?.getAttribute('aria-busy') === 'false' && node.querySelector('.tl-bar');
  }, null, { timeout: 120000 });
  const track = page.locator('#timeline-view .tl-ticks');
  await track.scrollIntoViewIfNeeded();
  const rect = await track.boundingBox();
  assert.ok(rect && rect.width > 150, 'mobile ruler is visible');
  const before = await table.evaluate(node => ({
    start: Number(node.dataset.start),
    selected: Number(node.dataset.selected),
  }));
  const client = await context.newCDPSession(page);
  const y = rect.y + rect.height / 2;
  const from = rect.x + rect.width * .75;
  const to = rect.x + rect.width * .25;
  const swipe = async (start = from, end = to) => {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: start, y, id: 1 }],
    });
    for (let step = 1; step <= 12; step++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: start + (end - start) * step / 12, y, id: 1 }],
      });
      await page.waitForTimeout(16);
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await swipe();
  await page.waitForTimeout(100);
  const after = await table.evaluate(node => ({
    start: Number(node.dataset.start),
    selected: Number(node.dataset.selected),
  }));
  assert.ok(after.selected - before.selected > 86400000,
    `swiping left should continuously advance the selected instant: ${JSON.stringify({ before, after })}`);
  assert.equal(after.start, before.start, 'the fully calculated range cannot pan beyond its bounds');

  // Zooming creates room to pan; a one-finger swipe should then move the window.
  await page.touchscreen.tap(rect.x + rect.width / 2, y);
  await table.dispatchEvent('wheel', { bubbles: true, cancelable: true,
    ctrlKey: true, deltaY: -100, clientX: rect.x + rect.width / 2, clientY: y });
  const zoomed = await table.evaluate(node => ({
    start: Number(node.dataset.start), end: Number(node.dataset.end),
    calculatedStart: Number(node.dataset.calculatedStart), calculatedEnd: Number(node.dataset.calculatedEnd),
  }));
  assert.ok(zoomed.end - zoomed.start < zoomed.calculatedEnd - zoomed.calculatedStart,
    'zoom leaves calculated time available on both sides');
  await swipe();
  await page.waitForTimeout(100);
  const panned = await table.evaluate(node => ({ start: Number(node.dataset.start), selected: Number(node.dataset.selected) }));
  assert.ok(panned.start > zoomed.start,
    `swiping left should pan toward later time after zoom: ${JSON.stringify({ zoomed, panned })}`);
  await swipe(to, from);
  await page.waitForTimeout(100);
  const reversed = await table.evaluate(node => ({ start: Number(node.dataset.start), selected: Number(node.dataset.selected) }));
  assert.ok(reversed.start < panned.start && reversed.selected < panned.selected,
    `swiping right should return toward earlier time: ${JSON.stringify({ panned, reversed })}`);
  await table.evaluate(node => { node.scrollTop = 0; });
  const row = page.locator('#timeline-view .tl-row .tl-track').first();
  await row.scrollIntoViewIfNeeded();
  await table.evaluate(node => { node.scrollTop = 0; });
  const rowRect = await row.boundingBox();
  assert.ok(rowRect, 'a timeline row is available for vertical scrolling');
  const x = rowRect.x + rowRect.width / 2;
  const rowY = rowRect.y + rowRect.height / 2;
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x, y: rowY, id: 2 }],
  });
  for (let step = 1; step <= 10; step++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x, y: rowY - step * 12, id: 2 }],
    });
    await page.waitForTimeout(16);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok(await table.evaluate(node => node.scrollTop) > 0,
    'vertical finger scrolling still scrolls the track list');
  console.log('Mobile touch swipe scrubs and pans; vertical scrolling remains native.');
  await context.close();
} finally {
  await browser.close();
}
