/**
 * Browser smoke test for the transit timeline. Needs a running dev server:
 *
 *   npm run dev -- --port 5173      # in one terminal
 *   npm run e2e:timeline            # in another (E2E_URL, CHROME_PATH to override)
 *
 * Real calculation in the real worker; no geocoding (the chart comes from URL params).
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_URL || 'http://127.0.0.1:5173';
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';
const ENTRY = `${BASE}/?d=1990-06-15&t=14:30&tz=8&n=Timeline%20Demo&view=timeline`;
const tl = '#timeline-view';
const field = name => `${tl} [data-field="${name}"]`;

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`✔ ${name}`); }
  catch (err) { failures++; console.error(`✖ ${name}\n  ${err.message || err}`); }
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const errors = [];
async function open(viewport) {
  const page = await browser.newPage({ viewport, locale: 'en-GB', timezoneId: 'America/Denver' });
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(ENTRY);
  await page.waitForSelector(`${tl}:not(.hidden) .tl-graph .bodygraph-svg`);
  return page;
}
const ready = (page, timeout = 60000) => page.waitForFunction(
  () => document.querySelector('#timeline-view .tl-table')?.getAttribute('aria-busy') === 'false', null, { timeout });
const range = page => page.locator(`${tl} .tl-table`).evaluate(el => ({
  start: Number(el.dataset.calculatedStart), end: Number(el.dataset.calculatedEnd), selected: Number(el.dataset.selected)
}));
// Local midnight of the selected date (plus offset days) in the zone shown in the toolbar.
const localMidnight = (page, offset) => page.evaluate(async offset => {
  const table = document.querySelector('#timeline-view .tl-table');
  const zone = document.querySelector('#timeline-view [data-field="zone"]').value;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(Number(table.dataset.selected));
  const day = new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  const { transitInstants } = await import('/src/lib/transit-time.js');
  return transitInstants(day, '00:00', zone)[0].instant;
}, offset);
async function choosePreset(page, value) {
  await page.selectOption(field('span'), value);
  await page.waitForFunction(() => document.querySelector('#timeline-view .tl-table')?.getAttribute('aria-busy') === 'true',
    null, { timeout: 2000 }).catch(() => {});
  await ready(page);
}

const desktop = await open({ width: 1280, height: 900 });

await check('default 7-day range calculates from local midnight, with bars', async () => {
  await ready(desktop);
  assert.ok(await desktop.locator(`${tl} .tl-bar`).count() > 20);
  assert.match(await desktop.locator(`${tl} .tl-person`).innerText(), /Timeline Demo/);
  const r = await range(desktop);
  assert.deepEqual([r.start, r.end], [await localMidnight(desktop, -3), await localMidnight(desktop, 4)]);
});

await check('transit Moon column matches the engine at the selected instant', async () => {
  await desktop.waitForFunction(async () => {
    const selected = Number(document.querySelector('#timeline-view .tl-table').dataset.selected);
    const { snapshot } = await import('/src/features/transit-timeline/provider.js');
    const moon = snapshot(selected).moon;
    return document.querySelector('#timeline-view .tl-planet[data-planet="moon"] strong')?.textContent === `${moon.gate}.${moon.line}`;
  }, null, { timeout: 10000 });
});

await check('arrow key moves the selected time by one minute', async () => {
  const before = (await range(desktop)).selected;
  await desktop.focus(`${tl} .tl-table`);
  await desktop.keyboard.press('ArrowRight');
  assert.equal((await range(desktop)).selected - before, 60000);
});

await check('clicking a transit bar opens the detail with its timing; Escape closes it', async () => {
  await desktop.locator(`${tl} .tl-bar[data-source="transit"]`).first().click();
  const dialog = desktop.locator('#gate-detail[role="dialog"]');
  await dialog.locator('.tl-detail-timing').waitFor({ timeout: 5000 });
  assert.match(await dialog.locator('.tl-detail-timing').innerText(), /Duration/);
  await desktop.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden', timeout: 5000 });
});

await check('24 hours is the local day, and follows a timezone change', async () => {
  await choosePreset(desktop, '1');
  let r = await range(desktop);
  assert.deepEqual([r.start, r.end], [await localMidnight(desktop, 0), await localMidnight(desktop, 1)]);
  await desktop.selectOption(field('zone'), 'Asia/Tokyo');
  await desktop.waitForFunction(() => document.querySelector('#timeline-view .tl-table')?.getAttribute('aria-busy') === 'true',
    null, { timeout: 2000 }).catch(() => {});
  await ready(desktop);
  r = await range(desktop);
  assert.deepEqual([r.start, r.end], [await localMidnight(desktop, 0), await localMidnight(desktop, 1)],
    'range was not recomputed for Asia/Tokyo');
});

await check('1-year range finishes in under 30 s', async () => {
  const t0 = Date.now();
  await choosePreset(desktop, 'year');
  const seconds = (Date.now() - t0) / 1000;
  console.log(`  1 year calculated in ${seconds.toFixed(1)} s`);
  assert.ok(seconds < 30);
  assert.ok(await desktop.locator(`${tl} .tl-bar`).count() > 20);
});

await check('Transit only hides the birth columns', async () => {
  await choosePreset(desktop, '3');
  await desktop.selectOption(field('mode'), 'transit-only');
  await ready(desktop);
  assert.equal(await desktop.locator(`${tl} .tl-birth-column`).isVisible(), false);
  assert.equal(await desktop.locator(`${tl} .tl-bar[data-source="natal"]`).count(), 0);
});

const phone = await open({ width: 390, height: 844 });

await check('phone: timeline fills the screen without horizontal overflow; ← returns to chart', async () => {
  await ready(phone);
  assert.equal(await phone.locator('.header').isVisible(), false);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `page overflows by ${overflow}px`);
  await phone.locator(`${tl} [data-action="mobile-exit"]`).click();
  await phone.waitForSelector('#chart-view:not(.hidden)', { timeout: 5000 });
});

await check('no page errors', async () => assert.deepEqual(errors, []));

await browser.close();
if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nAll timeline checks passed');
