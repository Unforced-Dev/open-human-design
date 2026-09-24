/**
 * End-to-end smoke test — drives system Chrome against a running dev server.
 *
 *   npm run dev          # in one terminal (or any port via E2E_URL)
 *   npm run e2e          # in another
 *
 * Exercises the real flows: birth entry with place autocomplete (live
 * Open-Meteo call), chart render, gate click → detail, tabs, saving a
 * person, people switcher, connection compare, theme toggle.
 */

import { chromium } from 'playwright-core';

const BASE = process.env.E2E_URL || 'http://localhost:5174';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let failures = 0;
const ok = (name) => console.log(`✔ ${name}`);
const fail = (name, err) => { failures++; console.error(`✖ ${name}\n  ${err}`); };

async function check(name, fn) {
  try { await fn(); ok(name); } catch (err) { fail(name, err.message || err); }
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1380, height: 1000 } });
page.on('pageerror', err => fail('page JS error', err.message));

// --- Entry flow with live geocoding ---
await page.goto(BASE);

await check('entry form renders', async () => {
  await page.waitForSelector('#birth-form', { timeout: 5000 });
});

await check('place autocomplete returns results (Open-Meteo)', async () => {
  await page.fill('#birth-name', 'E2E Person');
  await page.fill('#birth-date', '1990-06-15');
  await page.fill('#birth-time', '14:30');
  await page.fill('#birth-place', 'Boulder');
  await page.waitForSelector('.place-result', { timeout: 8000 });
});

await check('selecting a place resolves historical timezone', async () => {
  await page.click('.place-result:first-child');
  const chip = await page.waitForSelector('#tz-chip:not(.hidden)', { timeout: 3000 });
  const text = await chip.textContent();
  if (!/UTC-6/.test(text)) throw new Error(`expected UTC-6 (MDT June 1990), got: ${text}`);
  if (!/America\/Denver/.test(text)) throw new Error(`expected America/Denver, got: ${text}`);
});

await check('chart renders after submit', async () => {
  await page.click('#birth-form button[type=submit]');
  await page.waitForSelector('#chart-view:not(.hidden)', { timeout: 5000 });
  await page.waitForSelector('.bodygraph-svg', { timeout: 3000 });
});

await check('type banner shows plain-language type', async () => {
  const banner = await page.textContent('#type-banner');
  if (!/Generator|Manifestor|Projector|Reflector/.test(banner)) throw new Error(banner.slice(0, 120));
});

await check('planet columns show 26 activations', async () => {
  const rows = await page.$$eval('.bg-planet-row', els =>
    els.filter(e => e.querySelector('.bg-planet-act')?.textContent !== '—').length);
  if (rows !== 26) throw new Error(`got ${rows} rows`);
});

await check('clicking a gate opens detail card', async () => {
  await page.click('.bg-gate[data-gate="34"]');
  await page.waitForSelector('#gate-detail:not(.hidden)', { timeout: 3000 });
  const detail = await page.textContent('#gate-detail');
  if (!/Gate 34/.test(detail)) throw new Error(detail.slice(0, 120));
});

await check('lens switcher shows the three traditions', async () => {
  await page.click('.lens-switch button[data-lens="iching"]');
  let c = await page.textContent('#lens-content');
  if (!/Hexagram 34|Power of the Great/.test(c)) throw new Error('I Ching lens: ' + c.slice(0, 100));
  await page.click('.lens-switch button[data-lens="gk"]');
  c = await page.textContent('#lens-content');
  if (!/Majesty|Strength/.test(c)) throw new Error('Gene Keys lens: ' + c.slice(0, 100));
  await page.click('.lens-switch button[data-lens="hd"]'); // restore default
});

