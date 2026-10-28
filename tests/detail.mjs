/**
 * Detail panel — browser test. Every item opens a panel in place, in every
 * view, by touch, mouse and keyboard; sheet on narrow, side panel on wide.
 *
 *   npm run dev            # in one terminal
 *   npm run e2e:detail     # in another (E2E_URL to point elsewhere)
 *
 * Needs no network: people are entered with a manual UTC offset.
 */

import { chromium } from 'playwright-core';

const BASE = process.env.E2E_URL || 'http://localhost:5174';
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`✔ ${name}`); } catch (err) { failures++; console.error(`✖ ${name}\n  ${err.message || err}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

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

async function seed(page) {
  await page.goto(BASE);
  await enterManual(page, { name: 'Ada Test', date: '1990-06-15', time: '14:30', tz: -6 });
  await page.selectOption('#people-switcher', '__new');
  await enterManual(page, { name: 'Ben Test', date: '1985-03-20', time: '08:00', tz: 0 });
  await page.selectOption('#people-switcher', '__new');
  await enterManual(page, { name: 'Cy Test', date: '1992-11-02', time: '12:00', tz: 9 });
  const ada = await page.$eval('#people-switcher', s => [...s.options].find(o => o.textContent.includes('Ada'))?.value);
  await page.selectOption('#people-switcher', ada);
  await page.waitForFunction(() => /Ada Test/.test(document.getElementById('type-banner').textContent));
}

const panelState = (page) => page.evaluate(() => {
  const p = document.getElementById('detail-panel');
  return {
    open: !!p && !p.hidden,
    mode: p?.classList.contains('dp-sheet') ? 'sheet' : p?.classList.contains('dp-side') ? 'side' : null,
    modal: p?.getAttribute('aria-modal'),
    backdrop: !document.querySelector('.dp-backdrop').hidden,
    label: p?.querySelector('.detail-label')?.textContent.trim(),
    title: p?.querySelector('#dp-title')?.textContent.trim(),
    back: !!p && !p.querySelector('.dp-back').hidden,
    focusInPanel: !!p && p.contains(document.activeElement)
  };
});

/**
 * Click every trigger inside `scopeSel` (one at a time, from the page) and
 * require that each opens a panel with a title. Returns how many it opened.
 */
async function openEveryTrigger(page, scopeSel) {
  const ids = await page.$$eval(`${scopeSel} [data-detail]`, els => els
    .filter(el => el.offsetParent !== null && !el.closest('#detail-panel'))
    .map((el, i) => { el.dataset.testIdx = String(i); return el.dataset.detail; }));
  expect(ids.length > 0, `no triggers found in ${scopeSel}`);
  for (let i = 0; i < ids.length; i++) {
    await page.$eval(`${scopeSel} [data-test-idx="${i}"]`, el => el.click());
    const st = await panelState(page);
    expect(st.open && st.title, `${scopeSel} ${ids[i]} did not open a panel`);
    await page.keyboard.press('Escape');
  }
  return ids.length;
}

/** Every trigger must be reachable by keyboard: a real button or role=button + tabindex. */
async function assertKeyboardReachable(page, scopeSel) {
  const bad = await page.$$eval(`${scopeSel} [data-detail]`, els => els
    .filter(el => el.tagName !== 'BUTTON' && !(el.getAttribute('tabindex') === '0' && el.getAttribute('role') === 'button'))
    .map(el => el.outerHTML.slice(0, 80)));
  expect(!bad.length, `not keyboard-reachable: ${bad.join(' | ')}`);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// ---------------- Tablet (Daylight, touch) ----------------
{
  const ctx = await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', err => { failures++; console.error(`✖ page JS error: ${err.message}`); });
  await seed(page);

  await check('800px: tapping a center card opens a modal sheet with backdrop', async () => {
    await page.tap('.center-card[data-center]');
    await page.waitForSelector('#detail-panel.open');
    const st = await panelState(page);
    expect(st.mode === 'sheet' && st.modal === 'true' && st.backdrop, `expected modal sheet, got ${JSON.stringify(st)}`);
    expect(/Center/.test(st.label), `label: ${st.label}`);
    expect(st.focusInPanel, 'focus did not move into the sheet');
    const locked = await page.evaluate(() => document.body.classList.contains('dp-lock'));
    expect(locked, 'page behind the sheet still scrolls');
  });

  await check('800px: a link inside the panel opens onward with a Back trail', async () => {
    const first = (await panelState(page)).title;
    await page.tap('#detail-panel .gate-chip');
    let st = await panelState(page);
    expect(/^Gate \d+/.test(st.label) && st.back, `onward gate: ${JSON.stringify(st)}`);
    await page.tap('#detail-panel [data-detail^="line:"]');
    st = await panelState(page);
    expect(/Line \d/.test(st.label), `onward line: ${st.label}`);
    await page.tap('#detail-panel .dp-back');
    await page.tap('#detail-panel .dp-back');
    st = await panelState(page);
    expect(st.title === first && !st.back, `Back should return to "${first}", got "${st.title}"`);
  });

  await check('800px: lens switch re-renders in place without adding to the trail', async () => {
    await page.$eval('#bodygraph-container .bg-gate[data-gate="34"]', el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.click('#detail-panel [data-lens="iching"]');
    const lens = await page.textContent('#detail-panel .dp-lens');
    expect(/Hexagram 34/.test(lens), `I Ching lens: ${lens.slice(0, 80)}`);
    const st = await panelState(page);
    expect(!st.back && st.label === 'Gate 34', `lens should not push history: ${JSON.stringify(st)}`);
    await page.click('#detail-panel [data-lens="hd"]');
  });

  await check('800px: backdrop tap closes the sheet and unlocks the page', async () => {
    await page.mouse.click(400, 40); // the backdrop above the sheet
    const st = await panelState(page);
    expect(!st.open && !st.backdrop, `still open: ${JSON.stringify(st)}`);
    expect(!(await page.evaluate(() => document.body.classList.contains('dp-lock'))), 'page still locked');
  });

  await check('800px: Tab stays inside the open sheet (focus trap)', async () => {
    await page.$eval('.foundation-clickable[data-detail^="authority:"]', el => el.click());
    for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
    expect((await panelState(page)).focusInPanel, 'focus escaped the modal sheet');
    await page.keyboard.press('Escape');
  });

  for (const tab of ['centers', 'channels', 'gates', 'planets', 'variable', 'cross']) {
    await check(`800px: every item on the ${tab} tab opens a panel`, async () => {
      await page.click(`.panel-tab[data-panel="${tab}"]`);
      await assertKeyboardReachable(page, '#chart-view');
      const n = await openEveryTrigger(page, '#panel-content');
      expect(n >= 1, 'nothing to open');
    });
  }

  await check('800px: banner, foundation and planet columns open panels', async () => {
    await openEveryTrigger(page, '#type-banner');
    await openEveryTrigger(page, '#foundation-panel');
    await page.tap('.bg-planets-personality .bg-planet-row[data-gate]:not([data-gate=""])');
    const st = await panelState(page);
    expect(/^Personality Sun$/.test(st.label), `planet column row → ${st.label}`);
    await page.keyboard.press('Escape');
  });

  await check('800px: transits — every item opens, with transit context', async () => {
    await page.$eval('.nav-link[data-view="transits"]', el => el.click());
    await page.waitForSelector('#transit-bodygraph .bodygraph-svg');
    await openEveryTrigger(page, '#transit-content');
    const sun = await page.$eval('#transit-content [data-detail^="gate:"]', el => el.dataset.detail);
    await page.$eval('#transit-content [data-detail^="gate:"]', el => el.click());
    const body = await page.textContent('#detail-panel');
    expect(/Transit Sun · \d+\.\d/.test(body) && /Birth activations/.test(body), `transit activations missing for ${sun}`);
    expect(await page.$eval(`#transit-bodygraph .bg-gate-path[data-gate="${sun.split(':')[1]}"]`, el => el.classList.contains('bg-lit')),
      'transit graph does not pin the open gate');
    await page.keyboard.press('Escape');
    // A temporarily defined center's panel must say the transit defines it.
    const temp = await page.$('#transit-content .center-card[data-detail]');
    if (temp) {
      await temp.click();
      expect(/transits at the selected time define it/.test(await page.textContent('#detail-panel')), 'temporarily defined center panel ignores the transit');
      await page.keyboard.press('Escape');
    }
    // Transit only: the panel drops the birth side, like the graph does.
    await page.click('.transit-mode-switch input[value="transit-only"] + span');
    await page.$eval('#transit-content [data-detail^="gate:"]', el => el.click());
    const only = await page.textContent('#detail-panel');
    expect(/Transit only/.test(only) && !/Birth activations/.test(only), 'transit-only panel still shows birth activations');
    await page.keyboard.press('Escape');
    await page.click('.transit-mode-switch input[value="overlay"] + span');
  });

  await check('800px: timeline — bars, row symbols and planets open the same sheet', async () => {
    await page.$eval('.nav-link[data-view="timeline"]', el => el.click());
    await page.waitForFunction(() => document.querySelector('#timeline-view .tl-table')?.getAttribute('aria-busy') === 'false', null, { timeout: 60000 });
    // A transit bar opens its item with the interval's timing.
    await page.$eval('#timeline-view .tl-bar[data-source="transit"]', el => el.click());
    await page.waitForSelector('#detail-panel.open .tl-detail-timing');
    let st = await panelState(page);
    expect(st.mode === 'sheet' && st.modal === 'true' && st.backdrop && st.title, `expected modal sheet: ${JSON.stringify(st)}`);
    expect(/Duration/.test(await page.textContent('#detail-panel .tl-detail-timing')), 'timing has no duration');
    expect(await page.$('#timeline-view .tl-bar[aria-pressed="true"]'), 'the opened bar is not marked');
    // Onward and Back keep the timeline context, timing included.
    const first = st.title;
    await page.$eval('#detail-panel .dp-body [data-detail]', el => el.click());
    st = await panelState(page);
    expect(st.back, `onward link: ${JSON.stringify(st)}`);
    await page.click('#detail-panel .dp-back');
    st = await panelState(page);
    expect(st.title === first && await page.$('#detail-panel .tl-detail-timing'), 'Back lost the item or its timing');
    await page.mouse.click(400, 40); // backdrop
    expect(!(await panelState(page)).open, 'backdrop did not close the sheet');
    expect(!(await page.$('#timeline-view .tl-bar[aria-pressed="true"]')), 'bar stayed marked after close');
    // Every row symbol opens its center, channel or gate.
    const rows = await page.$$eval('#timeline-view .tl-row-name', els => els.filter(el => el.offsetParent !== null).map(el => el.dataset.row));
    expect(rows.length > 5, `only ${rows.length} timeline rows`);
    for (const key of rows) {
      await page.$eval(`#timeline-view .tl-row-name[data-row="${key}"]`, el => el.click());
      st = await panelState(page);
      expect(st.open && st.title, `timeline row ${key} did not open a panel`);
      await page.keyboard.press('Escape');
    }
    // A transiting planet opens its gate with that planet listed.
    const planet = await page.$eval('#timeline-view .tl-planet[data-planet="sun"]', el => el.dataset.gate);
    await page.$eval('#timeline-view .tl-planet[data-planet="sun"]', el => el.click());
    st = await panelState(page);
    expect(st.label === `Gate ${planet}` && /Transit Sun/.test(await page.textContent('#detail-panel')), `sun planet → ${st.label}`);
    await page.keyboard.press('Escape');
    await page.$eval('.nav-link[data-view="chart"]', el => el.click());
  });

  await check('800px: connection — every item opens, combined chart too', async () => {
    await page.$eval('.nav-link[data-view="connection"]', el => el.click());
    const ben = await page.$eval('#conn-person', s => [...s.options].find(o => o.textContent.includes('Ben'))?.value);
    await page.selectOption('#conn-person', ben);
    await page.click('#conn-calculate');
    await page.waitForSelector('#conn-composite .bodygraph-svg');
    await page.click('.composite-individuals summary');
    await assertKeyboardReachable(page, '#connection-content');
    const n = await openEveryTrigger(page, '#connection-content');
    expect(n >= 15, `only ${n} connection items were tappable`);
    // Channels on the connection list open the pair view of that channel.
    await page.$eval('#connection-content .connection-type[data-detail]', el => el.click());
    const body = await page.textContent('#detail-panel');
    expect(/Who brings each gate/.test(body), 'pair channel view missing who-brings-what');
    await page.keyboard.press('Escape');
    // A gate on the combined graph.
    const g = await page.evaluate(() => document.querySelector('#conn-composite .bg-gate-circle:not([fill="transparent"])')?.closest('[data-gate]')?.getAttribute('data-gate'));
    await page.$eval(`#conn-composite .bg-gate[data-gate="${g}"]`, el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(/Carried by/.test(await page.textContent('#detail-panel')), 'composite gate panel');
    await page.keyboard.press('Escape');
  });

  await check('800px: team — every role, member, channel and gate opens', async () => {
    await page.$eval('.nav-link[data-view="team"]', el => el.click());
    await page.$$eval('#team-saved input[type=checkbox]', cbs => cbs.forEach(cb => { cb.checked = true; }));
    await page.click('#team-calculate');
    await page.waitForSelector('#team-content .role-card');
    await assertKeyboardReachable(page, '#team-content');
    const n = await openEveryTrigger(page, '#team-content');
    expect(n >= 10, `only ${n} team items were tappable`);
    await page.$eval('#team-content .role-card[data-detail]', el => el.click());
    await page.click('#detail-panel [data-detail^="member:"]');
    const st = await panelState(page);
    expect(st.label === 'Team member' && st.back, `role → member: ${JSON.stringify(st)}`);
    await page.keyboard.press('Escape');
  });

  await check('800px: switching views closes a panel from the old view', async () => {
    await page.$eval('#team-content .role-card[data-detail]', el => el.click());
    await page.$eval('.nav-link[data-view="chart"]', el => el.click());
    expect(!(await panelState(page)).open, 'team panel stayed open over the chart');
  });
  await ctx.close();
}

