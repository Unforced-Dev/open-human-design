/**
 * Layout check — fails if any view scrolls sideways or clips content at
 * phone, tablet and desktop widths, in light and dark.
 *
 *   npm run dev            # in one terminal
 *   npm run e2e:layout     # in another (E2E_URL to point elsewhere)
 *
 * SHOT_DIR=walkthrough/ux-tablet/after npm run e2e:layout
 *   also saves a full-page screenshot of every state at 800x1280
 *   (SHOT_WIDTHS=390,800 for more widths; files get a -390 suffix).
 *
 * Needs no network: people are entered with a manual UTC offset.
 */

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.E2E_URL || 'http://localhost:5174';
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';
const SHOT_DIR = process.env.SHOT_DIR || '';
const SHOT_WIDTHS = (process.env.SHOT_WIDTHS || '800').split(',').map(Number);

const SIZES = [
  { w: 360, h: 780 },
  { w: 390, h: 844 },
  { w: 800, h: 1280 }, // Daylight DC-1, portrait
  { w: 1280, h: 900 }
];
const THEMES = (process.env.THEMES || 'light,dark').split(',');
const ONLY = process.env.ONLY_WIDTH ? Number(process.env.ONLY_WIDTH) : null;

let failures = 0;

/**
 * Runs in the page. Returns a list of problems:
 *  - the document itself scrolls horizontally;
 *  - an element sticks out of the viewport with nothing clipping it
 *    (catches fixed sheets and popovers, which don't widen the document);
 *  - an element scrolls or clips horizontally inside itself (content cut off,
 *    or a sideways scroller nobody can see). Opt out with data-hscroll-ok.
 */
function findProblems() {
  const vw = document.documentElement.clientWidth;
  const problems = [];
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = typeof el.className === 'string' ? el.className : el.className?.baseVal;
    if (cls) s += '.' + cls.trim().split(/\s+/).slice(0, 3).join('.');
    const parent = el.parentElement;
    if (parent && !el.id) {
      const pid = parent.id ? `#${parent.id}` : (parent.className && typeof parent.className === 'string' ? '.' + parent.className.trim().split(/\s+/)[0] : parent.tagName.toLowerCase());
      s = `${pid} > ${s}`;
    }
    return s;
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1; // 1px screen-reader-only text clips on purpose
  };

  const docOver = document.documentElement.scrollWidth - vw;
  if (docOver > 1) problems.push(`page scrolls sideways by ${docOver}px`);

  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue; // SVG internals scale with the svg
    if (el.closest('.hidden')) continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const tag = el.tagName.toLowerCase();

    // Content cut off / scrolling sideways inside the element.
    const ox = cs.overflowX;
    if (ox !== 'visible' && !['input', 'textarea', 'select'].includes(tag)
        && cs.textOverflow !== 'ellipsis' && !el.closest('[data-hscroll-ok]')) {
      const over = el.scrollWidth - el.clientWidth;
      if (over > 1) problems.push(`${describe(el)} ${ox === 'hidden' || ox === 'clip' ? 'clips' : 'scrolls'} ${over}px sideways`);
    }

    // Sticking out of the viewport with no clipping ancestor.
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1 && r.left >= -1) continue;
    let clipped = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).overflowX !== 'visible') { clipped = true; break; }
    }
    if (!clipped) problems.push(`${describe(el)} sticks out of the viewport (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
  }
  // Every nav item must show its whole label, all on one row.
  const links = [...document.querySelectorAll('.header .nav-link')].filter(visible);
  for (const link of links) {
    const r = link.getBoundingClientRect();
    if (link.scrollWidth > link.clientWidth + 1 || r.right > vw + 1)
      problems.push(`nav "${link.textContent.trim()}" does not fit (${link.scrollWidth}px in ${link.clientWidth}px)`);
    if (Math.abs(r.top - links[0].getBoundingClientRect().top) > 1)
      problems.push(`nav "${link.textContent.trim()}" wraps to a second row`);
  }
  // One line per offender is plenty — children of a wide parent repeat it.
  return [...new Set(problems)].slice(0, 12);
}

// ---------- Flow helpers ----------
async function enterManual(page, { name, date, time, tz }) {
  await page.waitForSelector('#birth-form');
  if (await page.isHidden('#manual-tz-wrap')) await page.click('#manual-tz-toggle');
  await page.fill('#birth-name', name);
  await page.fill('#birth-date', date);
  await page.fill('#birth-time', time);
  await page.fill('#manual-tz', String(tz));
  await page.click('#birth-form button[type=submit]');
  await page.waitForSelector('#chart-view:not(.hidden) .bodygraph-svg');
}

async function nav(page, view) {
  // Narrow layouts may tuck the nav away; drive the same handler the button uses.
  await page.$eval(`.nav-link[data-view="${view}"]`, el => el.click());
  await page.waitForSelector(`#${view}-view:not(.hidden)`);
}

async function closeDetail(page) {
  await page.evaluate(() => {
    document.querySelector('.detail-panel.open .dp-close')?.click();
  });
  await page.waitForTimeout(250);
}

/** Wait until the detail panel has finished sliding in. */
async function settled(page) {
  await page.waitForSelector('#detail-panel.open');
  await page.waitForFunction(() => {
    const r = document.getElementById('detail-panel').getBoundingClientRect();
    return r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
  }, null, { timeout: 3000 });
}

