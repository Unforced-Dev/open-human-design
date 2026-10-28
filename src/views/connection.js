/**
 * Connection view — how two designs interact. Person A is the current
 * chart; Person B comes from saved people or a quick manual entry.
 */

import { compareHumanDesign, CHANNELS } from 'natalengine';
import { renderBodygraph } from '../bodygraph.js';
import { computeChart } from '../lib/chartdata.js';
import { listPeople, birthFromPerson, getSharedGuest } from '../lib/people.js';
import { createPlaceSearch } from '../lib/placesearch.js';
import { esc } from '../lib/format.js';
import { getCurrentChart } from './chart.js';
import { dt, dl, channelKeyOf, conditioningOf } from '../lib/details.js';
import { pairModel } from '../lib/pair.js';
import { CONNECTION_TYPES } from '../lib/glossary.js';
import { registerScope, openDetail, closeDetail, refreshDetail } from '../detail-panel.js';

let placeB = null;
let pairCtx = null;  // { a, b, nameA, nameB, comparison, model } of the comparison on screen
let compositeApi = null;

registerScope('pair', {
  context: () => pairCtx,
  onShow: (_entry, result) => compositeApi?.setPinned?.(result.pin || null),
  onClose: () => compositeApi?.setPinned?.(null)
});
let lastComparison = null;

export function rerenderConnectionGraphs() {
  if (lastComparison && lastComparison[1] === getCurrentChart()) {
    renderConnectionContent(...lastComparison, { keepPanel: true });
  }
}

export function setupConnectionView() {
  document.getElementById('conn-calculate').addEventListener('click', runComparison);
  placeB = createPlaceSearch(document.getElementById('conn-place'), {
    placeholder: 'Birth place (resolves the timezone)',
    getDateTime: () => ({
      date: document.getElementById('conn-date').value,
      time: document.getElementById('conn-time').value
    })
  });
}

/** Refresh the saved-people picker each time the view opens. */
export function renderConnectionView() {
  const select = document.getElementById('conn-person');
  const people = listPeople();
  const current = getCurrentChart();
  const options = people
    .filter(p => p.id !== current?.birth?.id)
    .map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
    .join('');
  // A chart they arrived at via a share link stays comparable (P1-11).
  const guest = getSharedGuest();
  const guestOpt = guest?.name && guest?.birthDate && guest.id !== current?.birth?.id
    ? `<option value="__guest">${esc(guest.name)} (shared chart)</option>` : '';
  select.innerHTML = `<option value="">— enter birth data below —</option>${guestOpt}${options}`;
  select.onchange = () => {
    document.getElementById('conn-manual').classList.toggle('hidden', !!select.value);
  };
}

/** Dyad loop: select the shared/invited person and run the comparison. */
export function compareWithGuest() {
  renderConnectionView();
  const select = document.getElementById('conn-person');
  if (!select || ![...select.options].some(o => o.value === '__guest')) return;
  select.value = '__guest';
  document.getElementById('conn-manual')?.classList.add('hidden');
  runComparison();
}

function runComparison() {
  const current = getCurrentChart();
  if (!current) return;

  const select = document.getElementById('conn-person');
  let birthB = null;

  if (select.value === '__guest') {
    birthB = getSharedGuest();
  } else if (select.value) {
    const person = listPeople().find(p => p.id === select.value);
    if (person) birthB = birthFromPerson(person);
  } else {
    const date = document.getElementById('conn-date').value;
    if (!date) return;
    const time = document.getElementById('conn-time').value || '12:00';
    const loc = placeB?.getBirthLocation(date, time);
    if (!loc) { placeB?.flagMissing(); return; } // no silent UTC=0
    birthB = {
      name: document.getElementById('conn-name').value.trim() || 'Person B',
      birthDate: date,
      birthTime: time,
      timezone: loc.timezone,
      location: loc.lat != null ? loc : null
    };
  }
  if (!birthB) return;

  const b = computeChart(birthB);
  const comparison = compareHumanDesign(current.chart, b.chart);
  renderConnectionContent(comparison, current, b);
}

// Person colors for the combined chart (theme-aware): teal = A, coral = B,
// gold = a channel/center the two only complete together.
function compositePalette() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return dark
    ? { a: '#3db5a5', b: '#e8927a', bridged: '#cda64a' }
    : { a: '#2a9d8f', b: '#e07a5f', bridged: '#d4a23a' };
}


