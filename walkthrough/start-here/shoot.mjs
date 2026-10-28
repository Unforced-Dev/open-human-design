/**
 * Screenshots for WALKTHROUGH.md (start-here). Against a running dev server:
 *   E2E_URL=http://localhost:5174 node walkthrough/start-here/shoot.mjs
 */
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_URL || 'http://localhost:5174';
const OUT = new URL('.', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true });
const settle = (page) => page.waitForTimeout(1600); // bodygraph reveal animation

async function enter(page, name = '') {
  if (await page.isHidden('#manual-tz-wrap')) await page.click('#manual-tz-toggle');
  await page.fill('#birth-name', name);
  await page.fill('#birth-date', '1990-01-01');
  await page.fill('#birth-time', '21:15');
  await page.fill('#manual-tz', '0');
}
const submit = async (page) => {
  await page.click('#birth-form button[type=submit]');
  await page.waitForSelector('#chart-view:not(.hidden) .bodygraph-svg');
  await settle(page);
};
// Park the mouse on the header so no hover state leaks into a shot.
const shot = async (page, name, full = false) => {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(150);
  return page.screenshot({ path: `${OUT}${name}.png`, fullPage: full });
};

// Phone
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE);
  await enter(page);
  await shot(page, '01-entry-390');
  await submit(page);
  await shot(page, '02-start-here-390');
  await page.click('#start-here li:nth-child(2) .start-step');
  await page.waitForTimeout(400);
  await shot(page, '03-authority-sheet-390');
  await page.keyboard.press('Escape');
  await page.click('#start-here li:nth-child(3) .start-step');
  await page.waitForTimeout(400);
  await shot(page, '04-center-sheet-390');
  await page.keyboard.press('Escape');
  await page.evaluate(() => scrollTo(0, document.getElementById('foundation-panel').getBoundingClientRect().top + scrollY - 70));
  await page.waitForTimeout(300);
  await shot(page, '05-foundation-390');
  await page.evaluate(() => scrollTo(0, 0));
  await shot(page, '10-after-full-390', true);
  await page.click('#rename-chart');
  await page.fill('#edit-name', 'Riley');
  await shot(page, '06-rename-390');
  await page.click('#edit-save');
  await settle(page);
  await page.click('#start-here .start-dismiss');
  await page.goto(BASE);
  await page.waitForSelector('#chart-view:not(.hidden) .bodygraph-svg');
  await settle(page);
  await shot(page, '07-dismissed-reloaded-390');
  await page.close();
}

// Tablet
{
  const page = await browser.newPage({ viewport: { width: 800, height: 1280 } });
  await page.goto(BASE);
  await enter(page);
  await submit(page);
  await shot(page, '08-start-here-800');
  await page.click('#start-here li:nth-child(1) .start-step');
  await page.waitForTimeout(400);
  await shot(page, '09-strategy-sheet-800');
  await page.close();
}
await browser.close();