async function tapGate(page, scope, gate) {
  await page.$eval(`${scope} .bg-gate[data-gate="${gate}"]`, el =>
    el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(400);
}

/** Each state leaves the page showing something worth checking. */
const STATES = [
  ['entry', async (page) => {
    await page.goto(BASE);
    await page.waitForSelector('#birth-form');
  }],
  ['entry-saved', async (page) => {
    await enterManual(page, { name: 'Ada Test', date: '1990-06-15', time: '14:30', tz: -6 });
    await page.selectOption('#people-switcher', '__new');
    await page.waitForSelector('#birth-entry:not(.hidden) .person-chip');
  }],
  ['chart-centers', async (page) => {
    await enterManual(page, { name: 'Ben Test', date: '1985-03-20', time: '08:00', tz: 0 });
    const ada = await page.$eval('#people-switcher', s => [...s.options].find(o => o.textContent.includes('Ada'))?.value);
    await page.selectOption('#people-switcher', ada);
    await page.waitForFunction(() => /Ada Test/.test(document.getElementById('type-banner').textContent));
    await page.waitForTimeout(900); // reveal animation
  }],
  ...['channels', 'gates', 'planets', 'variable', 'cross'].map(tab => [`chart-${tab}`, async (page) => {
    await page.click(`.panel-tab[data-panel="${tab}"]`);
    await page.waitForTimeout(250);
  }]),
  ['gate-detail', async (page) => {
    await page.click('.panel-tab[data-panel="centers"]');
    await tapGate(page, '#bodygraph-container', 34);
  }],
  ['center-detail', async (page) => {
    await closeDetail(page);
    await page.$eval('#bodygraph-container .bg-center[data-center="throat"]', el =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(400);
  }],
  ['edit-modal', async (page) => {
    await closeDetail(page);
    await page.selectOption('#people-switcher', '__edit');
    await page.waitForSelector('.modal #edit-name');
  }],
  ['transits', async (page) => {
    await page.click('#edit-cancel');
    await nav(page, 'transits');
    await page.waitForSelector('#transit-bodygraph .bodygraph-svg');
  }],
  ['transit-detail', async (page) => {
    await page.$eval('#transit-content [data-detail^="gate:"]', el => el.click());
    await settled(page);
  }],
  ['timeline', async (page) => {
    await closeDetail(page);
    await nav(page, 'timeline');
    await page.waitForFunction(() => document.querySelector('#timeline-view .tl-table')?.getAttribute('aria-busy') === 'false', null, { timeout: 60000 });
    await page.waitForTimeout(300);
  }],
  ['timeline-detail', async (page) => {
    await page.$eval('#timeline-view .tl-bar[data-source="transit"]', el => el.click());
    await page.waitForSelector('#detail-panel.open .tl-detail-timing');
    await settled(page);
  }],
  ['connection', async (page) => {
    await closeDetail(page);
    await nav(page, 'connection');
    const ben = await page.$eval('#conn-person', s => [...s.options].find(o => o.textContent.includes('Ben'))?.value);
    await page.selectOption('#conn-person', ben);
    await page.click('#conn-calculate');
    await page.waitForSelector('#conn-composite .bodygraph-svg');
    await page.waitForTimeout(600);
  }],
  ['connection-detail', async (page) => {
    const g = await page.evaluate(() =>
      document.querySelector('#conn-composite .bg-gate-circle:not([fill="transparent"])')?.closest('[data-gate]')?.getAttribute('data-gate'));
    await tapGate(page, '#conn-composite', g);
  }],
  ['team', async (page) => {
    await closeDetail(page);
    await nav(page, 'team');
    await page.$$eval('#team-saved input[type=checkbox]', cbs => cbs.forEach(cb => { cb.checked = true; }));
    await page.click('#team-calculate');
    await page.waitForSelector('#team-content .role-card');
  }]
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const theme of THEMES) {
  for (const { w, h } of SIZES) {
    if (ONLY && w !== ONLY) continue;
    const touch = w <= 800;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    await ctx.addInitScript(t => {
      if (!sessionStorage.getItem('layout-theme-set')) {
        localStorage.setItem('bodygraph-theme', t);
        sessionStorage.setItem('layout-theme-set', '1');
      }
    }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', err => { failures++; console.error(`✖ ${w}px ${theme}: page JS error ${err.message}`); });

    for (const [name, run] of STATES) {
      const label = `${String(w).padStart(4)}px ${theme.padEnd(5)} ${name}`;
      try {
        await run(page);
      } catch (err) {
        failures++;
        console.error(`✖ ${label}: could not reach state — ${err.message.split('\n')[0]}`);
        continue;
      }
      const problems = await page.evaluate(findProblems);
      if (problems.length) {
        failures++;
        console.error(`✖ ${label}\n    ${problems.join('\n    ')}`);
      } else {
        console.log(`✔ ${label}`);
      }
      if (SHOT_DIR && SHOT_WIDTHS.includes(w)) {
        mkdirSync(SHOT_DIR, { recursive: true });
        // Fixed sheets and dialogs only make sense in the viewport they cover.
        const overlay = await page.$('#detail-panel.open, .modal-overlay');
        const suffix = w === 800 ? '' : `-${w}`;
        await page.screenshot({ path: `${SHOT_DIR}/${theme}-${name}${suffix}.png`, fullPage: !overlay });
      }
    }
    await ctx.close();
  }
}

await browser.close();
console.log(failures ? `\n${failures} layout problem(s)` : '\nNo horizontal overflow at any width');
process.exit(failures ? 1 : 0);
