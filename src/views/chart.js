/**
 * Chart view — bodygraph + foundation + tabbed detail panels.
 */

import {
  GATE_DESCRIPTIONS,
  CHANNEL_DESCRIPTIONS,
  GATES,
  CHANNELS
} from 'natalengine';

/** "a", "a and b", "a, b and c" — grammatical lists of any length. */
function humanList(arr) {
  if (arr.length <= 1) return arr[0] || '';
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

import { renderBodygraph, PLANET_ORDER, PLANET_GLYPHS, PLANET_NAMES } from '../bodygraph.js';
import { esc, formatBirth } from '../lib/format.js';
import { birthToParams, connectionUrl } from '../lib/share.js';
import { dt } from '../lib/details.js';
import { registerScope, openDetail, refreshDetail } from '../detail-panel.js';
import { startSteps, FIRST_CHART_NAME } from '../lib/starthere.js';

let current = null; // { birth, chart, geneKeys }
let bodygraphApi = null;

// Everything in the chart view opens in the shared detail panel; while an
// item is open its gate/center stays pinned-lit on the bodygraph.
registerScope('chart', {
  context: () => current && { chart: current.chart, geneKeys: current.geneKeys },
  onShow: (_entry, result) => {
    bodygraphApi?.setPinned?.(result.pin || null);
    // Gate chips and line cards in the panel light their gate on the graph.
    document.querySelectorAll('#detail-panel .gate-chip[data-gate], #detail-panel .dp-card[data-gate]')
      .forEach(el => wireRowHover(el, parseInt(el.dataset.gate)));
  },
  onClose: () => bodygraphApi?.setPinned?.(null)
});

export const showGateDetail = (gateNum) => openDetail('chart', 'gate', gateNum);
export const showCenterDetail = (centerKey) => openDetail('chart', 'center', centerKey);
const showPlanetDetail = (side, planet) => openDetail('chart', 'planet', `${side}.${planet}`);

const TYPE_COLORS = {
  'Generator': 'var(--generator)',
  'Manifesting Generator': 'var(--manifesting-generator)',
  'Manifestor': 'var(--manifestor)',
  'Projector': 'var(--projector)',
  'Reflector': 'var(--reflector)'
};

// Plain-language one-liners shown under the type banner for newcomers.
const TYPE_PLAIN = {
  'Generator': 'You have sustainable life-force energy. Life works best when you respond to what shows up rather than chasing what isn\'t there yet.',
  'Manifesting Generator': 'You have powerful, fast-moving energy for many things at once. Respond first, then inform the people your actions will affect.',
  'Manifestor': 'You\'re here to initiate. You don\'t need to wait for anyone — but informing people before you act keeps the path clear.',
  'Projector': 'You\'re here to guide others and see systems clearly. Your gifts land when they\'re recognized and invited, not pushed.',
  'Reflector': 'You mirror the health of your community. Take a full lunar cycle (~28 days) before big decisions and choose your environments carefully.'
};

export function renderChartView(data, { onShare, onRename } = {}) {
  current = data;
  const { birth, chart } = data;

  document.getElementById('birth-entry').classList.add('hidden');
  document.getElementById('chart-view').classList.remove('hidden');

  // --- Type banner ---
  const banner = document.getElementById('type-banner');
  const who = birth.name ? `${esc(birth.name)} — ` : '';
  const birthLine = [
    formatBirth(birth.birthDate, birth.timeUnknown ? null : birth.birthTime),
    birth.location?.name
  ].filter(Boolean).join(' · ');

  banner.dataset.detailScope = 'chart';
  banner.innerHTML = `
    <div class="type-name">${who.replace(' — ', '')}</div>
    ${birth.id && birth.name === FIRST_CHART_NAME && onRename ? '<button type="button" id="rename-chart" class="link-button banner-rename">Add your name</button>' : ''}
    <div><button type="button" class="type-badge" ${dt('type', chart.type.name)}>${esc(chart.type.name)}</button></div>
    <div class="type-detail">
      <button type="button" class="banner-link" ${dt('profile', chart.profile.numbers)}>${esc(chart.profile.numbers)} ${esc(chart.profile.name)}</button>
      <span aria-hidden="true">·</span>
      <button type="button" class="banner-link" ${dt('authority', chart.authority.name)}>${esc(chart.authority.name)}</button>
      <span aria-hidden="true">·</span>
      <button type="button" class="banner-link" ${dt('definition', chart.definition)}>${esc(chart.definition)}</button>
    </div>
    <div class="type-birthline">${esc(birthLine)}${birth.timeUnknown ? ' · <em>time unknown — chart uses noon</em>' : ''}</div>
    <div><button type="button" class="type-strategy" ${dt('type', chart.type.name)}>Strategy: ${esc(chart.type.strategy)}</button></div>
    <p class="type-plain">${esc(TYPE_PLAIN[chart.type.name] || '')}</p>
    <div class="banner-actions">
      <button id="share-chart" class="btn-secondary btn-small">Copy chart link</button>
      <button id="save-image" class="btn-secondary btn-small">Save image</button>
      <button id="invite-compare" class="btn-secondary btn-small">Invite to compare</button>
    </div>
  `;
  document.getElementById('rename-chart')?.addEventListener('click', () => onRename());
  renderStartHere(chart, !!birth.id);

  document.getElementById('share-chart').addEventListener('click', async (e) => {
    if (!onShare) return;
    try {
      await onShare();
      e.target.textContent = 'Link copied ✓';
    } catch {
      e.target.textContent = 'Copy blocked — use the address bar URL';
    }
    setTimeout(() => { e.target.textContent = 'Copy chart link'; }, 2500);
  });

  // Download a 9:16 share card (Reels / Stories / TikTok), rendered by the
  // Worker's /og endpoint. (No-op offline / on the static mirror.)
  document.getElementById('save-image').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.textContent = 'Preparing…';
    try {
      const params = birthToParams(birth);
      params.set('format', 'story');
      if (document.documentElement.getAttribute('data-theme') === 'dark') params.set('theme', 'dark');
      const res = await fetch(`/og/card.png?${params}`);
      if (!res.ok) throw new Error('render failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(birth.name || 'human-design').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-chart.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      btn.textContent = 'Saved ✓';
    } catch {
      btn.textContent = 'Image unavailable here';
    }
    setTimeout(() => { btn.textContent = 'Save image'; }, 2500);
  });

  // Dyad loop: copy a "compare designs with me" link. Whoever opens it goes
  // straight to their connection chart against this person.
  document.getElementById('invite-compare').addEventListener('click', async (e) => {
    const btn = e.target;
    try {
      await navigator.clipboard.writeText(connectionUrl(birth));
      btn.textContent = 'Invite copied ✓';
    } catch {
      btn.textContent = 'Copy blocked — use the address bar';
    }
    setTimeout(() => { btn.textContent = 'Invite to compare'; }, 2500);
  });

  // --- Bodygraph ---
  rerenderBodygraph();

  // --- Foundation + default tab ---
  renderFoundation(chart, data.sensitivity, birth);
  const activeTab = document.querySelector('.panel-tab.active');
  renderPanelContent(activeTab ? activeTab.dataset.panel : 'centers');

}

