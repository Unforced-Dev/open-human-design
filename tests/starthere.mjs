/**
 * First run — browser test. A newcomer's nameless first chart is kept and
 * can be renamed; the "Start here" card opens each step in the detail panel
 * and stays dismissed; on a phone the Foundation and tabs come early; the
 * reliability note says plainly what could change.
 *
 *   npm run dev            # in one terminal
 *   npm run e2e:start      # in another (E2E_URL to point elsewhere)
 *
 * Needs no network: charts are entered with a manual UTC offset.
 */

import { chromium } from 'playwright-core';

const BASE = process.env.E2E_URL || 'http://localhost:5174';
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`✔ ${name}`); } catch (err) { failures++; console.error(`✖ ${name}\n  ${err.message || err}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

async function enterManual(page, { name = '', date, time, tz }) {
  await page.waitForSelector('#birth-form');
  if (await page.isHidden('#manual-tz-wrap')) await page.click('#manual-tz-toggle');
  await page.fill('#birth-name', name);
  await page.fill('#birth-date', date);
  await page.fill('#birth-time', time);
  await page.fill('#manual-tz', String(tz));
  await page.click('#birth-form button[type=submit]');
  await page.waitForSelector('#chart-view:not(.hidden) .bodygraph-svg');
}

const profiles = (page) => page.evaluate(() => {
  const raw = Object.keys(localStorage).filter(k => /profile/i.test(k)).map(k => localStorage.getItem(k)).join('');
  return (raw.match(/"birthDate"/g) || []).length;
});
const bannerName = (page) => page.textContent('#type-banner .type-name').then(t => t.trim());

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const newPage = async (viewport = { width: 390, height: 844 }) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', err => { failures++; console.error(`✖ page JS error: ${err.message}`); });
  return page;
};

// --- Keeping the first chart -------------------------------------------
{
  const page = await newPage();
  await page.goto(BASE);

  await check('name field says optional (no "to save") before any chart is saved', async () => {
    const hint = await page.textContent('#birth-name-hint');
    expect(hint.trim() === '(optional)', `hint was "${hint}"`);
  });

  await enterManual(page, { date: '1990-06-15', time: '14:30', tz: -6 });

  await check('a nameless first chart is saved as "Me"', async () => {
    expect(await bannerName(page) === 'Me', `banner name "${await bannerName(page)}"`);
    expect(await profiles(page) === 1, `expected 1 saved profile, found ${await profiles(page)}`);
  });

  await check('"Me" stays on this device: not in the address bar or share links', async () => {
    const search = await page.evaluate(() => location.search);
    expect(/[?&]d=1990-06-15/.test(search) && !/[?&]n=/.test(search), `address bar: ${search}`);
  });

  await check('"Me" is not in the copied link, the invite or the saved image', async () => {
    await page.evaluate(() => {
      window.__copied = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied.push(t); } } });
    });
    await page.$eval('#share-chart', b => b.click());
    await page.$eval('#invite-compare', b => b.click());
    await page.waitForFunction(() => window.__copied.length === 2);
    const copied = await page.evaluate(() => window.__copied);
    expect(copied.every(u => /[?&]d=1990-06-15/.test(u) && !/[?&]n=/.test(u)), `copied: ${copied.join(' | ')}`);

    // The static dev build has no /og endpoint; stand in for it and look at what the app asks for.
    let cardUrl = '';
    await page.route('**/og/card.png*', (route) => {
      cardUrl = route.request().url();
      route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('89504e470d0a1a0a', 'hex') });
    });
    const [download] = await Promise.all([page.waitForEvent('download'), page.$eval('#save-image', b => b.click())]);
    await page.unroute('**/og/card.png*');
    expect(cardUrl && !/[?&]n=/.test(new URL(cardUrl).search), `image card request: ${cardUrl}`);
    expect(!/^me-/.test(download.suggestedFilename()), `image file name: ${download.suggestedFilename()}`);
  });

  await check('it is still there after coming back to the bare address', async () => {
    await page.goto(BASE);
    await page.waitForSelector('#chart-view:not(.hidden) .bodygraph-svg');
    expect(await bannerName(page) === 'Me', `came back to "${await bannerName(page)}"`);
  });

  await check('"Add your name" renames it in place', async () => {
    await page.click('#rename-chart');
    await page.fill('#edit-name', 'Riley');
    await page.click('#edit-save');
    await page.waitForFunction(() => document.querySelector('#type-banner .type-name').textContent.trim() === 'Riley');
    expect(!(await page.$('#rename-chart')), 'rename prompt still shown after naming');
    expect(await profiles(page) === 1, 'renaming made a second profile');
    await page.reload();
    await page.waitForSelector('#chart-view:not(.hidden) .bodygraph-svg');
    expect(await bannerName(page) === 'Riley', `after reload: "${await bannerName(page)}"`);
  });

  await check('a later nameless chart is shown but not saved', async () => {
    await page.selectOption('#people-switcher', '__new');
    expect((await page.textContent('#birth-name-hint')).trim() === '(optional, to save)', 'hint did not switch to "to save"');
    await enterManual(page, { date: '1985-03-20', time: '08:00', tz: 0 });
    expect(await profiles(page) === 1, `expected still 1 profile, found ${await profiles(page)}`);
  });
  await page.context().close();
}

// --- Start here card -----------------------------------------------------
{
  const page = await newPage();
  await page.goto(BASE);
  await enterManual(page, { name: 'Ada', date: '1990-06-15', time: '14:30', tz: -6 });

  await check('Start here sits right under the type banner with three steps', async () => {
    const order = await page.evaluate(() => {
      const banner = document.getElementById('type-banner');
      return banner.nextElementSibling?.id;
    });
    expect(order === 'start-here', `element after the banner is ${order}`);
    expect(await page.isVisible('#start-here'), 'card hidden');
    const steps = await page.$$eval('#start-here .start-step', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    expect(steps.length === 3, `${steps.length} steps`);
    expect(/Strategy/.test(steps[0]) && /Authority/.test(steps[1]) && /center/i.test(steps[2]), steps.join(' | '));
  });

  await check('each step opens its item in the detail panel', async () => {
    const want = ['Type', 'Authority', /Center$/];
    const n = await page.$$eval('#start-here .start-step', els => els.length);
    for (let i = 0; i < n; i++) {
      await page.click(`#start-here li:nth-child(${i + 1}) .start-step`);
      const label = await page.$eval('#detail-panel', p => !p.hidden && p.querySelector('.detail-label')?.textContent.trim());
      const ok = typeof want[i] === 'string' ? label === want[i] : want[i].test(label || '');
      expect(ok, `step ${i + 1} opened "${label}"`);
      await page.keyboard.press('Escape');
      expect(await page.$eval('#detail-panel', p => p.hidden), 'panel did not close');
    }
  });

  await check('steps work from the keyboard', async () => {
    await page.focus('#start-here li:nth-child(2) .start-step');
    await page.keyboard.press('Enter');
    const label = await page.$eval('#detail-panel .detail-label', el => el.textContent.trim());
    expect(label === 'Authority', `Enter opened "${label}"`);
    await page.keyboard.press('Escape');
  });

  await check('a chart opened from someone else\'s link gets no Start here card', async () => {
    const other = await newPage();
    await other.goto(`${BASE}/?d=1985-03-20&t=08:00&tz=0&n=Sam`);
    await other.waitForSelector('#chart-view:not(.hidden) .bodygraph-svg');
    expect(!(await other.isVisible('#start-here')), 'card shown on a shared chart');
    await other.context().close();
  });

  await check('"Got it" hides the card, and it stays hidden after a reload and for other charts', async () => {
    await page.click('#start-here .start-dismiss');
    expect(!(await page.isVisible('#start-here')), 'still visible after Got it');
    await page.reload();
    await page.waitForSelector('#chart-view:not(.hidden) .bodygraph-svg');
    expect(!(await page.isVisible('#start-here')), 'came back after reload');
    await page.selectOption('#people-switcher', '__new');
    await enterManual(page, { name: 'Ben', date: '1985-03-20', time: '08:00', tz: 0 });
    expect(!(await page.isVisible('#start-here')), 'came back for another chart');
  });
  await page.context().close();
}