const CHANNEL_BY_NAME = Object.fromEntries(CHANNELS.map(ch => [ch.name, ch]));

function renderConnectionContent(comparison, a, b, { keepPanel = false } = {}) {
  lastComparison = [comparison, a, b];
  const container = document.getElementById('connection-content');
  container.dataset.detailScope = 'pair';
  if (!keepPanel) closeDetail(); // a panel from the previous comparison would be stale
  const cc = comparison.connectionChart;
  const nameA = a.birth.name || 'You';
  const nameB = b.birth.name || 'Person B';
  const ti = comparison.typeInteraction;
  const ad = comparison.authorityDynamic;
  const ph = comparison.profileHarmony;
  const br = comparison.bridging;
  const stats = comparison.stats || {};
  const model = pairModel(a.chart, b.chart);
  pairCtx = { a, b, nameA, nameB, comparison, model };

  const circuitBadge = (c) => c ? `<span class="circuit-badge ${esc(c)}">${esc(c)}</span>` : '';

  const connSection = ([key, t]) => {
    const items = cc.connections[key] || [];
    return `
      <div class="conn-section">
        <div class="conn-section-head">${dl('conntype', key, t.label, 'panel-title conn-type-link')}<span class="conn-count">${items.length}</span></div>
        <p class="panel-intro">${t.text}</p>
        ${items.length ? items.map(c => `
          <div class="connection-type" style="border-left:3px solid ${t.color}" ${dt('channel', channelKeyOf(c.gates))}>
            <div class="conn-channel">${esc(c.channel)} <span class="conn-gates">(${c.gates.join('–')})</span> ${circuitBadge(c.circuit)}</div>
            <div class="conn-desc">${esc(c.description)}</div>
          </div>`).join('')
        : `<div class="conn-empty">No ${t.label.toLowerCase()} channels between you.</div>`}
      </div>`;
  };

  // Center conditioning map — who steadily influences whom.
  const cd = comparison.centerDynamics || [];
  const conditioning = conditioningOf(comparison, nameA, nameB).map(c =>
    `<div class="conn-center" ${dt('center', c.center)}><strong>${esc(c.centerName)}</strong> — ${esc(c.from)} conditions ${esc(c.to)} <span class="conn-center-theme">${esc(c.theme)}</span></div>`);
  const centerLinks = (dyn) => cd.filter(c => c.dynamic === dyn).map(c => dl('center', c.center, esc(c.centerName), 'inline-link'));
  const bothDefined = centerLinks('Both Defined');
  const bothOpen = centerLinks('Both Open');

  const cpal = compositePalette();

  container.innerHTML = `
    <div class="composite-wrap">
      <div class="panel-title">Your charts combined</div>
      <p class="panel-intro">One body, both of you — each half-channel colored by who brings it. A <strong>two-tone</strong> channel is an electromagnetic bond you only complete together. Tap any gate, channel, center or item below to learn more.</p>
      <div class="composite-legend">
        <button type="button" class="lg" ${dt('person', 'a')}><i style="background:${cpal.a}"></i>${esc(nameA)}</button>
        <button type="button" class="lg" ${dt('person', 'b')}><i style="background:${cpal.b}"></i>${esc(nameB)}</button>
        <button type="button" class="lg" ${dt('conntype', 'companionship')}><i class="lg-stripe" style="background:linear-gradient(45deg, ${cpal.a} 0 50%, ${cpal.b} 50% 100%)"></i>Both have it</button>
        <button type="button" class="lg" ${dt('conntype', 'electromagnetic')}><i style="background:${cpal.bridged}"></i>Made together</button>
      </div>
      <div id="conn-composite" class="composite-graph"></div>
    </div>

    <details class="composite-individuals">
      <summary>See each chart on its own</summary>
      <div class="connection-graphs">
        <div class="connection-graph" ${dt('person', 'a')}>
          <div class="connection-graph-name">${esc(nameA)}</div>
          <div class="connection-graph-type">${esc(a.chart.type.name)} ${esc(a.chart.profile.numbers)}</div>
          <div id="conn-graph-a"></div>
        </div>
        <div class="connection-graph" ${dt('person', 'b')}>
          <div class="connection-graph-name">${esc(nameB)}</div>
          <div class="connection-graph-type">${esc(b.chart.type.name)} ${esc(b.chart.profile.numbers)}</div>
          <div id="conn-graph-b"></div>
        </div>
      </div>
    </details>

    <div class="conn-dynamic" ${dt('pairtypes', '-')}>
      <div class="panel-title">${esc(ti.dynamic)}</div>
      <div class="conn-dynamic-sub">${esc(ti.typeA)} + ${esc(ti.typeB)}</div>
      <p><strong>Gifts</strong> · ${esc(ti.gifts)}</p>
      <p><strong>Challenge</strong> · ${esc(ti.challenges)}</p>
      <p><strong>Make it work</strong> · ${esc(ti.tips)}</p>
    </div>

    <div class="foundation-grid" style="margin-bottom:8px">
      <div class="foundation-item foundation-clickable" ${dt('composite', '-')}><div class="label">Together you are</div><div class="value">${esc(cc.compositeType)}</div><div class="detail">${cc.compositeChannelCount} channels combined</div></div>
      <div class="foundation-item foundation-clickable" ${dt('conntype', 'electromagnetic')}><div class="label">Attraction</div><div class="value">${stats.electromagneticCount ?? cc.connections.electromagnetic.length}</div><div class="detail">electromagnetic links</div></div>
      <div class="foundation-item foundation-clickable" ${dt('conditioning', '-')}><div class="label">Conditioning</div><div class="value">${stats.conditioningCenters ?? conditioning.length}</div><div class="detail">centers one shapes in the other</div></div>
    </div>

    <div class="conn-card" ${dt('pairauthority', '-')}>
      <div class="panel-title">How you decide together</div>
      <p class="panel-intro">${esc(ad.authorityA)} + ${esc(ad.authorityB)} — ${esc(ad.description)} ${ad.timing ? `<em>Timing: ${esc(ad.timing)}.</em>` : ''}</p>
    </div>

    <div class="conn-card" ${dt('pairprofiles', '-')}>
      <div class="panel-title">Profiles</div>
      <p class="panel-intro">${esc(ph.nameA)} (${esc(ph.profileA)}) + ${esc(ph.nameB)} (${esc(ph.profileB)}) — ${esc(ph.description)}</p>
    </div>

    <div class="panel-title" style="margin-top:22px">The four ways your channels connect</div>
    ${Object.entries(CONNECTION_TYPES).map(connSection).join('')}

    <div class="panel-title" style="margin-top:22px">Your centers together</div>
    <p class="panel-intro">Where one of you is defined and the other open, the defined person steadily conditions the open one — a consistent, often unspoken influence.</p>
    ${conditioning.length ? conditioning.join('') : '<div class="conn-empty">Neither of you conditions the other’s centers — an unusually independent pairing.</div>'}
    ${bothDefined.length ? `<p class="conn-note"><strong>Both defined:</strong> ${bothDefined.join(', ')} — consistent, fixed common ground.</p>` : ''}
    ${bothOpen.length ? `<p class="conn-note"><strong>Both open:</strong> ${bothOpen.join(', ')} — you amplify each other (and the room) here; watch for shared not-self patterns.</p>` : ''}

    ${br?.bridgedChannels?.length ? `
      <div class="panel-title" style="margin-top:22px">What you create together</div>
      <p class="panel-intro">${esc(br.description)}</p>
      <div class="pills">${br.bridgedChannels.map(c => {
        const ch = CHANNEL_BY_NAME[c.channel];
        return ch ? dl('channel', channelKeyOf(ch.gates), `${esc(c.channel)} · ${esc(c.theme)}`, 'pill')
          : `<span class="pill">${esc(c.channel)} · ${esc(c.theme)}</span>`;
      }).join('')}</div>` : ''}

    <div class="panel-title" style="margin-top:22px">In a nutshell</div>
    <p>${esc(comparison.summary)}</p>
  `;

  // The hero: one combined bodygraph, colored by who brings each gate.
  compositeApi = renderBodygraph(container.querySelector('#conn-composite'), a.chart, {
    composite: {
      chartA: a.chart, chartB: b.chart,
      colorA: cpal.a, colorB: cpal.b, colorBridged: cpal.bridged,
      labelA: nameA, labelB: nameB
    },
    onGateClick: (g) => openDetail('pair', 'gate', g),
    onCenterClick: (key) => openDetail('pair', 'center', key)
  });

  renderBodygraph(container.querySelector('#conn-graph-a'), a.chart, { compact: true });
  renderBodygraph(container.querySelector('#conn-graph-b'), b.chart, { compact: true });
  if (keepPanel) refreshDetail('pair'); // re-pin the open item on the new graph
}