// ==========================================
// Start here — three first steps, each opening the detail panel
// ==========================================
const START_KEY = 'ohd-start-here';
const startHidden = () => { try { return localStorage.getItem(START_KEY) === 'hidden'; } catch { return false; } };

// Saved charts only: a chart opened from someone's link isn't the viewer's,
// and the steps speak to the chart's owner.
function renderStartHere(chart, saved) {
  const card = document.getElementById('start-here');
  if (!saved || startHidden()) { card.hidden = true; card.innerHTML = ''; return; }
  card.hidden = false;
  card.dataset.detailScope = 'chart';
  card.innerHTML = `
    <div class="start-head">
      <h2 class="start-title" id="start-title">Start here</h2>
      <button type="button" class="start-dismiss" aria-label="Hide Start here">Got it</button>
    </div>
    <ol class="start-steps" aria-labelledby="start-title">
      ${startSteps(chart).map((step, i) => `
        <li><button type="button" class="start-step" ${dt(step.kind, step.id)}>
          <span class="start-num" aria-hidden="true">${i + 1}</span>
          <span class="start-body">
            <span class="start-label">${esc(step.label)} · <strong>${esc(step.value)}</strong></span>
            <span class="start-line">${esc(step.line)}</span>
          </span>
          <span class="start-arrow" aria-hidden="true">›</span>
        </button></li>`).join('')}
    </ol>`;
  card.querySelector('.start-dismiss').addEventListener('click', () => {
    try { localStorage.setItem(START_KEY, 'hidden'); } catch { /* private mode: hide for now */ }
    card.hidden = true;
    document.querySelector('#type-banner .type-strategy')?.focus({ preventScroll: true });
  });
}

