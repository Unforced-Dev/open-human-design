/** Real-browser smoke/regression test for the independent transit timeline.
 * Run against a local dev server: npm run e2e:timeline
 * Uses an isolated Chrome profile; no geocoding, saved user data, or mocks.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.E2E_URL || 'http://127.0.0.1:5173';
const chrome = process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH }
  : { channel: process.env.CHROME_CHANNEL || 'chrome' };
const entry = `${base}/?d=1990-06-15&t=14:30&tz=8&n=Timeline%20Demo&view=timeline`;
const browser = await chromium.launch({ ...chrome, headless: true });
const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB' });
const page = await desktopContext.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const tl = '#timeline-view';
const field = name => `${tl} [data-field="${name}"]`;
const action = name => `${tl} [data-action="${name}"]`;
const detail = '#gate-detail[role="dialog"][aria-modal="true"]';
const timing = `${detail} .tl-detail-timing`;
const calculatedRange = () => page.locator(`${tl} .tl-table`).evaluate(el => ({
  start: Number(el.dataset.calculatedStart), end: Number(el.dataset.calculatedEnd),
  viewStart: Number(el.dataset.start), viewEnd: Number(el.dataset.end),
  selected: Number(el.dataset.selected),
}));
const expectedLocalRange = (targetPage, days) => targetPage.evaluate(async days => {
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
const activeSourcesMatchBars = targetPage => targetPage.evaluate(() => {
  const table = document.querySelector('#timeline-view .tl-table');
  const ratio = (Number(table.dataset.selected) - Number(table.dataset.start))
    / (Number(table.dataset.end) - Number(table.dataset.start));
  const mismatch = [];
  for (const row of document.querySelectorAll('#timeline-view .tl-row')) {
    const bars = [...row.querySelectorAll('.tl-bar')];
    const trackWidth = row.querySelector('.tl-track')?.getBoundingClientRect().width || 1;
    const edges = bars.flatMap(node => {
      const left = parseFloat(node.style.left) / 100;
      return [left, left + parseFloat(node.style.width) / 100];
    });
    // The displayed bar percentages are rounded while selection is exact to a
    // second; at a transition seam, either adjacent interval may own the pixel.
    if (edges.some(edge => Math.abs(edge - ratio) * trackWidth < 2)) continue;
    const bar = bars.find(node => {
      const left = parseFloat(node.style.left) / 100;
      const right = left + parseFloat(node.style.width) / 100;
      return ratio >= left - 1e-7 && ratio < right - 1e-7;
    });
    const source = bar?.dataset.source || null;
    if ((row.dataset.activeSource || null) !== source || row.classList.contains('tl-row-active') !== Boolean(source))
      mismatch.push({ key: row.dataset.key, expected: source, actual: row.dataset.activeSource || null });
    if (source) {
      const name = getComputedStyle(row.querySelector('.tl-row-name'));
      if (source === 'both' && !name.backgroundImage.includes('repeating-linear-gradient'))
        mismatch.push({ key: row.dataset.key, source, css: name.backgroundImage });
      if (source !== 'both' && !name.boxShadow.includes('inset'))
        mismatch.push({ key: row.dataset.key, source, css: name.boxShadow });
    }
  }
  return mismatch;
});
const ready = async (timeout = 120000) => {
  await page.waitForFunction(() => document.querySelector('#timeline-view .tl-table')?.getAttribute('aria-busy') === 'false', null, { timeout });
  assert.ok(await page.locator(`${tl} .tl-bar`).count() > 0);
};
const instant = () => page.locator(`${tl} .tl-table`).evaluate(el => Number(el.dataset.selected));
const moonMatches = async targetPage => {
  await targetPage.waitForFunction(async () => {
    const selected = Number(document.querySelector('#timeline-view .tl-table')?.dataset.selected);
    const actual = document.querySelector('#timeline-view .tl-planet[data-planet="moon"] strong')?.textContent;
    const { snapshot } = await import('/src/features/transit-timeline/provider.js');
    const expected = snapshot(selected).moon;
    return actual === `${expected.gate}.${expected.line}`;
  }, null, { timeout: 10000 });
};
const run = async (name, fn) => {
  await fn();
  console.log(`✓ ${name}`);
};

try {
  await page.goto(entry);
  await page.waitForSelector(`${tl}:not(.hidden) .tl-graph .bodygraph-svg`);
  await run('entry and real calculation', async () => {
    await ready();
    assert.equal(await page.locator(`${tl} .tl-calculation`).isVisible(), false,
      'calculation progress disappears when results are ready');
    assert.ok(await page.locator(`${tl} .tl-bar`).count() > 0);
    assert.match(await page.locator(`${tl} .tl-person`).innerText(), /Timeline Demo/);
    assert.deepEqual(await page.locator(field('span')).locator('option').evaluateAll(options => options.map(option => option.value)),
      ['1', '3', '7', '28', 'year', 'past-year']);
    const range = await calculatedRange();
    assert.deepEqual([range.start, range.end], Object.values(await expectedLocalRange(page, 7)),
      'default seven days run from local midnight three days before through four days after');
    assert.deepEqual([range.viewStart, range.viewEnd], [range.start, range.end]);
  });

  await run('graph tooltips keep source colors and clear the adjacent timeline', async () => {
    await page.setViewportSize({ width: 927, height: 713 });
    const graph = `${tl} .tl-graph`;
    const gateBySource = await page.locator(`${graph} .bg-gate[aria-label]`).evaluateAll(nodes => {
      const labels = { natal: 'Birth chart', inactive: 'Inactive', transit: 'Transit only',
        both: 'Birth chart + transit' };
      return Object.fromEntries(Object.entries(labels).map(([source, label]) => [source,
        nodes.find(node => node.getAttribute('aria-label')?.endsWith(`, ${label}`))?.dataset.gate]));
    });
    for (const source of ['natal', 'inactive', 'transit', 'both']) {
      const gate = gateBySource[source];
      assert.ok(gate, `sample chart has a ${source} gate`);
      await page.locator(`${graph} .bg-gate[data-gate="${gate}"] .bg-gate-circle`).hover();
      const colors = await page.locator(`${graph} .bg-tooltip`).evaluate((tooltip, source) => {
        const swatch = document.createElement('span');
        document.body.appendChild(swatch);
        const resolved = variable => {
          swatch.style.color = `var(${variable})`;
          return getComputedStyle(swatch).color;
        };
        const label = tooltip.querySelector(`.bg-tt-source.${source}`);
        const result = { visible: tooltip.style.display === 'block',
          actual: label && getComputedStyle(label).color,
          expected: resolved(source === 'transit' ? '--transit-source-text' : '--text-secondary'),
          transitPart: label?.querySelector('.bg-tt-source-transit') &&
            getComputedStyle(label.querySelector('.bg-tt-source-transit')).color,
          expectedTransit: resolved('--transit-source-text') };
        swatch.remove();
        return result;
      }, source);
      assert.equal(colors.visible, true);
      assert.equal(colors.actual, colors.expected, `${source} tooltip source color`);
      if (source === 'both') assert.equal(colors.transitPart, colors.expectedTransit,
        'mixed tooltip keeps the birth label neutral and transit label cyan');
    }
    await page.locator(`${graph} .bg-gate[data-gate="36"] .bg-gate-circle`).hover();
    const overlap = await page.locator(`${graph} .bg-tooltip`).evaluate(tooltip => {
      const panel = document.querySelector('#timeline-view .tl-tracks-panel');
      const tip = tooltip.getBoundingClientRect();
      const target = panel.getBoundingClientRect();
      const x = (Math.max(tip.left, target.left) + Math.min(tip.right, target.right)) / 2;
      const y = (Math.max(tip.top, target.top) + Math.min(tip.bottom, target.bottom)) / 2;
      const intersects = Math.max(tip.left, target.left) < Math.min(tip.right, target.right)
        && Math.max(tip.top, target.top) < Math.min(tip.bottom, target.bottom);
      tooltip.style.pointerEvents = 'auto';
      const onTop = intersects && tooltip.contains(document.elementFromPoint(x, y));
      tooltip.style.pointerEvents = '';
      return { intersects, onTop };
    });
    assert.equal(overlap.intersects, true, 'Gate 36 tooltip crosses into the timeline at 927px');
    assert.equal(overlap.onTop, true, 'tooltip paints above the adjacent timeline');
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  await run('timeline keyboard updates the selected instant', async () => {
    const before = await instant();
    const table = page.locator(`${tl} .tl-table`);
    await table.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await instant(), before + 60000);
    await page.keyboard.press('Shift+ArrowLeft');
    assert.equal(await instant(), before - 3540000);
    await page.keyboard.press('Shift+ArrowRight');
    assert.equal(await instant(), before + 60000);
    assert.ok((await page.locator(`${tl} .tl-moment`).innerText()).length > 8);
  });

  await run('desktop track scrubs from real mouse coordinates', async () => {
    const track = page.locator(`${tl} .tl-row .tl-track`).first();
    await track.scrollIntoViewIfNeeded();
    const box = await track.boundingBox();
    assert.ok(box && box.width > 80);
    const before = await instant();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * .25, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .75, y, { steps: 8 });
    await page.mouse.up();
    assert.notEqual(await instant(), before);
    await moonMatches(page);
    await page.locator(`${tl} .tl-bar:not([data-source="natal"])`).first().click();
    assert.equal(await page.locator(`${detail}:not(.hidden) ${timing.replace(`${detail} `, '')}`).isVisible(), true);
    await page.locator(`${detail} .gate-detail-close`).click();
    assert.equal(await page.locator(detail).isVisible(), false);
  });

  await run('rapid 24h, 28d, 7d changes and leave/reenter settle on last range', async () => {
    await page.selectOption(field('span'), '1');
    await ready();
    const oneDay = await calculatedRange();
    const expected = await expectedLocalRange(page, 1);
    assert.deepEqual([oneDay.start, oneDay.end], [expected.start, expected.end],
      'one-day preset covers the selected local calendar date');
    await page.selectOption(field('span'), '28');
    await page.click('.nav-link[data-view="chart"]');
    await page.click('.nav-link[data-view="timeline"]');
    await page.selectOption(field('span'), '7');
    await ready();
    const range = await calculatedRange();
    assert.deepEqual([range.start, range.end], Object.values(await expectedLocalRange(page, 7)));
    assert.deepEqual([range.viewStart, range.viewEnd], [range.start, range.end]);
    assert.equal(await page.locator(field('span')).inputValue(), '7');
    assert.equal(await page.locator(`${tl} .tl-table`).getAttribute('aria-busy'), 'false');
  });

  await run('3-day and 28-day ranges follow local calendar boundaries', async () => {
    await page.selectOption(field('span'), '28');
    await ready();
    assert.ok(await page.locator(`${tl} .tl-bar`).count() > 0);
    let range = await calculatedRange();
    assert.deepEqual([range.start, range.end], Object.values(await expectedLocalRange(page, 28)));
    await page.selectOption(field('span'), '3');
    await ready();
    range = await calculatedRange();
    assert.deepEqual([range.start, range.end], Object.values(await expectedLocalRange(page, 3)));
    await page.selectOption(field('span'), '7');
    await ready();
  });

  await run('Now keeps the selected overall range', async () => {
    await page.click(action('now'));
    await ready();
    assert.equal(await page.locator(field('span')).inputValue(), '7');
    const range = await calculatedRange();
    assert.deepEqual([range.start, range.end], Object.values(await expectedLocalRange(page, 7)));
    const natal = page.locator(`${tl} .tl-bar[data-source="natal"]`).first();
    await natal.click();
    assert.equal(await page.locator(timing).count(), 0, 'natal detail has no transit timing');
    await page.keyboard.press('Escape');
    const transit = page.locator(`${tl} .tl-bar:not([data-source="natal"])`).first();
    const key = await transit.getAttribute('data-key');
    const interval = await transit.getAttribute('data-interval');
    await transit.click();
    const duration = await page.locator(`${timing} .tl-timing-duration dd`).innerText();
    await page.keyboard.press('Escape');
    await page.locator(`${tl} .tl-table`).focus();
    await page.keyboard.press('=');
    const zoomed = await calculatedRange();
    assert.ok(zoomed.viewEnd - zoomed.viewStart < range.end - range.start);
    assert.deepEqual([zoomed.start, zoomed.end], [range.start, range.end]);
    assert.equal(await page.locator(field('span')).inputValue(), '7');
    await page.locator(`${tl} .tl-bar[data-key="${key}"][data-interval="${interval}"]`).click();
    assert.equal(await page.locator(`${timing} .tl-timing-duration dd`).innerText(), duration,
      'interval duration remains tied to the overall range while zooming');
    await page.keyboard.press('Escape');
    await page.selectOption(field('span'), '7');
    await ready();
  });

  await run('mode and filters alter rendered rows without errors', async () => {
    await page.selectOption(field('mode'), 'transit-only');
    await ready();
    await page.locator(`${tl} .tl-legend-disclosure summary`).click();
    assert.equal(await page.locator(`${tl} .tl-legend [data-source="natal"]`).isVisible(), false);
    await page.selectOption(field('kind'), 'gate');
    assert.equal(await page.locator(`${tl} .tl-row:not([data-key^="gate:"])`).count(), 0);
    await page.fill(field('search'), 'gate 1');
    await page.locator(field('changes')).click();
    assert.equal(await page.locator(field('changes')).getAttribute('aria-pressed'), 'true');
    await page.fill(field('search'), '');
    await page.locator(field('changes')).click();
    assert.equal(await page.locator(field('changes')).getAttribute('aria-pressed'), 'false');
    await page.selectOption(field('kind'), 'all');
    await page.selectOption(field('mode'), 'overlay');
    await ready();
    assert.deepEqual(await activeSourcesMatchBars(page), [], 'source marks match active intervals after filtering');
    const ruler = await page.locator(`${tl} .tl-ticks`).boundingBox();
    await page.mouse.move(ruler.x + ruler.width / 2, ruler.y + ruler.height / 2);
    await page.mouse.wheel(40, 0);
    assert.deepEqual(await activeSourcesMatchBars(page), [], 'source marks follow the selected time after panning');
  });

  await run('single detail sheet shows interval timing and follows navigation', async () => {
    const bar = page.locator(`${tl} .tl-bar:not([data-source="natal"])`).first();
    const source = await bar.getAttribute('data-source');
    const key = await bar.getAttribute('data-key');
    await bar.click();
    assert.equal(await page.locator(`${detail}:not(.hidden) .gate-detail-card`).isVisible(), true);
    assert.equal(await page.locator(`${tl} .tl-interval-detail`).count(), 0);
    assert.equal(await page.locator(`${timing} .tl-timing-values dd`).count(), 3);
    assert.match(await page.locator(timing).innerText(), /开始|结束|持续|Start|End|Duration/);
    assert.equal(await page.locator(detail).getAttribute('aria-modal'), 'true');
    assert.equal(await page.locator(`${tl} .tl-row[data-key="${key}"]`).getAttribute('data-active-source'), source);
    assert.deepEqual(await activeSourcesMatchBars(page), [], 'source marks match interval at selected time');
    assert.equal(await bar.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => {
      const body = getComputedStyle(document.body).overflow;
      const html = getComputedStyle(document.documentElement).overflow;
      return body === 'hidden' || html === 'hidden';
    }), true, 'opening timing locks page scroll');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator(detail).isVisible(), false);
    assert.equal(await bar.evaluate(el => document.activeElement === el), true, 'Escape returns focus to the bar');
    assert.equal(await bar.getAttribute('aria-pressed'), null);
    assert.equal(await page.evaluate(() => {
      const body = getComputedStyle(document.body).overflow;
      const html = getComputedStyle(document.documentElement).overflow;
      return body === 'hidden' || html === 'hidden';
    }), false, 'closing timing restores page scroll');
    await bar.click();
    await page.locator(`${detail} .gate-detail-close`).click();
    assert.equal(await page.locator(detail).isVisible(), false);
    assert.equal(await bar.evaluate(el => document.activeElement === el), true, 'close returns focus to the bar');
    await bar.click();
    const dialogBox = await page.locator(detail).boundingBox();
    const cardBox = await page.locator(`${detail} .gate-detail-card`).boundingBox();
    assert.ok(dialogBox && cardBox);
    await page.mouse.click(dialogBox.x + 5, dialogBox.y + 5);
    assert.equal(await page.locator(detail).isVisible(), false, 'backdrop closes timing');
    assert.equal(await bar.evaluate(el => document.activeElement === el), true, 'backdrop returns focus to the bar');
    await bar.click();
    assert.equal(await page.locator('.gate-detail:not(.hidden)').count(), 1, 'only one detail dialog is open');
    await page.keyboard.press('Escape');
    assert.equal(await bar.getAttribute('aria-pressed'), null);
  });

  await run('gate to channel and Back keep the selected detail', async () => {
    const channelBar = page.locator(`${tl} .tl-bar[data-key^="channel:"]:not([data-source="natal"])`).first();
    assert.ok(await channelBar.count() > 0, 'calculation has a non-natal channel interval');
    const channel = (await channelBar.getAttribute('data-key')).slice('channel:'.length);
    const gate = channel.split('-')[0];
    await channelBar.click();
    await page.keyboard.press('Escape');
    await page.locator(`${tl} .tl-row[data-key="gate:${gate}"] .tl-row-name`).click();
    assert.match(await page.locator(`${detail} .tl-detail-heading .detail-label`).innerText(), new RegExp(`(?:Gate ${gate}|第 ${gate} 闸门)`, 'i'));
    const fromGate = await page.locator(timing).count();
    await page.locator(`${detail} [data-channel="${channel}"]`).click();
    assert.equal(await page.locator(`${timing}[data-kind="channel"][data-id="${channel}"]`).count(), 1);
    await page.locator(`${detail} .gate-detail-back`).click();
    assert.match(await page.locator(`${detail} .tl-detail-heading .detail-label`).innerText(), new RegExp(`(?:Gate ${gate}|第 ${gate} 闸门)`, 'i'));
    assert.equal(await page.locator(timing).count(), fromGate, 'Back restores the gate timing state');
    await page.keyboard.press('Escape');
  });

  await run('shared gate keeps full birth and transit activations below one compact header', async () => {
    const gates = await page.evaluate(() => {
      const value = node => node.querySelector('.bg-planet-act')?.textContent.trim().split('.')[0];
      const birth = [...document.querySelectorAll('#timeline-view .tl-birth-value[data-side]')].map(node => ({
        gate: value(node), side: node.dataset.side, planet: node.dataset.birthPlanet,
        activation: node.querySelector('.bg-planet-act')?.textContent.trim() }));
      const transit = [...document.querySelectorAll('#timeline-view .tl-planet[data-planet]')].map(node => ({
        gate: value(node), side: 'transit', planet: node.dataset.planet,
        activation: node.querySelector('.bg-planet-act')?.textContent.trim() }));
      const natal = new Set(birth.map(row => row.gate));
      const sky = new Set(transit.map(row => row.gate));
      const shared = [...sky].find(gate => natal.has(gate));
      const birthOnly = [...natal].find(gate => !sky.has(gate));
      return { shared, birthOnly, birth, transit };
    });
    assert.ok(gates.shared && gates.birthOnly, 'selected moment has shared and natal-only gates');
    await page.locator(`${tl} .tl-row[data-key="gate:${gates.shared}"] .tl-row-name`).click();
    const grouped = await page.locator(detail).evaluate(node => {
      const header = node.querySelector('.tl-detail-header');
      const heading = node.querySelector('.tl-detail-heading');
      const statuses = heading?.querySelector('.tl-detail-statuses');
      const sources = node.querySelector('.tl-detail-activations');
      const timing = header?.querySelector('.tl-detail-timing');
      const rows = [...(sources?.querySelectorAll('.tl-activation-row') || [])];
      return { headingContainsIdentity: !!heading?.querySelector('.detail-label') && !!heading?.querySelector('.detail-name'),
        headerOnlyStatuses: !!statuses && statuses.querySelectorAll('.tl-activation-label').length === 2
          && heading.querySelectorAll('.tl-activation-row').length === 0,
        sourcesFollowHeader: header?.nextElementSibling === sources,
        birthGroups: sources?.querySelectorAll('.gate-detail-acts').length,
        transitGroups: sources?.querySelectorAll('.gate-detail-transits').length,
        rows: rows.map(row => ({ side: row.dataset.activationSide, planet: row.dataset.activationPlanet,
          activation: row.dataset.activationValue, text: row.textContent.trim(),
          weight: getComputedStyle(row).fontWeight })),
        groupGap: getComputedStyle(sources).rowGap,
        headingBeforeTiming: !!heading && !!node.querySelector('.tl-detail-timing')
          && Boolean(heading.compareDocumentPosition(timing) & Node.DOCUMENT_POSITION_FOLLOWING),
        statusBottom: statuses?.getBoundingClientRect().bottom,
        timingBottom: timing?.getBoundingClientRect().bottom };
    });
    const expected = [...gates.birth.filter(row => row.gate === gates.shared && row.side === 'design'),
      ...gates.birth.filter(row => row.gate === gates.shared && row.side === 'personality'),
      ...gates.transit.filter(row => row.gate === gates.shared)];
    assert.equal(grouped.headingContainsIdentity, true);
    assert.equal(grouped.headerOnlyStatuses, true, 'header left column holds consecutive source labels only');
    assert.equal(grouped.sourcesFollowHeader, true, 'full planet rows start immediately below the header');
    assert.deepEqual([grouped.birthGroups, grouped.transitGroups], [1, 1]);
    assert.deepEqual(grouped.rows.map(({ side, planet, activation }) => ({ side, planet, activation })),
      expected.map(({ side, planet, activation }) => ({ side, planet, activation })),
      'birth planets precede transit planets, with each activation listed once');
    for (const row of grouped.rows) {
      const sideName = { design: 'Design', personality: 'Personality', transit: 'Transit' }[row.side];
      assert.ok(row.text.includes(row.activation) && row.text.includes(sideName)
        && new RegExp(`${sideName} \\S+`).test(row.text) && /Line [1-6][,、]\s*the \S+/i.test(row.text),
        `complete side/planet/gate.line/line archetype text survives: ${row.text}`);
    }
    assert.equal(new Set(grouped.rows.map(row => row.weight)).size, 1, 'natal and transit rows use one font weight');
    assert.equal(grouped.groupGap, '0px', 'natal and transit rows are one continuous list');
    assert.equal(grouped.headingBeforeTiming, true, 'compact time panel follows the left heading');
    assert.ok(Math.abs(grouped.statusBottom - grouped.timingBottom) < 12,
      'status labels sit opposite the bottom of the timing panel');
    await page.keyboard.press('Escape');

    await page.locator(`${tl} .tl-row[data-key="gate:${gates.birthOnly}"] .tl-row-name`).click();
    assert.equal(await page.locator(`${detail} .tl-detail-heading .gate-detail-transits`).count(), 0,
      'unactivated transit has no empty separate block');
    assert.equal(await page.locator(timing).count(), 0, 'natal-only gate has no timing panel');
    await page.keyboard.press('Escape');
  });

  await run('timezone change preserves the instant; DST gap and fold are explicit', async () => {
    const ruler = await page.locator(`${tl} .tl-ticks`).boundingBox();
    await page.mouse.click(ruler.x + ruler.width / 2, ruler.y + ruler.height / 2);
    await page.locator(field('span')).dispatchEvent('change');
    await ready();
    const before = await instant();
    await page.selectOption(field('zone'), 'America/New_York');
    await ready();
    assert.equal(await instant(), before);
    let range = await calculatedRange();
    assert.deepEqual([range.start, range.end], Object.values(await expectedLocalRange(page, 7)),
      'timezone change realigns seven full local days');
    await page.fill(field('date'), '2026-03-08');
    await page.fill(field('time'), '12:30:00');
    await ready();
    range = await calculatedRange();
    assert.deepEqual([range.start, range.end], Object.values(await expectedLocalRange(page, 7)),
      'explicit date keeps local-midnight boundaries through spring DST');
    await page.fill(field('time'), '02:30:00');
    assert.match(await page.locator(`${tl} .tl-time-error`).innerText(), /does not exist|不存在/);
    await page.fill(field('date'), '2026-11-01');
    await page.fill(field('time'), '01:30:00');
    assert.equal(await page.locator(`${tl} .tl-fold`).isVisible(), true);
    assert.equal(await page.locator(`${field('fold')} option`).count(), 3);
    const choices = await page.locator(`${field('fold')} option`).evaluateAll(els => els.slice(1).map(el => Number(el.value)));
    assert.equal(Math.abs(choices[1] - choices[0]), 3600000);
    await page.selectOption(field('fold'), String(choices[1]));
    assert.equal(await instant(), choices[1]);
    assert.equal(await page.locator(`${tl} .tl-fold`).isVisible(), false);
  });

  await run('original four views still navigate', async () => {
    for (const view of ['chart', 'transits', 'connection', 'team']) {
      await page.click(`.nav-link[data-view="${view}"]`);
      assert.equal(await page.locator(`#${view}-view`).isVisible(), true, view);
    }
    await page.click('.nav-link[data-view="timeline"]');
    assert.equal(await page.locator(tl).isVisible(), true);
  });

  await run('saved-person switch recalculates chart identity', async () => {
    // The URL chart is deliberately unsaved; create two local test profiles via UI.
    for (const [name, date] of [['Timeline A', '1990-06-15'], ['Timeline B', '1988-09-03']]) {
      await page.selectOption('#people-switcher', '__new');
      await page.fill('#birth-name', name);
      await page.fill('#birth-date', date);
      await page.fill('#birth-time', '14:30');
      if (!await page.locator('#manual-tz').isVisible()) await page.click('#manual-tz-toggle');
      await page.fill('#manual-tz', '8');
      await page.click('#birth-form button[type="submit"]');
      await page.waitForSelector('#chart-view:not(.hidden)');
    }
    const options = await page.locator('#people-switcher option').evaluateAll(els => els.map(el => ({ value: el.value, text: el.textContent })));
    const first = options.find(option => option.text.includes('Timeline A'));
    assert.ok(first, 'first saved person is available');
    await page.click('.nav-link[data-view="timeline"]');
    await ready();
    await page.selectOption('#people-switcher', first.value);
    await page.click('.nav-link[data-view="timeline"]');
    await ready();
    assert.match(await page.locator(`${tl} .tl-person`).innerText(), /Timeline A/);
  });

  await run('mobile touch scrub, vertical table scroll, graph visibility and width', async () => {
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const mobile = await mobileContext.newPage();
    mobile.on('pageerror', error => errors.push(`mobile: ${error.message}`));
    const cdp = await mobileContext.newCDPSession(mobile);
    const touchSwipe = async (x1, y1, x2, y2) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1, id: 1 }] });
      for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / 8, y: y1 + (y2 - y1) * i / 8, id: 1 }] });
        await mobile.waitForTimeout(20);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await mobile.waitForTimeout(150);
    };
    try {
      await mobile.goto(entry);
      await mobile.waitForSelector(`${tl}:not(.hidden) .tl-graph .bodygraph-svg`);
      await mobile.waitForFunction(() => document.querySelector('#timeline-view .tl-table')?.getAttribute('aria-busy') === 'false');
      assert.equal(await mobile.locator(`${tl} .tl-legend-disclosure`).getAttribute('open'), null);
      await mobile.locator(`${tl} .tl-table`).scrollIntoViewIfNeeded();
      // Pick a row that is actually exposed in the viewport, as a user would.
      const target = await mobile.evaluate(() => {
        const table = document.querySelector('#timeline-view .tl-table');
        const rect = table.getBoundingClientRect();
        const x = rect.left + rect.width * .6;
        for (let y = Math.max(rect.top + 15, 0); y < Math.min(rect.bottom - 15, innerHeight - 15); y += 12) {
          if (document.elementFromPoint(x, y)?.closest('.tl-row .tl-track')) return { x, y, width: rect.width };
        }
        return null;
      });
      assert.ok(target && target.width > 80, 'mobile timeline track has an uncovered touch target');
      const before = Number(await mobile.locator(`${tl} .tl-table`).getAttribute('data-selected'));
      await touchSwipe(target.x - target.width * .2, target.y, target.x + target.width * .2, target.y);
      const after = Number(await mobile.locator(`${tl} .tl-table`).getAttribute('data-selected'));
      assert.notEqual(after, before, 'touch dragging changed the selected instant');
      await moonMatches(mobile);
      await mobile.locator(`${tl} .tl-bar:not([data-source="natal"])`).first().click();
      assert.equal(await mobile.locator(`${detail}:not(.hidden) ${timing.replace(`${detail} `, '')}`).isVisible(), true,
        'bar click opens the same detail sheet after dragging');
      assert.equal(await mobile.locator(`${timing} .tl-timing-values dd`).count(), 3);
      const mobileOverflow = await mobile.locator(detail).evaluate(node => {
        const timing = node.querySelector('.tl-detail-timing').getBoundingClientRect();
        const heading = node.querySelector('.tl-detail-heading').getBoundingClientRect();
        return timing.left >= -1 && timing.right <= innerWidth + 1
          && heading.left >= -1 && heading.right <= innerWidth + 1;
      });
      assert.equal(mobileOverflow, true, 'mobile interval timing fits the viewport');
      await mobile.locator(`${detail} .gate-detail-close`).click();
      const graphVisible = await mobile.locator(`${tl} .tl-graph`).evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.bottom > 66 && r.top < innerHeight && r.width > 0;
      });
      assert.equal(graphVisible, true, 'graph is visible in the mobile viewport while using timeline');
      const table = mobile.locator(`${tl} .tl-table`);
      const tableBox = await table.boundingBox();
      assert.ok(tableBox);
      const maxScroll = await table.evaluate(el => el.scrollHeight - el.clientHeight);
      assert.ok(maxScroll > 100, 'table has vertical scrollable content');
      await table.evaluate(el => { el.scrollTop = 0; });
      const startY = Math.min(tableBox.y + tableBox.height - 30, 844 - 40);
      const endY = startY - 170;
      const startX = tableBox.x + 40;
      const hit = await mobile.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.tl-table') != null, { x: startX, y: startY });
      assert.equal(hit, true, 'vertical scroll starts on uncovered table');
      await touchSwipe(startX, startY, startX, endY);
      assert.ok(await table.evaluate(el => el.scrollTop) > 0, 'vertical touch scroll moves the table');
      const overflow = await mobile.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      assert.ok(overflow.html <= overflow.width + 1 && overflow.body <= overflow.width + 1, `horizontal overflow: ${JSON.stringify(overflow)}`);
    } finally {
      await mobileContext.close();
    }
  });

  await run('852px and 927px layouts keep compact sticky header inside viewport', async () => {
    for (const width of [852, 927]) {
      await page.setViewportSize({ width, height: 800 });
      const layout = await page.evaluate(() => {
        const table = document.querySelector('#timeline-view .tl-table');
        const header = table.querySelector('.tl-panel-header');
        const fields = ['kind', 'search', 'span', 'changes'].map(name => header.querySelector(`[data-field="${name}"]`));
        const rects = fields.map(field => field.getBoundingClientRect());
        return { width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth,
          headerHeight: header.getBoundingClientRect().height, sticky: getComputedStyle(header).position === 'sticky',
          right: Math.max(...rects.map(rect => rect.right)),
          rowSpread: Math.max(...rects.slice(1).map(rect => rect.top)) - Math.min(...rects.slice(1).map(rect => rect.top)),
          removedButtons: document.querySelectorAll('#timeline-view [data-action="earlier"], #timeline-view [data-action="later"], #timeline-view [data-action="zoom-in"], #timeline-view [data-action="zoom-out"], #timeline-view [data-action="previous"], #timeline-view [data-action="next"]').length };
      });
      assert.ok(layout.html <= width + 1 && layout.body <= width + 1
        && layout.right <= width + 1 && layout.headerHeight <= 60 && layout.sticky
        && layout.rowSpread < 12 && layout.removedButtons === 0,
      `${width}px header layout: ${JSON.stringify(layout)}`);
    }
  });

  if (!process.env.SKIP_TIMELINE_YEAR) await run('future and past year calculate local anniversaries with monthly ruler and detail', async () => {
    await page.setViewportSize({ width: 927, height: 800 });
    await page.selectOption(field('zone'), 'America/New_York');
    await page.fill(field('date'), '2025-03-15');
    await page.fill(field('time'), '12:00:00');
    await ready();
    const expected = await page.evaluate(async () => {
      const { transitInstants } = await import('/src/lib/transit-time.js');
      const at = date => transitInstants(date, '12:00:00', 'America/New_York')[0].instant;
      return { past: at('2024-03-15'), selected: at('2025-03-15'), future: at('2026-03-15') };
    });
    assert.equal(await instant(), expected.selected);
    for (const [preset, start, end] of [
      ['year', expected.selected, expected.future],
      ['past-year', expected.past, expected.selected + 1000],
    ]) {
      assert.equal(await instant(), expected.selected, `${preset} starts from the same selected moment`);
      await page.selectOption(field('span'), preset);
      await ready(180000);
      const range = await calculatedRange();
      assert.deepEqual([range.start, range.end], [start, end], `${preset} uses local anniversaries`);
      assert.deepEqual([range.viewStart, range.viewEnd], [start, end], `${preset} initially shows its full calculation`);
      assert.equal(await page.locator(field('span')).inputValue(), preset);
      const cells = await page.locator(`${tl} .tl-date-cell[data-date]`).evaluateAll(nodes => nodes.map(node => node.dataset.date));
      assert.ok(cells.length >= 12 && cells.length <= 13 && cells.every(date => /-01$/.test(date)),
        `${preset} ruler uses monthly cells: ${JSON.stringify(cells)}`);
      assert.ok(await page.locator(`${tl} .tl-bar`).count() > 0, `${preset} has calculated intervals`);
      await page.locator(`${tl} .tl-bar[data-source="natal"]`).first().click();
      assert.equal(await page.locator(timing).count(), 0, 'year-long natal activation has no transit timing');
      assert.equal(await instant(), expected.selected, 'opening a full-range natal interval keeps the anchor');
      await page.keyboard.press('Escape');
      await page.locator(`${tl} .tl-table`).focus();
      await page.keyboard.press('=');
      const zoomed = await calculatedRange();
      assert.ok(zoomed.viewEnd - zoomed.viewStart < end - start, `${preset} viewport zooms within the year`);
      assert.deepEqual([zoomed.start, zoomed.end], [start, end], `${preset} zoom leaves the calculation fixed`);
      assert.equal(await page.locator(field('span')).inputValue(), preset, 'viewport zoom leaves preset selected');
    }
  });

  assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
  console.log('Timeline browser checks passed.');
} finally {
  await browser.close();
}