await check('relational highlight links chart ↔ data both ways + pins on click', async () => {
  // Start clean: close any card a prior check left open and clear hover state.
  await page.evaluate(() => document.querySelector('#gate-detail .gate-detail-close')?.click());
  await page.click('.panel-tab[data-panel="gates"]');
  await page.waitForSelector('.gate-item[data-gate="34"]', { timeout: 3000 });
  // Dispatch the real handler events directly — deterministic, avoids
  // mouse-trajectory/scroll quirks of a tall sticky-column layout.
  const fire = (sel, type) => page.$eval(sel, (el, t) =>
    el.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerType: 'mouse' })), type);

  // Forward: a Gates-panel row hover dims the graph and lights its gate.
  await fire('.gate-item[data-gate="34"]', 'pointerenter');
  await page.waitForTimeout(120);
  const dimmed = await page.$eval('.bodygraph-svg', el => el.classList.contains('bg-dimmed'));
  if (!dimmed) throw new Error('graph did not dim when hovering a data row');
  const gateLit = await page.$eval('.bg-gate-path[data-gate="34"]', el => el.classList.contains('bg-lit'));
  if (!gateLit) throw new Error('gate 34 path not lit from row hover');
  await fire('.gate-item[data-gate="34"]', 'pointerleave');

  // Reverse: a gate hover on the graph lights the matching panel row.
  await fire('.bg-gate[data-gate="34"]', 'pointerover');
  await page.waitForTimeout(120);
  const rowLit = await page.$$eval('#panel-content [data-gate="34"].row-lit', els => els.length > 0);
  if (!rowLit) throw new Error('panel row not lit from graph hover');

  // Click pins the gate lit even after the pointer leaves the graph.
  await page.click('.bg-gate[data-gate="34"]');
  await fire('.bodygraph-svg', 'pointerout');
  await page.waitForTimeout(120);
  const pinned = await page.$eval('.bg-gate-path[data-gate="34"]', el => el.classList.contains('bg-lit'));
  if (!pinned) throw new Error('clicked gate did not stay pinned-lit after pointer left');
  // Close the card to restore a clean highlight state for later checks.
  await page.click('#gate-detail .gate-detail-close');
});

await check('centers are interactive: hover lights, click opens center detail, panel ↔ graph', async () => {
  await page.evaluate(() => document.querySelector('#gate-detail .gate-detail-close')?.click());
  const fire = (sel, type) => page.$eval(sel, (el, t) =>
    el.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerType: 'mouse' })), type);
  // Hover a center on the graph → it lights and the graph dims.
  await fire('.bg-center[data-center="throat"]', 'pointerover');
  await page.waitForTimeout(120);
  if (!await page.$eval('.bg-center[data-center="throat"]', el => el.classList.contains('bg-lit')))
    throw new Error('throat center did not light on hover');
  await fire('.bg-center[data-center="throat"]', 'pointerout');
  // Click a center → its detail card opens with status + gate chips.
  await page.click('.bg-center[data-center="throat"]');
  await page.waitForSelector('#gate-detail .center-detail-card[data-center="throat"]', { timeout: 3000 });
  const txt = await page.textContent('#gate-detail .center-detail-card');
  if (!/Throat/.test(txt)) throw new Error('center detail title missing: ' + txt.slice(0, 80));
  if (!(await page.$('#gate-detail .gate-chip'))) throw new Error('center detail gate chips missing');
  await page.keyboard.press('Escape');
  // Reverse: hovering the Centers-panel card lights that center on the graph.
  await page.click('.panel-tab[data-panel="centers"]');
  await page.waitForSelector('.center-card[data-center="g"]', { timeout: 3000 });
  await fire('.center-card[data-center="g"]', 'pointerenter');
  await page.waitForTimeout(120);
  if (!await page.$eval('.bg-center[data-center="g"]', el => el.classList.contains('bg-lit')))
    throw new Error('G center not lit from panel-card hover');
  await fire('.center-card[data-center="g"]', 'pointerleave');
  await page.evaluate(() => document.querySelector('#gate-detail .gate-detail-close')?.click());
});

await check('panel tabs switch content', async () => {
  for (const tab of ['planets', 'variable', 'cross', 'channels', 'gates', 'centers']) {
    await page.click(`.panel-tab[data-panel="${tab}"]`);
    const content = await page.textContent('#panel-content');
    if (content.trim().length < 50) throw new Error(`${tab} tab looks empty`);
  }
});

await check('person was saved and appears in switcher', async () => {
  const options = await page.$$eval('#people-switcher option', els => els.map(e => e.textContent));
  if (!options.some(o => o.includes('E2E Person'))) throw new Error(`options: ${options.join(', ')}`);
});

await check('share URL contains birth data', async () => {
  const url = page.url();
  if (!/d=1990-06-15/.test(url) || !/t=14%3A30|t=14:30/.test(url)) throw new Error(url);
});

// --- Transits ---
await check('transits view renders with overlay graph', async () => {
  await page.click('.nav-link[data-view="transits"]');
  await page.waitForSelector('#transits-view:not(.hidden)', { timeout: 3000 });
  await page.waitForSelector('#transit-bodygraph .bodygraph-svg', { timeout: 3000 });
  const content = await page.textContent('#transit-content');
  if (!/Transit Sun/.test(content)) throw new Error(content.slice(0, 120));
});