// Phones: the Foundation moves up, between Start here and the bodygraph, so
// the reading comes before the long scroll past the graph. Moving the node
// (not CSS order) keeps reading and focus order the same as what's on screen.
const PHONE = window.matchMedia('(max-width: 640px)'); // = the phone @media in styles.css
function placeFoundation() {
  const panel = document.getElementById('foundation-panel');
  const layout = document.querySelector('#chart-view .chart-layout');
  if (PHONE.matches) layout.prepend(panel);
  else document.querySelector('#chart-view .info-column').prepend(panel);
}
placeFoundation();
PHONE.addEventListener('change', placeFoundation);

export function rerenderBodygraph(transitGates = null) {
  if (!current) return;
  const container = document.getElementById('bodygraph-container');
  bodygraphApi = renderBodygraph(container, current.chart, {
    onGateClick: showGateDetail,
    onCenterClick: showCenterDetail,
    onPlanetClick: showPlanetDetail,
    onHighlight: highlightPanelRows,
    transitGates: transitGates || undefined
  });
  refreshDetail('chart'); // re-pin the open item on the new graph
  return bodygraphApi;
}

// Reverse direction of the bodygraph's relational highlight: when a gate/center
// lights up on the graph, light the matching rows in the data panels so the
// chart and the lists read as one focused object.
function highlightPanelRows(sel) {
  document.querySelectorAll('.row-lit').forEach(el => el.classList.remove('row-lit'));
  if (!sel) return;
  for (const g of sel.gates || []) {
    document
      .querySelectorAll(`#panel-content [data-gate="${g}"], #foundation-panel [data-gate="${g}"], #detail-panel [data-gate="${g}"]`)
      .forEach(el => el.classList.add('row-lit'));
  }
  for (const ck of sel.centers || []) {
    document
      .querySelectorAll(`#panel-content [data-center="${ck}"], #detail-panel [data-center="${ck}"]`)
      .forEach(el => el.classList.add('row-lit'));
  }
}

// Forward direction: hovering a data row lights its gate(s) on the bodygraph.
// Mouse/pen only — on touch the tap opens the detail (which pins the selection).
function wireRowHover(el, gateNum) {
  el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') bodygraphApi?.highlightGate?.(gateNum); });
  el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') bodygraphApi?.highlightGate?.(null); });
}

function wireCenterHover(el, centerKey) {
  el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') bodygraphApi?.highlightCenter?.(centerKey); });
  el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') bodygraphApi?.highlightCenter?.(null); });
}