// --- Phone layout --------------------------------------------------------
{
  const page = await newPage({ width: 390, height: 844 });
  await page.goto(BASE);
  await enterManual(page, { date: '1990-06-15', time: '14:30', tz: -6 });
  const pos = await page.evaluate(() => {
    const top = s => document.querySelector(s).getBoundingClientRect().top + scrollY;
    return { foundation: top('#foundation-panel') / innerHeight, tabs: top('.panel-tabs') / innerHeight,
      graph: top('#bodygraph-container') / innerHeight };
  });
  console.log(`  390x844: Foundation at ${pos.foundation.toFixed(2)} screens, tabs at ${pos.tabs.toFixed(2)}, bodygraph at ${pos.graph.toFixed(2)}`);

  await check('on a phone the Foundation starts within the first screen and a bit', async () => {
    expect(pos.foundation < 1.1, `Foundation at ${pos.foundation.toFixed(2)} screens`);
  });
  await check('on a phone the tabs start before two and a half screens', async () => {
    expect(pos.tabs < 2.4, `tabs at ${pos.tabs.toFixed(2)} screens`);
  });
  await check('on a phone the Foundation comes before the bodygraph in reading order too', async () => {
    const before = await page.evaluate(() => !!(document.getElementById('foundation-panel')
      .compareDocumentPosition(document.getElementById('bodygraph-container')) & Node.DOCUMENT_POSITION_FOLLOWING));
    expect(before, 'Foundation is after the bodygraph in the DOM');
  });
  await check('widening past the phone breakpoint puts the Foundation back in the side column', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const parent = await page.$eval('#foundation-panel', el => el.parentElement.className);
    expect(/info-column/.test(parent), `Foundation parent is "${parent}"`);
  });
  await page.context().close();
}

// --- Reliability note ----------------------------------------------------
{
  const page = await newPage({ width: 800, height: 1280 });
  await page.goto(BASE);
  const note = async () => (await page.textContent('#foundation-panel .reliability')).replace(/\s+/g, ' ').trim();

  await check('one sensitive item: names it plainly, no "one fine detail"', async () => {
    await enterManual(page, { name: 'One', date: '1990-01-01', time: '21:15', tz: 0 });
    const text = await note();
    expect(/Your Moon could change if your birth time is off by 15 minutes or less/.test(text), text);
    expect(!/fine detail|only thing/i.test(text), text);
  });

  await check('several sensitive items: lists them all, no "one fine detail"', async () => {
    await page.selectOption('#people-switcher', '__new');
    await enterManual(page, { name: 'Two', date: '1990-01-03', time: '21:15', tz: 0 });
    const text = await note();
    expect(/Your Profile and Variable could change/.test(text), text);
    expect(!/fine detail|only thing/i.test(text), text);
  });
  await page.context().close();
}

await browser.close();
if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll first-run checks passed');
