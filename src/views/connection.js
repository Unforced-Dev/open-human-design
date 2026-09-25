/**
 * Connection view — how two designs interact. Person A is the current
 * chart; Person B comes from saved people or a quick manual entry.
 */

import { openDetailDialog, closeDetailDialog } from '../lib/detail-dialog.js';
import { compareHumanDesign, GATES, CHANNELS } from 'natalengine';
import { renderBodygraph } from '../bodygraph.js';
import { computeChart } from '../lib/chartdata.js';
import { listPeople, birthFromPerson, getSharedGuest } from '../lib/people.js';
import { createPlaceSearch } from '../lib/placesearch.js';
import { esc } from '../lib/format.js';
import { typeName, authorityName, centerName, graphCenter, gateName, channelName, circuitName, profileName } from '../lib/vocabulary.js';
import { contentText } from '../lib/content.js';
import { t } from '../lib/i18n.js';
import { getCurrentChart } from './chart.js';


let placeB = null;
let lastComparison = null;

export function rerenderConnectionGraphs() {
  if (lastComparison && lastComparison[1] === getCurrentChart()) {
    renderConnectionContent(...lastComparison);
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
  const previousValue = select.value;
  const hadOptions = select.options.length > 0;
  const people = listPeople();
  const current = getCurrentChart();
  const options = people
    .filter(p => p.id !== current?.birth?.id)
    .map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
    .join('');
  // A chart they arrived at via a share link stays comparable (P1-11).
  const guest = getSharedGuest();
  const guestOpt = guest?.name && guest?.birthDate && guest.id !== current?.birth?.id
    ? `<option value="__guest">${esc(guest.name)} ${t('(shared chart)')}</option>` : '';
  select.innerHTML = `<option value="">${t('— enter birth data below —')}</option>${guestOpt}${options}`;
  if (hadOptions && [...select.options].some(option => option.value === previousValue)) select.value = previousValue;
  document.getElementById('conn-manual').classList.toggle('hidden', !!select.value);
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
  let defaultName = false;

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
    const enteredName = document.getElementById('conn-name').value.trim();
    defaultName = !enteredName;
    birthB = {
      name: enteredName || 'Person B',
      birthDate: date,
      birthTime: time,
      timezone: loc.timezone,
      location: loc.lat != null ? loc : null
    };
  }
  if (!birthB) return;

  const b = computeChart(birthB);
  b.defaultDisplayName = defaultName;
  const comparison = compareHumanDesign(current.chart, b.chart);
  renderConnectionContent(comparison, current, b);
}

export function refreshConnectionLanguage() {
  renderConnectionView();
  if (lastComparison && lastComparison[1] === getCurrentChart()) {
    const [comparison, a, b] = lastComparison;
    renderConnectionContent(comparison, a, b, { languageOnly: true });
  }
}

// Person colors for the combined chart (theme-aware): teal = A, coral = B,
// gold = a channel/center the two only complete together.
function compositePalette() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return dark
    ? { a: '#3db5a5', b: '#e8927a', bridged: '#cda64a' }
    : { a: '#2a9d8f', b: '#e07a5f', bridged: '#d4a23a' };
}

const DYN_LABEL = {
  electromagnetic: 'Electromagnetic', companionship: 'Companionship',
  compromise: 'Compromise', dominance: 'Dominance'
};
const DYN_BLURB = {
  electromagnetic: 'You each bring one half — together you complete it. Spark, and the friction that rides with it.',
  companionship: 'You both carry the whole channel — easy, shared common ground.',
  compromise: 'One of you has the full channel, the other only half — the full side sets the tone.',
  dominance: 'One of you has the whole channel, the other has none of it — it flows one way.'
};

// The four ways two charts share channels — explained, with the circuit each
// connection runs through (individual / tribal / collective / integration).
const CONN_TYPES = [
  ['electromagnetic', 'Electromagnetic', 'var(--electromagnetic)', 'Each of you carries one half of a channel — together you complete it, generating energy neither has alone. This is the spark of attraction, and the friction that rides along with it.'],
  ['companionship', 'Companionship', 'var(--integration)', 'You both already have the whole channel — shared, stable common ground where you simply “get” each other with no effort.'],
  ['compromise', 'Compromise', 'var(--collective)', 'One of you has the full channel, the other only half of it. The full-channel person sets the tone here; the other gets drawn into their frequency — workable, but it asks for give and take.'],
  ['dominance', 'Dominance', 'var(--text-tertiary)', 'One of you has the full channel and the other has nothing in it. That energy flows one way, consistently conditioning the open person — powerful, and worth being conscious of.']
];