function renderFoundation(chart, sensitivity = null, birth = null) {
  const panel = document.getElementById('foundation-panel');

  let reliabilityHtml = '';
  // The MOST consequential caveat: a noon-guess chart can be genuinely
  // wrong about Type/Authority/Profile — say so calmly and prominently.
  if (birth?.timeUnknown) {
    reliabilityHtml = `
      <div class="reliability reliability-soft">
        <span class="reliability-dot"></span>
        <span>No birth time — this chart is a best guess using noon. Your <strong>Type, Authority and
        Profile</strong> can change with the real time, so treat this as a starting point until you
        find it (birth certificates and baby books are the usual sources).</span>
      </div>`;
  }
  if (sensitivity && !birth?.timeUnknown) {
    const solid = sensitivity.shifts.length === 0;
    // Say plainly what could change and what holds; never alarm.
    reliabilityHtml = solid
      ? `
      <div class="reliability reliability-solid">
        <span class="reliability-dot"></span>
        <span>Solid chart — even if your birth time were off by 15 minutes, nothing here would change.</span>
      </div>`
      : `
      <div class="reliability reliability-soft">
        <span class="reliability-dot"></span>
        <span>Your <strong>${esc(humanList(sensitivity.shifts))}</strong> could change if your birth time is off
        by 15 minutes or less. The rest of your foundation holds within that range. If you know your time to the minute,
        the chart as shown is right.</span>
      </div>`;
  }
  const crossName = chart.incarnationCross?.fullName || chart.incarnationCross?.name || 'Unknown';
  const circuitDominant = chart.circuitAnalysis?.dominant;
  const circuitText = circuitDominant
    ? `${circuitDominant.name.charAt(0).toUpperCase() + circuitDominant.name.slice(1)} (${plural(circuitDominant.channelCount, 'channel')})`
    : 'None';

  panel.dataset.detailScope = 'chart';
  const tile = (label, value, detail, trigger) => `
      <div class="foundation-item ${trigger ? 'foundation-clickable' : ''}" ${trigger}>
        <div class="label">${label}</div>
        <div class="value">${value}</div>
        <div class="detail">${detail}</div>
      </div>`;
  panel.innerHTML = `
    <div class="panel-title">Foundation</div>
    ${reliabilityHtml}
    <div class="foundation-grid">
      ${tile('Type', esc(chart.type.name), esc(chart.type.description), dt('type', chart.type.name))}
      ${tile('Strategy', esc(chart.type.strategy), `Signature: ${esc(chart.type.signature)} · Not-Self: ${esc(chart.type.notSelf)}`, dt('type', chart.type.name))}
      ${tile('Authority', esc(chart.authority.name), esc(chart.authority.description), dt('authority', chart.authority.name))}
      ${tile('Profile', `${esc(chart.profile.numbers)} ${esc(chart.profile.name)}`, esc(chart.profile.theme), dt('profile', chart.profile.numbers))}
      ${tile('Definition', esc(chart.definition), `${plural(chart.centers.definedNames.length, 'defined center')}, ${plural(chart.channels.length, 'channel')}`, dt('definition', chart.definition))}
      ${tile('Incarnation Cross', esc(crossName), `Gates ${chart.incarnationCross?.gates?.join(' / ') || '—'}`, chart.incarnationCross ? dt('cross', 'self') : '')}
      ${tile('Dominant Circuit', esc(circuitText), circuitDominant ? esc(circuitDominant.theme || '') : 'No defined channels', circuitDominant ? dt('circuit', circuitDominant.name.toLowerCase()) : '')}
      ${tile('Variable', esc(current.chart.variable?.notation || '—'), 'Determination · Environment · Perspective · Motivation', current.chart.variable ? dt('variable', 'determination') : '')}
    </div>
  `;
}

// ==========================================
// Panel tabs
// ==========================================
export function setupPanelTabs() {
  const tabs = document.querySelectorAll('.panel-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderPanelContent(tab.dataset.panel);
    });
  });
}

export function renderPanelContent(panel) {
  if (!current) return;
  const container = document.getElementById('panel-content');
  container.dataset.detailScope = 'chart';
  switch (panel) {
    case 'centers': renderCentersPanel(container); break;
    case 'channels': renderChannelsPanel(container); break;
    case 'gates': renderGatesPanel(container); break;
    case 'planets': renderPlanetsPanel(container); break;
    case 'variable': renderVariablePanel(container); break;
    case 'cross': renderCrossPanel(container); break;
  }
}