await check('transit details open outside the hidden natal view and retain their context', async () => {
  await page.fill('#transit-date', '2026-09-23');
  await page.locator('#transit-date').press('Tab');
  await page.click('#transit-bodygraph .bg-gate[data-gate="20"]');
  await page.waitForSelector('#gate-detail:not(.hidden)', { timeout: 3000 });
  const text = await page.textContent('#gate-detail');
  if (!/Transit Uranus/.test(text) || !/20\.6/.test(text)) throw new Error('transit activation missing');
  if (!await page.$eval('#transit-bodygraph .bg-gate[data-gate="20"]', el => el.classList.contains('bg-lit')))
    throw new Error('transit graph selection was not pinned');
  await page.click('#gate-detail [data-lens="iching"]');
  if (!/Line 6/.test(await page.textContent('#lens-content'))) throw new Error('transit line reading missing');
  await page.click('#gate-detail [data-lens="hd"]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#gate-detail', { state: 'hidden' });
  await page.click('#transit-bodygraph .bg-center[data-center="throat"]');
  await page.waitForSelector('#gate-detail .center-detail-card');
  await page.click('#gate-detail .gate-chip[data-gate="20"]');
  if (!/Transit Uranus/.test(await page.textContent('#gate-detail'))) throw new Error('context lost on center-to-gate navigation');
  await page.click('#gate-detail .gate-detail-back');
  await page.waitForSelector('#gate-detail .center-detail-card');
  await page.click('#gate-detail', { position: { x: 5, y: 5 } });
  await page.waitForSelector('#gate-detail', { state: 'hidden' });
  if (await page.$eval('body', el => el.classList.contains('modal-open'))) throw new Error('scroll lock survived dismissal');
});

await check('coexisting graphs resolve all paints within their own SVG', async () => {
  const problems = await page.$$eval('.bodygraph-svg', graphs => {
    const ids = graphs.flatMap(svg => [...svg.querySelectorAll('[id]')].map(e => e.id));
    const problems = ids.filter((id, i) => ids.indexOf(id) !== i);
    for (const svg of graphs) {
      for (const el of svg.querySelectorAll('[fill^="url(#"]')) {
        const id = el.getAttribute('fill').slice(5, -1);
        if (!svg.querySelector(`[id="${id}"]`)) problems.push(id);
      }
      if (svg.querySelectorAll('.bg-integration-span').length !== 2) problems.push('missing Integration span');
    }
    return problems;
  });
  if (problems.length) throw new Error(problems.join(', '));
});

// --- Connection with manual person ---
// Shared place-search helper (Connection / Team): type → pick first result.
async function pickPlace(scope, query) {
  await page.fill(`${scope} .ps-input`, query);
  await page.waitForSelector(`${scope} .ps-result`, { timeout: 8000 });
  await page.click(`${scope} .ps-result`);
  await page.waitForSelector(`${scope} .ps-chip`, { timeout: 5000 }); // offset resolved
}

await check('connection compare works (place search resolves tz)', async () => {
  await page.click('.nav-link[data-view="connection"]');
  await page.fill('#conn-name', 'Partner');
  await page.fill('#conn-date', '1985-03-20');
  await page.fill('#conn-time', '08:00');
  await pickPlace('#conn-place', 'London');
  await page.click('#conn-calculate');
  await page.waitForSelector('#connection-content .foundation-item', { timeout: 5000 });
  const content = await page.textContent('#connection-content');
  if (!/How you decide together/.test(content)) throw new Error(content.slice(0, 120));
  // The combined (composite) chart renders, has a legend, and is interactive.
  await page.waitForSelector('#conn-composite .bodygraph-svg', { timeout: 5000 });
  if (!(await page.$('.composite-legend'))) throw new Error('composite legend missing');
  const cg = await page.evaluate(() => {
    const el = document.querySelector('#conn-composite .bg-gate-circle:not([fill="transparent"])')?.closest('[data-gate]');
    return el?.getAttribute('data-gate');
  });
  if (!cg) throw new Error('no active gate found on composite chart');
  await page.click(`#conn-composite .bg-gate[data-gate="${cg}"]`);
  await page.waitForSelector('#conn-detail:not(.hidden) .gate-detail-card', { timeout: 3000 });
  if (!/Carried by/.test(await page.textContent('#conn-detail')))
    throw new Error('composite gate detail did not render');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#conn-detail', { state: 'hidden' });
});