function renderConnectionContent(comparison, a, b, { languageOnly = false } = {}) {
  lastComparison = [comparison, a, b];
  const container = document.getElementById('connection-content');
  const wasExpanded = !!container.querySelector('.composite-individuals')?.open;
  const previousDetail = container.querySelector('.gate-detail:not(.hidden) .gate-detail-card');
  const openGate = previousDetail?.dataset.gate;
  const openCenter = previousDetail?.dataset.center;
  if (!languageOnly || openGate != null || openCenter != null) closeDetailDialog();
  const cc = comparison.connectionChart;
  const nameA = a.birth.name || t('You');
  const nameB = b.defaultDisplayName ? t('Person B') : (b.birth.name || t('Person B'));
  const ti = comparison.typeInteraction;
  const ad = comparison.authorityDynamic;
  const ph = comparison.profileHarmony;
  const br = comparison.bridging;
  const stats = comparison.stats || {};

  const circuitBadge = (c) => c ? `<span class="circuit-badge ${esc(c)}">${esc(circuitName(c))}</span>` : '';

  const connSection = ([key, label, color, blurb]) => {
    const items = cc.connections[key] || [];
    return `
      <div class="conn-section">
        <div class="conn-section-head"><span class="panel-title">${t(label)}</span><span class="conn-count">${items.length}</span></div>
        <p class="panel-intro">${t(blurb)}</p>
        ${items.length ? items.map(c => `
          <div class="connection-type" style="border-left:3px solid ${color}">
            <div class="conn-channel">${esc(channelName(c.gates))} <span class="conn-gates">(${c.gates.join('–')})</span> ${circuitBadge(c.circuit)}</div>
            <div class="conn-desc">${esc(contentText(c.description))}</div>
          </div>`).join('')
        : `<div class="conn-empty">${t('No {label} channels between you.', { label: t(label).toLowerCase() })}</div>`}
      </div>`;
  };

  // Center conditioning map — who steadily influences whom.
  const cd = comparison.centerDynamics || [];
  const conditioning = cd.filter(c => /Conditions/.test(c.dynamic)).map(c => {
    const from = c.dynamic.startsWith('A') ? nameA : nameB;
    const to = c.dynamic.startsWith('A') ? nameB : nameA;
    return `<div class="conn-center"><strong>${esc(centerName(c.centerName))}</strong> — ${esc(from)} ${t('conditions')} ${esc(to)} <span class="conn-center-theme">${esc(contentText(c.theme))}</span></div>`;
  });
  const bothDefined = cd.filter(c => c.dynamic === 'Both Defined').map(c => c.centerName);
  const bothOpen = cd.filter(c => c.dynamic === 'Both Open').map(c => c.centerName);

  const cpal = compositePalette();

  container.innerHTML = `
    <div class="composite-wrap">
      <div class="panel-title">${t('Your charts combined')}</div>
      <p class="panel-intro">${t('One body, both of you — each half-channel colored by who brings it. A <strong>two-tone</strong> channel is an electromagnetic bond you only complete together. Hover or tap any gate, channel, or center.')}</p>
      <div class="composite-legend">
        <span class="lg"><i style="background:${cpal.a}"></i>${esc(nameA)}</span>
        <span class="lg"><i style="background:${cpal.b}"></i>${esc(nameB)}</span>
        <span class="lg"><i class="lg-stripe" style="background:linear-gradient(45deg, ${cpal.a} 0 50%, ${cpal.b} 50% 100%)"></i>${t('Both have it')}</span>
        <span class="lg"><i style="background:${cpal.bridged}"></i>${t('Made together')}</span>
      </div>
      <div id="conn-composite" class="composite-graph"></div>
      <div id="conn-detail" class="gate-detail hidden"></div>
    </div>

    <details class="composite-individuals">
      <summary>${t('See each chart on its own')}</summary>
      <div class="connection-graphs">
        <div class="connection-graph">
          <div class="connection-graph-name">${esc(nameA)}</div>
          <div class="connection-graph-type">${esc(typeName(a.chart.type.name))} ${esc(a.chart.profile.numbers)}</div>
          <div id="conn-graph-a"></div>
        </div>
        <div class="connection-graph">
          <div class="connection-graph-name">${esc(nameB)}</div>
          <div class="connection-graph-type">${esc(typeName(b.chart.type.name))} ${esc(b.chart.profile.numbers)}</div>
          <div id="conn-graph-b"></div>
        </div>
      </div>
    </details>

    <div class="conn-dynamic">
      <div class="panel-title">${esc(contentText(ti.dynamic))}</div>
      <div class="conn-dynamic-sub">${esc(typeName(ti.typeA))} + ${esc(typeName(ti.typeB))}</div>
      <p><strong>${t('Gifts')}</strong> · ${esc(contentText(ti.gifts))}</p>
      <p><strong>${t('Challenge')}</strong> · ${esc(contentText(ti.challenges))}</p>
      <p><strong>${t('Make it work')}</strong> · ${esc(contentText(ti.tips))}</p>
    </div>

    <div class="foundation-grid" style="margin-bottom:8px">
      <div class="foundation-item"><div class="label">${t('Together you are')}</div><div class="value">${esc(typeName(cc.compositeType))}</div><div class="detail">${t('{count} channels combined', { count: cc.compositeChannelCount })}</div></div>
      <div class="foundation-item"><div class="label">${t('Attraction')}</div><div class="value">${stats.electromagneticCount ?? cc.connections.electromagnetic.length}</div><div class="detail">${t('electromagnetic links')}</div></div>
      <div class="foundation-item"><div class="label">${t('Conditioning')}</div><div class="value">${stats.conditioningCenters ?? conditioning.length}</div><div class="detail">${t('centers one shapes in the other')}</div></div>
    </div>

    <div class="panel-title" style="margin-top:22px">${t('How you decide together')}</div>
    <p class="panel-intro">${esc(authorityName(ad.authorityA))} + ${esc(authorityName(ad.authorityB))} — ${esc(contentText(ad.description))} ${ad.timing ? `<em>${t('Timing:')} ${esc(contentText(ad.timing))}.</em>` : ''}</p>

    <div class="panel-title">${t('Profiles')}</div>
    <p class="panel-intro">${esc(profileName(ph.profileA))} (${esc(ph.profileA)}) + ${esc(profileName(ph.profileB))} (${esc(ph.profileB)}) — ${esc(contentText(ph.description))}</p>

    <div class="panel-title" style="margin-top:22px">${t('The four ways your channels connect')}</div>
    ${CONN_TYPES.map(connSection).join('')}

    <div class="panel-title" style="margin-top:22px">${t('Your centers together')}</div>
    <p class="panel-intro">${t('Where one of you is defined and the other open, the defined person steadily conditions the open one — a consistent, often unspoken influence.')}</p>
    ${conditioning.length ? conditioning.join('') : `<div class="conn-empty">${t('Neither of you conditions the other’s centers — an unusually independent pairing.')}</div>`}
    ${bothDefined.length ? `<p class="conn-note"><strong>${t('Both defined:')}</strong> ${bothDefined.map(centerName).map(esc).join(t(', '))} ${t('— consistent, fixed common ground.')}</p>` : ''}
    ${bothOpen.length ? `<p class="conn-note"><strong>${t('Both open:')}</strong> ${bothOpen.map(centerName).map(esc).join(t(', '))} ${t('— you amplify each other (and the room) here; watch for shared not-self patterns.')}</p>` : ''}

    ${br?.bridgedChannels?.length ? `
      <div class="panel-title" style="margin-top:22px">${t('What you create together')}</div>
      <p class="panel-intro">${esc(contentText(br.description))}</p>
      <div class="pills">${br.bridgedChannels.map(c => `<span class="pill">${esc(channelName(CHANNELS.find(ch => ch.name === c.channel)?.gates || c.channel))} · ${esc(contentText(c.theme))}</span>`).join('')}</div>` : ''}

    <div class="panel-title" style="margin-top:22px">${t('In a nutshell')}</div>
    <p>${esc(contentText(comparison.summary))}</p>
  `;
  container.querySelector('.composite-individuals').open = wasExpanded;

  // The hero: one combined bodygraph, colored by who brings each gate. Detail
  // handlers below close over `api` (assigned right after the graph renders).
  let api;
  const detail = container.querySelector('#conn-detail');
  const whoName = (owner) => owner === 'both' ? `${nameA} + ${nameB}`
    : owner === 'a' ? nameA : owner === 'b' ? nameB : t('Neither of you');

  function openDetail() {
    openDetailDialog(detail, () => api?.setPinned?.(null));
  }

  function showCompositeGate(g, scroll = true) {
    const gate = GATES[g];
    const owner = api.gateOwner(g);
    const rows = CHANNELS.filter(ch => ch.gates.includes(g)).map(ch => {
      const dyn = api.channelDynamic(ch);
      if (!dyn) return '';
      const other = ch.gates.find(x => x !== g);
      const bring = (gn, ow) => t(ow === 'both' ? '{name} both bring {gate}' : '{name} brings {gate}', {
        name: esc(whoName(ow)), gate: gn
      });
      return `
        <div class="conn-detail-channel ${dyn}">
          <div class="cdc-dyn">${t(DYN_LABEL[dyn])}</div>
          <div class="cdc-name">${esc(channelName(ch.gates))} <span class="conn-gates">(${ch.gates.join('–')})</span></div>
          <div class="cdc-bring">${bring(g, owner)} · ${bring(other, api.gateOwner(other))}</div>
          <div class="cdc-blurb">${t(DYN_BLURB[dyn])}</div>
        </div>`;
    }).filter(Boolean).join('');
    detail.innerHTML = `
      <div class="gate-detail-card" data-gate="${g}">
        <button class="gate-detail-close" title="${t('Close')}">&times;</button>
        <div class="panel-title">${t('Gate {gate}', { gate: g })}${gate?.name ? ' — ' + esc(gateName(g)) : ''}</div>
        <div class="conn-detail-who">${t('Carried by')} <strong>${esc(whoName(owner))}</strong></div>
        ${rows || `<p class="gate-detail-inactive">${t('This gate doesn’t complete a channel between you.')}</p>`}
      </div>`;
    detail.classList.remove('hidden');
    api.setPinned?.({ kind: 'gate', id: g });
    openDetail();
  }

  function showCompositeCenter(key, scroll = true) {
    const owner = api.centerOwner(key);
    const dn = graphCenter(key);
    const tag = owner === 'both' ? t('Both define') : owner === 'a' ? t('{name} defines', { name: nameA })
      : owner === 'b' ? t('{name} defines', { name: nameB }) : owner === 'bridged' ? t('Made together') : t('Open between you');
    const txt = owner === 'both' ? t('You both define {center} — fixed, reliable common ground between you.', { center: dn })
      : owner === 'a' ? t('{from} defines {center}; {to} takes it in. {from} steadily conditions {to} here — a consistent, often unspoken influence.', { from: nameA, to: nameB, center: dn })
      : owner === 'b' ? t('{from} defines {center}; {to} takes it in. {from} steadily conditions {to} here — a consistent, often unspoken influence.', { from: nameB, to: nameA, center: dn })
      : owner === 'bridged' ? t('Neither of you defines {center} alone — but together your gates complete a channel into it. You generate this energy only as a pair.', { center: dn })
      : t('{center} stays open between you — you both amplify whatever’s in the room here. Watch for shared not-self patterns.', { center: dn });
    detail.innerHTML = `
      <div class="gate-detail-card center-detail-card" data-center="${key}">
        <button class="gate-detail-close" title="${t('Close')}">&times;</button>
        <div class="panel-title">${esc(t('{center} Center', { center: dn }))}</div>
        <div class="center-detail-head"><span class="conn-center-tag ${owner || 'open'}">${esc(tag)}</span></div>
        <p class="gate-detail-desc">${esc(txt)}</p>
      </div>`;
    detail.classList.remove('hidden');
    api.setPinned?.({ kind: 'center', id: key });
    openDetail();
  }

  api = renderBodygraph(container.querySelector('#conn-composite'), a.chart, {
    composite: {
      chartA: a.chart, chartB: b.chart,
      colorA: cpal.a, colorB: cpal.b, colorBridged: cpal.bridged,
      labelA: nameA, labelB: nameB
    },
    onGateClick: showCompositeGate,
    onCenterClick: showCompositeCenter
  });

  renderBodygraph(container.querySelector('#conn-graph-a'), a.chart, { compact: true });
  renderBodygraph(container.querySelector('#conn-graph-b'), b.chart, { compact: true });
  if (openGate != null) showCompositeGate(Number(openGate), false);
  else if (openCenter != null) showCompositeCenter(openCenter, false);
}