function renderCentersPanel(container) {
  const { chart } = current;
  const card = (c, status, extra = '') => `
    <div class="center-card ${status}" data-center="${c.key}" ${dt('center', c.key)} aria-label="${esc(c.name)} center, ${status}">
      <div class="center-status ${status}">${status === 'defined' ? 'Defined' : status === 'undefined' ? 'Undefined' : 'Open'}</div>
      <div class="center-name">${esc(c.name)}</div>
      <p>${esc(status === 'defined' ? (c.definedMeaning || c.pressure) : status === 'undefined' ? c.undefinedMeaning : c.openMeaning)}</p>
      ${extra}
    </div>
  `;
  const notSelf = c => `<p class="center-notself">${esc(c.notSelfQuestion)}</p>`;

  container.innerHTML = `
    <div class="panel-title">Centers (${chart.centers.definedNames.length} defined · ${chart.centers.undefinedNames.length} undefined · ${chart.centers.openNames.length} open)</div>
    <p class="panel-intro">Defined centers are consistent energy you radiate. Undefined and open centers are where you take in — and amplify — the energy around you; they're your deepest learning. Tap any center for its gates and channels.</p>
    ${chart.centers.defined.map(c => card(c, 'defined')).join('')}
    ${chart.centers.undefined.map(c => card(c, 'undefined', notSelf(c))).join('')}
    ${chart.centers.open.map(c => card(c, 'open', notSelf(c))).join('')}
  `;
  container.querySelectorAll('.center-card[data-center]').forEach(el => wireCenterHover(el, el.dataset.center));
}

function renderChannelsPanel(container) {
  const { chart } = current;

  // Hanging gates: for every channel where exactly one gate is active,
  // the active gate "hangs", seeking its partner. Gates in multiple
  // channels (10, 20, 34, 57) can hang toward several partners at once.
  const activeSet = new Set(chart.gates.all);
  const hangingMap = new Map(); // gate -> [partners]
  for (const ch of CHANNELS) {
    const [a, b] = ch.gates;
    if (activeSet.has(a) && !activeSet.has(b)) (hangingMap.get(a) || hangingMap.set(a, []).get(a)).push(b);
    if (activeSet.has(b) && !activeSet.has(a)) (hangingMap.get(b) || hangingMap.set(b, []).get(b)).push(a);
  }
  const hanging = [...hangingMap.entries()]
    .map(([gate, partners]) => ({ gate, partners: partners.sort((x, y) => x - y) }))
    .sort((x, y) => x.gate - y.gate);

  const channelsHtml = chart.channels.map(ch => {
    const key = `${ch.gates[0]}-${ch.gates[1]}`;
    const desc = CHANNEL_DESCRIPTIONS[key];
    return `
      <div class="channel-item" data-gate="${ch.gates[0]}" ${dt('channel', key)}>
        <div class="channel-name">
          ${esc(ch.name)} (${key})
          <span class="circuit-badge ${esc(ch.circuit)}">${esc(ch.circuit)}</span>
        </div>
        <div class="channel-meta">${esc(ch.theme)} · ${esc(ch.centers.join(' ↔ '))}</div>
        ${desc ? `<div class="channel-summary">${esc(desc.whenDefined)}</div>` : ''}
      </div>
    `;
  }).join('');

  const hangingHtml = hanging.length ? `
      <div class="panel-title" style="margin-top:20px">Hanging Gates (${hanging.length})</div>
      <p class="panel-intro">Active gates waiting for their harmonic partner — you're drawn to people who carry the other half. Tap one to see the channel it would complete.</p>
      <div class="hanging-gates">
        ${hanging.map(h => `<button type="button" class="gate-pill" data-gate="${h.gate}" ${dt('gate', h.gate)}>Gate ${h.gate} <span class="gate-pill-partner">seeks ${h.partners.join(' · ')}</span></button>`).join('')}
      </div>` : '';

  container.innerHTML = chart.channels.length ? `
    <div class="panel-title">Channels (${chart.channels.length} defined)</div>
    <p class="panel-intro">Tap a channel for its meaning, its gates and the circuit it belongs to.</p>
    ${channelsHtml}
    ${hangingHtml}
  ` : `
    <div class="panel-title">Channels</div>
    <p>No defined channels — as a Reflector, all of your gates are "hanging" gates that complete through the people and transits around you.</p>
    ${hangingHtml}
  `;
  container.querySelectorAll('.gate-pill, .channel-item[data-gate]').forEach(el =>
    wireRowHover(el, parseInt(el.dataset.gate)));
}