// --- Team using manual rows with place search ---
await check('team analysis works (place search per row)', async () => {
  await page.click('.nav-link[data-view="team"]');
  await page.click('#add-member'); // one row exists from init; now two
  const rows = [
    { date: '1992-11-02', place: 'Tokyo' },
    { date: '1985-03-20', place: 'Paris' },
  ];
  for (let i = 0; i < rows.length; i++) {
    const sel = `#team-members .team-member-row:nth-child(${i + 1})`;
    await page.fill(`${sel} .team-date`, rows[i].date);
    await pickPlace(`${sel} .team-place`, rows[i].place);
  }
  await page.click('#team-calculate');
  await page.waitForSelector('#team-content .role-card', { timeout: 5000 });
});

// --- Theme toggle re-renders graph ---
await check('theme toggle flips palette and re-renders bodygraph', async () => {
  await page.click('.nav-link[data-view="chart"]');
  await page.click('#theme-toggle');
  const theme = await page.getAttribute('html', 'data-theme');
  if (theme !== 'dark') throw new Error(`theme: ${theme}`);
  await page.waitForSelector('.bodygraph-svg', { timeout: 3000 });
});

// --- Reload restores last person ---
await check('reload auto-restores last chart', async () => {
  await page.goto(BASE);
  await page.waitForSelector('#chart-view:not(.hidden)', { timeout: 5000 });
  const banner = await page.textContent('#type-banner');
  if (!/E2E Person/.test(banner)) throw new Error(banner.slice(0, 120));
});

// --- P1-7: edit name + AI access through the switcher modal ---
await check('edit person renames in place (P1-7)', async () => {
  await page.selectOption('#people-switcher', '__edit');
  await page.waitForSelector('.modal #edit-name', { timeout: 3000 });
  await page.fill('.modal #edit-name', 'Renamed Person');
  await page.click('.modal #edit-save');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 3000 });
  const banner = await page.textContent('#type-banner');
  if (!/Renamed Person/.test(banner)) throw new Error('rename not reflected: ' + banner.slice(0, 120));
});

// --- P1-11: a shared chart stays comparable after "make your own" ---
await check('shared person retained for comparison (P1-11)', async () => {
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  p2.on('pageerror', err => fail('P1-11 page JS error', err.message));
  await p2.goto(`${BASE}?d=1980-05-10&t=09:00&tz=2&n=GuestPal`);
  await p2.click('#make-own', { timeout: 5000 });
  await p2.fill('#birth-name', 'Me');
  await p2.fill('#birth-date', '1990-06-15');
  await p2.fill('#birth-time', '14:30');
  await p2.fill('#birth-place', 'Boulder');
  await p2.waitForSelector('.place-result', { timeout: 8000 });
  await p2.click('.place-result:first-child');
  await p2.click('#birth-form button[type=submit]');
  await p2.waitForSelector('#chart-view:not(.hidden)', { timeout: 5000 });
  await p2.click('.nav-link[data-view="connection"]');
  const opts = await p2.textContent('#conn-person');
  if (!/GuestPal/.test(opts)) throw new Error('shared guest not retained in picker: ' + opts);
  await ctx.close();
});

// --- Dyad: a "compare with me" invite walks the recipient to the comparison ---
await check('connection invite auto-runs the comparison (dyad loop)', async () => {
  const ctx = await browser.newContext();
  const p3 = await ctx.newPage();
  p3.on('pageerror', err => fail('dyad page JS error', err.message));
  await p3.goto(`${BASE}?d=1975-12-01&t=06:30&tz=-5&n=Inviter&connect=1`);
  await p3.waitForSelector('#entry-invite:not(.hidden)', { timeout: 5000 });
  const cta = await p3.textContent('#entry-invite');
  if (!/Inviter/.test(cta)) throw new Error('invite banner missing: ' + cta);
  await p3.fill('#birth-name', 'Recipient');
  await p3.fill('#birth-date', '1990-06-15');
  await p3.fill('#birth-time', '14:30');
  await p3.fill('#birth-place', 'Boulder');
  await p3.waitForSelector('.place-result', { timeout: 8000 });
  await p3.click('.place-result:first-child');
  await p3.click('#birth-form button[type=submit]');
  await p3.waitForSelector('#connection-content .foundation-item', { timeout: 6000 });
  const content = await p3.textContent('#connection-content');
  if (!/How you decide together/.test(content)) throw new Error('comparison not shown: ' + content.slice(0, 120));
  await ctx.close();
});

await browser.close();

console.log(failures ? `\n${failures} FAILED` : '\nAll e2e checks passed');
process.exit(failures ? 1 : 0);