// ---------------- Desktop (keyboard, side panel) ----------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', err => { failures++; console.error(`✖ page JS error: ${err.message}`); });
  await page.goto(`${BASE}/?d=1990-06-15&t=14:30&tz=-6&n=Ada%20Test`);
  await page.waitForSelector('.bodygraph-svg');

  await check('1280px: Enter on a focused tile opens a non-modal side panel; Esc returns focus', async () => {
    await page.focus('.foundation-clickable[data-detail^="profile:"]');
    await page.keyboard.press('Enter');
    const st = await panelState(page);
    expect(st.open && st.mode === 'side' && st.modal === 'false' && !st.backdrop, `expected side panel: ${JSON.stringify(st)}`);
    expect(st.label === 'Profile' && st.focusInPanel, `profile panel: ${JSON.stringify(st)}`);
    await page.keyboard.press('Escape');
    const back = await page.evaluate(() => document.activeElement?.dataset?.detail);
    expect(/^profile:/.test(back || ''), `focus returned to ${back}`);
  });

  await check('1280px: Space on a gate row opens it; the bodygraph pins that gate', async () => {
    await page.click('.panel-tab[data-panel="gates"]');
    await page.focus('.gate-item[data-gate="34"]');
    await page.keyboard.press(' ');
    const st = await panelState(page);
    expect(st.label === 'Gate 34', `space → ${st.label}`);
    const pinned = await page.$eval('.bg-gate-path[data-gate="34"]', el => el.classList.contains('bg-lit'));
    expect(pinned, 'gate 34 not pinned on the bodygraph while its panel is open');
  });

  await check('1280px: with the side panel open, the chart stays usable beside it', async () => {
    await page.$eval('#bodygraph-container .bg-center[data-center="g"]', el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const st = await panelState(page);
    expect(/G Center/.test(st.label) && !st.back, `graph click with panel open → ${JSON.stringify(st)}`);
    // Park the mouse off the lists: a real hover over a gate row lights it by design.
    await page.mouse.move(2, 2);
    await page.keyboard.press('Escape');
    const lit = await page.$$eval('.bodygraph-svg .bg-lit', els => els.length);
    expect(lit === 0, 'pin not cleared on close');
  });

  await check('1280px: Escape in the edit dialog closes the dialog, not the panel behind it', async () => {
    await page.goto(`${BASE}/`);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/`);
    await enterManual(page, { name: 'Ada Test', date: '1990-06-15', time: '14:30', tz: -6 });
    await page.$eval('.foundation-clickable[data-detail^="type:"]', el => el.click());
    await page.selectOption('#people-switcher', '__edit');
    await page.waitForSelector('.modal #edit-name');
    await page.keyboard.press('Escape');
    expect(!(await page.$('.modal-overlay')), 'edit dialog did not close');
    expect((await panelState(page)).open, 'Escape for the dialog also closed the detail panel');
    await page.keyboard.press('Escape');
  });

  await check('1280px: timeline opens the side panel beside the tracks', async () => {
    await page.$eval('.nav-link[data-view="timeline"]', el => el.click());
    await page.waitForFunction(() => document.querySelector('#timeline-view .tl-table')?.getAttribute('aria-busy') === 'false', null, { timeout: 60000 });
    await page.$eval('#timeline-view .tl-bar[data-source="transit"]', el => el.click());
    await page.waitForSelector('#detail-panel.open .tl-detail-timing');
    const st = await panelState(page);
    expect(st.mode === 'side' && st.modal === 'false' && !st.backdrop, `expected side panel: ${JSON.stringify(st)}`);
    // Non-modal: another row opens in place, as a fresh item.
    const key = await page.$eval('#timeline-view .tl-row-name', el => el.dataset.row);
    await page.$eval(`#timeline-view .tl-row-name[data-row="${key}"]`, el => el.click());
    const next = await panelState(page);
    expect(next.open && !next.back, `row with panel open → ${JSON.stringify(next)}`);
    await page.keyboard.press('Escape');
    expect(!(await panelState(page)).open, 'Escape did not close the side panel');
    await page.$eval('.nav-link[data-view="chart"]', el => el.click());
  });

  await check('1280px: theme toggle keeps the open item pinned on the new graph', async () => {
    await page.$eval('#bodygraph-container .bg-gate[data-gate="34"]', el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.mouse.move(2, 2);
    await page.click('#theme-toggle');
    const st = await panelState(page);
    const pinned = await page.$eval('.bg-gate-path[data-gate="34"]', el => el.classList.contains('bg-lit'));
    expect(st.open && st.label === 'Gate 34' && pinned, `after theme toggle: open=${st.open} pinned=${pinned}`);
    await page.keyboard.press('Escape');
  });
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nAll detail-panel checks passed');
process.exit(failures ? 1 : 0);