function renderGatesPanel(container) {
  const { chart } = current;
  const allGates = [...chart.gates.all].sort((a, b) => a - b);

  const gatesHtml = allGates.map(gateNum => {
    const desc = GATE_DESCRIPTIONS[gateNum];
    const acts = [];
    for (const [planet, g] of Object.entries(chart.gates.design)) {
      if (g?.gate === gateNum) acts.push(`<span class="act-design">${PLANET_GLYPHS[planet]} ${gateNum}.${g.line}</span>`);
    }
    for (const [planet, g] of Object.entries(chart.gates.personality)) {
      if (g?.gate === gateNum) acts.push(`<span class="act-personality">${PLANET_GLYPHS[planet]} ${gateNum}.${g.line}</span>`);
    }
    return `
      <div class="gate-item" data-gate="${gateNum}" ${dt('gate', gateNum)}>
        <div class="gate-name">Gate ${gateNum}: ${esc(desc?.keynote || GATES[gateNum]?.name || '')}</div>
        <div class="gate-meta">${acts.join(' ')}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="panel-title">Active Gates (${allGates.length})</div>
    <p class="panel-intro"><span class="act-design">Red = Design</span> (unconscious, body) · <span class="act-personality">Black = Personality</span> (conscious, mind). Tap a gate for its lines, channels and center.</p>
    ${gatesHtml}
  `;
  container.querySelectorAll('.gate-item').forEach(item => wireRowHover(item, parseInt(item.dataset.gate)));
}

function renderPlanetsPanel(container) {
  const { chart } = current;
  // Substructure tooltip: gate.line then color/tone/base (the 6/6/6/5 layers)
  const sub = (g) => g && g.color
    ? `Color ${g.color} · Tone ${g.tone} · Base ${g.base}`
    : '';
  const subCell = (g) => g && g.color ? `${g.color}.${g.tone}.${g.base}` : '';
  const cell = (side, planet, g) => g
    ? `<button type="button" class="planet-cell act-${side}" data-gate="${g.gate}" ${dt('planet', `${side}.${planet}`)} title="${esc(sub(g))}" aria-label="${side === 'design' ? 'Design' : 'Personality'} ${esc(PLANET_NAMES[planet])}: gate ${g.gate} line ${g.line}">${g.gate}.${g.line}</button>`
    : `<span class="planet-cell act-${side}">—</span>`;
  const rows = PLANET_ORDER.map(planet => {
    const d = chart.gates.design[planet];
    const p = chart.gates.personality[planet];
    return `
      <div class="planet-table-row">
        ${cell('design', planet, d)}
        <span class="planet-cell-sub" title="Color · Tone · Base">${subCell(d)}</span>
        <span class="planet-cell-glyph" title="${esc(PLANET_NAMES[planet])}">${PLANET_GLYPHS[planet]}</span>
        <span class="planet-cell-name">${esc(PLANET_NAMES[planet])}</span>
        <span class="planet-cell-sub" title="Color · Tone · Base">${subCell(p)}</span>
        ${cell('personality', planet, p)}
      </div>
    `;
  }).join('');

  const dDate = chart.positions?.design?.date;
  container.innerHTML = `
    <div class="panel-title">Planetary Activations</div>
    <p class="panel-intro">Each planet activates a gate and line. Design (red) was calculated ~88 days before birth${dDate ? ` (${esc(dDate)})` : ''} — your unconscious, body-level themes. Personality (black) is the moment of birth — who you know yourself to be. Tap any activation for the planet, gate and line.</p>
    <div class="planet-table">
      <div class="planet-table-row planet-table-head">
        <span class="planet-cell act-design">Design</span>
        <span class="planet-cell-sub">c.t.b</span>
        <span></span><span></span>
        <span class="planet-cell-sub">c.t.b</span>
        <span class="planet-cell act-personality">Personality</span>
      </div>
      ${rows}
    </div>
  `;
  container.querySelectorAll('button.planet-cell[data-gate]').forEach(cell => wireRowHover(cell, parseInt(cell.dataset.gate)));
}

function renderVariablePanel(container) {
  const v = current.chart.variable;
  if (!v) {
    container.innerHTML = '<div class="panel-title">Variable</div><p>Variable data unavailable.</p>';
    return;
  }
  const arrowSymbol = (dir) => dir === 'left' ? '◀' : '▶';
  const card = (key, label, sub) => {
    const slot = v[key];
    return `
    <div class="arrow-card" ${dt('variable', key)}>
      <div class="arrow-direction">${arrowSymbol(slot.arrow)} <span class="arrow-side">${slot.arrow === 'left' ? 'Left — focused' : 'Right — receptive'}</span></div>
      <div class="arrow-label">${label}</div>
      <div class="arrow-type">${esc(slot.name)}</div>
      <div class="arrow-desc">${esc(slot.description)}</div>
      <div class="arrow-meta">Color ${slot.color} · Tone ${slot.tone}</div>
      ${sub || ''}
    </div>
  `;
  };
  container.innerHTML = `
    <div class="panel-title">Variable — ${esc(v.notation)}</div>
    <p class="panel-intro">The four arrows describe how your body and mind are tuned: how to eat, where to thrive, how you see, and what moves you. Subtle, advanced territory — explore slowly.</p>
    <div class="variable-grid">
      ${card('determination', 'Determination (Digestion)', v.determination.cognition ? `<div class="arrow-desc" style="margin-top:8px"><strong>Cognition:</strong> ${esc(v.determination.cognition.name)} — ${esc(v.determination.cognition.description)}</div>` : '')}
      ${card('environment', 'Environment')}
      ${card('perspective', 'Perspective (View)')}
      ${card('motivation', 'Motivation')}
    </div>
  `;
}

function renderCrossPanel(container) {
  const { chart, geneKeys } = current;
  const cross = chart.incarnationCross;
  if (!cross) {
    container.innerHTML = '<div class="panel-title">Incarnation Cross</div><p>Cross data unavailable.</p>';
    return;
  }

  const labels = ['Personality Sun', 'Personality Earth', 'Design Sun', 'Design Earth'];
  const geneKeysHtml = geneKeys ? `
    <div style="margin-top:24px">
      <div class="panel-title">Gene Keys — Activation Sequence</div>
      <p class="panel-intro">The same four positions through Richard Rudd's Shadow → Gift → Siddhi lens.</p>
      <div class="foundation-grid">
        ${['lifeWork', 'evolution', 'radiance', 'purpose'].map(sphere => {
          const s = geneKeys.activationSequence[sphere];
          return s ? `
            <div class="foundation-item foundation-clickable" ${dt('gate', s.key)}>
              <div class="label">${esc(s.sphere)}</div>
              <div class="value">Key ${esc(s.keyLine || s.key)}</div>
              <div class="detail">${esc(s.shadow)} → ${esc(s.gift)} → ${esc(s.siddhi)}</div>
            </div>
          ` : '';
        }).join('')}
      </div>
    </div>
  ` : '';

  const quarter = GATE_DESCRIPTIONS[chart.gates.personality.sun?.gate]?.quarter;
  container.innerHTML = `
    <div class="panel-title">Incarnation Cross</div>
    <button type="button" class="panel-heading heading-link" ${dt('cross', 'self')}>${esc(cross.fullName || cross.name)}</button>
    <p>${esc(cross.angleName || '')}${quarter ? ` · Quarter of ${esc(quarter)}` : ''}${cross.theme ? ' — ' + esc(cross.theme) : ''}</p>
    <p class="panel-intro" style="margin-top:8px">Your cross is the life theme carried by your four primary gates — roughly 70% of the chart's energy. It unfolds over a lifetime; you don't have to do anything to live it.</p>
    <div style="margin-top:12px">
      <div class="foundation-grid">
        ${cross.gates.map((gate, i) => `
          <div class="foundation-item foundation-clickable" data-gate="${gate}" ${dt('gate', gate)}>
            <div class="label">${labels[i]}</div>
            <div class="value">Gate ${gate}</div>
            <div class="detail">${esc(cross.gateNames?.[i] || '')}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ${geneKeysHtml}
  `;
  container.querySelectorAll('.foundation-clickable[data-gate]').forEach(item => wireRowHover(item, parseInt(item.dataset.gate)));
}

export function getCurrentChart() {
  return current;
}
