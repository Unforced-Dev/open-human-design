/**
 * Chart view — bodygraph + foundation + tabbed detail panels.
 */

import {
  GATE_DESCRIPTIONS,
  LINE_DESCRIPTIONS,
  CHANNEL_DESCRIPTIONS,
  HEXAGRAM_DESCRIPTIONS,
  GENE_KEY_DESCRIPTIONS,
  GATES,
  CHANNELS,
  LINE_NAMES
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

let current = null; // { birth, chart, geneKeys }
let bodygraphApi = null;
let detailHistory = []; // stack of { kind, id } for modal back-navigation
let currentDetail = null;

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

export function renderChartView(data, { onShare } = {}) {
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

  banner.innerHTML = `
    <div class="type-name">${who.replace(' — ', '')}</div>
    <div><span class="type-badge">${esc(chart.type.name)}</span></div>
    <div class="type-detail">${esc(chart.profile.numbers)} ${esc(chart.profile.name)} · ${esc(chart.authority.name)} · ${esc(chart.definition)}</div>
    <div class="type-birthline">${esc(birthLine)}${birth.timeUnknown ? ' · <em>time unknown — chart uses noon</em>' : ''}</div>
    <div class="type-strategy">Strategy: ${esc(chart.type.strategy)}</div>
    <p class="type-plain">${esc(TYPE_PLAIN[chart.type.name] || '')}</p>
    <div class="banner-actions">
      <button id="share-chart" class="btn-secondary btn-small">Copy chart link</button>
      <button id="save-image" class="btn-secondary btn-small">Save image</button>
      <button id="invite-compare" class="btn-secondary btn-small">Invite to compare</button>
    </div>
  `;
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

  // --- Modal close: backdrop click + ESC ---
  const detail = document.getElementById('gate-detail');
  detail.addEventListener('click', (e) => {
    if (e.target === detail) closeDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !detail.classList.contains('hidden')) closeDetail();
  });
}

export function rerenderBodygraph(transitGates = null) {
  if (!current) return;
  const container = document.getElementById('bodygraph-container');
  bodygraphApi = renderBodygraph(container, current.chart, {
    onGateClick: showGateDetail,
    onCenterClick: showCenterDetail,
    onHighlight: highlightPanelRows,
    transitGates: transitGates || undefined
  });
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
      .querySelectorAll(`#panel-content [data-gate="${g}"], #foundation-panel [data-gate="${g}"], #gate-detail [data-gate="${g}"]`)
      .forEach(el => el.classList.add('row-lit'));
  }
  for (const ck of sel.centers || []) {
    document
      .querySelectorAll(`#panel-content [data-center="${ck}"], #gate-detail [data-center="${ck}"]`)
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
    // Lead with reassurance and what to do — never alarm. (A founder-flagged
    // copy fix: the old wording read as a warning about the chart itself.)
    reliabilityHtml = solid
      ? `
      <div class="reliability reliability-solid">
        <span class="reliability-dot"></span>
        <span>Solid chart — even if your birth time were off by 15 minutes, nothing here would change.</span>
      </div>`
      : `
      <div class="reliability reliability-soft">
        <span class="reliability-dot"></span>
        <span>Your chart is solid. One fine detail — your <strong>${esc(humanList(sensitivity.shifts))}</strong> —
        sits right on a line, so it's the only thing a birth time off by 15+ minutes could nudge.
        Everything else holds no matter what. If your time came from a birth certificate, even that is settled.</span>
      </div>`;
  }
  const crossName = chart.incarnationCross?.fullName || chart.incarnationCross?.name || 'Unknown';
  const circuitDominant = chart.circuitAnalysis?.dominant;
  const circuitText = circuitDominant
    ? `${circuitDominant.name.charAt(0).toUpperCase() + circuitDominant.name.slice(1)} (${plural(circuitDominant.channelCount, 'channel')})`
    : 'None';

  panel.innerHTML = `
    <div class="panel-title">Foundation</div>
    ${reliabilityHtml}
    <div class="foundation-grid">
      <div class="foundation-item">
        <div class="label">Type</div>
        <div class="value">${esc(chart.type.name)}</div>
        <div class="detail">${esc(chart.type.description)}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Strategy</div>
        <div class="value">${esc(chart.type.strategy)}</div>
        <div class="detail">Signature: ${esc(chart.type.signature)} · Not-Self: ${esc(chart.type.notSelf)}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Authority</div>
        <div class="value">${esc(chart.authority.name)}</div>
        <div class="detail">${esc(chart.authority.description)}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Profile</div>
        <div class="value">${esc(chart.profile.numbers)} ${esc(chart.profile.name)}</div>
        <div class="detail">${esc(chart.profile.theme)}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Definition</div>
        <div class="value">${esc(chart.definition)}</div>
        <div class="detail">${plural(chart.centers.definedNames.length, 'defined center')}, ${plural(chart.channels.length, 'channel')}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Incarnation Cross</div>
        <div class="value">${esc(crossName)}</div>
        <div class="detail">Gates ${chart.incarnationCross?.gates?.join(' / ') || '—'}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Dominant Circuit</div>
        <div class="value">${esc(circuitText)}</div>
        <div class="detail">${circuitDominant ? esc(circuitDominant.theme || '') : 'No defined channels'}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Variable</div>
        <div class="value">${esc(current.chart.variable?.notation || '—')}</div>
        <div class="detail">Determination · Environment · Perspective · Motivation</div>
      </div>
    </div>
  `;
}

// ==========================================
// Gate detail (from bodygraph / list clicks)
// ==========================================
let currentLens = 'hd';
const LENSES = [['hd', 'Human Design'], ['iching', 'I Ching'], ['gk', 'Gene Keys']];

function gateActiveLines(gateNum, chart) {
  const s = new Set();
  for (const g of Object.values(chart.gates.design)) if (g?.gate === gateNum) s.add(g.line);
  for (const g of Object.values(chart.gates.personality)) if (g?.gate === gateNum) s.add(g.line);
  return [...s].sort((a, b) => a - b);
}

/** The interpretive body of the gate card, in the currently selected tradition. */
function renderLens(gateNum) {
  const chart = current.chart;
  const lines = gateActiveLines(gateNum, chart);

  if (currentLens === 'iching') {
    const hx = HEXAGRAM_DESCRIPTIONS[gateNum];
    if (!hx) return '<p class="gate-detail-desc">No I Ching reading available.</p>';
    const lineHtml = lines.map(l => hx.lines?.[l]
      ? `<div class="gate-detail-line"><strong>Line ${l}</strong><p>${esc(hx.lines[l])}</p></div>` : '').join('');
    return `
      <div class="gate-detail-keynote">Hexagram ${gateNum} · ${esc(hx.name)}</div>
      <p class="gate-detail-desc">${esc(hx.meaning)}</p>
      ${lineHtml ? `<div class="gate-detail-lines">${lineHtml}</div>` : ''}
      <p class="lens-note">The I Ching hexagram this gate is built on — Ra drew Human Design from this classical source.</p>`;
  }

  if (currentLens === 'gk') {
    const gk = GENE_KEY_DESCRIPTIONS[gateNum];
    if (!gk) return '<p class="gate-detail-desc">No Gene Keys reading available.</p>';
    return `
      <div class="gk-spectrum"><span class="gk-shadow">${esc(gk.shadow)}</span><span class="gk-arrow">→</span><span class="gk-gift">${esc(gk.gift)}</span><span class="gk-arrow">→</span><span class="gk-siddhi">${esc(gk.siddhi)}</span></div>
      <p class="gate-detail-desc">${esc(gk.description)}</p>
      <p class="lens-note">Gene Key ${gateNum} · the Shadow → Gift → Siddhi spectrum (Richard Rudd's evolution of Human Design).</p>`;
  }

  // Human Design (default)
  const desc = GATE_DESCRIPTIONS[gateNum];
  const lineHtml = lines.map(l => {
    const ld = LINE_DESCRIPTIONS[gateNum]?.[l];
    return ld ? `<div class="gate-detail-line"><strong>Line ${l} · ${esc(ld.keynote)}</strong><p>${esc(ld.description)}</p></div>` : '';
  }).join('');
  return `
    ${desc ? `<div class="gate-detail-keynote">${esc(desc.keynote)}</div>` : ''}
    ${desc ? `<p class="gate-detail-desc">${esc(desc.description)}</p>` : ''}
    ${lineHtml ? `<div class="gate-detail-lines">${lineHtml}</div>` : ''}`;
}

function closeDetail() {
  const detail = document.getElementById('gate-detail');
  detail.classList.add('hidden');
  document.body.classList.remove('modal-open');
  bodygraphApi?.setPinned?.(null);
  detailHistory = [];
  currentDetail = null;
}

function goBack() {
  const prev = detailHistory.pop();
  if (!prev) return closeDetail();
  if (prev.kind === 'gate') showGateDetail(prev.id, false);
  else showCenterDetail(prev.id, false);
}

function detailNav() {
  const backBtn = detailHistory.length > 0
    ? `<button class="gate-detail-back">← Back</button>`
    : `<span></span>`;
  return `
    <span class="gate-detail-handle" aria-hidden="true"></span>
    <div class="gate-detail-nav-buttons">
      ${backBtn}
      <button class="gate-detail-close" title="Close">&times;</button>
    </div>`;
}

function fitSheetHeight(card, prevH = null) {
  if (window.innerWidth > 768) return;
  const maxH = window.innerHeight * 0.82;
  const minH = window.innerHeight * 0.35;
  const navH = card.querySelector('.gate-detail-nav')?.offsetHeight ?? 0;
  const bodyH = card.querySelector('.gate-detail-body')?.scrollHeight ?? card.scrollHeight;
  const targetH = Math.min(Math.max(navH + bodyH + 20, minH), maxH);
  if (prevH != null) {
    card.style.transition = 'none';
    card.style.height = prevH + 'px';
    card.offsetHeight; // force reflow
    card.style.transition = 'height 260ms cubic-bezier(0.4, 0, 0.2, 1)';
  }
  card.style.height = targetH + 'px';
}

export function showGateDetail(gateNum, pushHistory = true) {
  if (!current) return;
  if (pushHistory && currentDetail) detailHistory.push(currentDetail);
  currentDetail = { kind: 'gate', id: gateNum };
  const { chart } = current;
  const detail = document.getElementById('gate-detail');
  const prevH = !detail.classList.contains('hidden') && window.innerWidth <= 768
    ? detail.querySelector('.gate-detail-card')?.offsetHeight ?? null : null;
  const desc = GATE_DESCRIPTIONS[gateNum];
  const gate = GATES[gateNum];

  const acts = [];
  const lineTag = (line) => LINE_NAMES[line] ? ` — Line ${line}, the ${LINE_NAMES[line]}` : '';
  for (const [planet, g] of Object.entries(chart.gates.design)) {
    if (g?.gate === gateNum) acts.push(`<span class="bg-tt-design">${PLANET_GLYPHS[planet]} Design ${PLANET_NAMES[planet]} — ${gateNum}.${g.line}${lineTag(g.line)}</span>`);
  }
  for (const [planet, g] of Object.entries(chart.gates.personality)) {
    if (g?.gate === gateNum) acts.push(`<span class="bg-tt-personality">${PLANET_GLYPHS[planet]} Personality ${PLANET_NAMES[planet]} — ${gateNum}.${g.line}${lineTag(g.line)}</span>`);
  }

  const inChannels = (chart.channels || []).filter(ch => ch.gates.includes(gateNum));
  const channelHtml = inChannels.map(ch => {
    const key = ch.gates.join('-');
    const chDesc = CHANNEL_DESCRIPTIONS[key];
    return `
      <div class="gate-detail-channel">
        <strong>Channel of ${esc(ch.name)} (${key})</strong>
        <span class="circuit-badge ${esc(ch.circuit)}">${esc(ch.circuit)}</span>
        ${chDesc ? `<p>${esc(chDesc.whenDefined)}</p>` : ''}
      </div>
    `;
  }).join('');

  const isActive = acts.length > 0;
  detail.innerHTML = `
    <div class="gate-detail-card">
      <div class="gate-detail-nav">${detailNav()}</div>
      <div class="gate-detail-body">
        <div class="detail-label">Gate ${gateNum}</div>
        <div class="detail-name">${gate ? esc(gate.name) : 'Gate ' + gateNum}</div>
        ${acts.length ? `<div class="gate-detail-acts">${acts.join('<br>')}</div>` : '<p class="gate-detail-inactive">Not activated in this chart.</p>'}
        <div class="lens-switch">${LENSES.map(([k, label]) => `<button type="button" data-lens="${k}" class="${k === currentLens ? 'active' : ''}">${label}</button>`).join('')}</div>
        <div id="lens-content">${renderLens(gateNum)}</div>
        ${isActive && channelHtml ? channelHtml : ''}
        ${desc?.harmonic ? `<p class="gate-detail-harmonic">Harmonic gate: <button class="gate-link" data-gate="${desc.harmonic}">Gate ${desc.harmonic}</button>${chart.gates.all.includes(desc.harmonic) ? ' (active — channel formed)' : ' (open — you meet this energy in others)'}</p>` : ''}
      </div>
    </div>
  `;
  detail.classList.remove('hidden');
  document.body.classList.add('modal-open');
  fitSheetHeight(detail.querySelector('.gate-detail-card'), prevH);
  bodygraphApi?.setPinned?.({ kind: 'gate', id: gateNum });
  detail.querySelector('.gate-detail-back')?.addEventListener('click', goBack);
  detail.querySelector('.gate-detail-close').addEventListener('click', closeDetail);
  detail.querySelectorAll('.lens-switch button').forEach(btn => btn.addEventListener('click', () => {
    currentLens = btn.dataset.lens;
    detail.querySelectorAll('.lens-switch button').forEach(b => b.classList.toggle('active', b.dataset.lens === currentLens));
    document.getElementById('lens-content').innerHTML = renderLens(gateNum);
  }));
  detail.querySelectorAll('.gate-link').forEach(btn =>
    btn.addEventListener('click', () => showGateDetail(parseInt(btn.dataset.gate))));
  detail.querySelector('.gate-detail-close')?.focus({ preventScroll: true });
}

// ==========================================
// Center detail (from bodygraph / centers-panel clicks)
// ==========================================
/** centerKey -> the rich center object, tagged with its defined/undefined/open status. */
function centerObjects() {
  const ce = current.chart.centers;
  const map = {};
  for (const c of ce.defined) map[c.key] = { ...c, status: 'defined' };
  for (const c of ce.undefined) map[c.key] = { ...c, status: c.status || 'undefined' };
  for (const c of ce.open) map[c.key] = { ...c, status: c.status || 'open' };
  return map;
}

export function showCenterDetail(centerKey, pushHistory = true) {
  if (!current) return;
  if (pushHistory && currentDetail) detailHistory.push(currentDetail);
  currentDetail = { kind: 'center', id: centerKey };
  const { chart } = current;
  const c = centerObjects()[centerKey];
  if (!c) return;
  const detail = document.getElementById('gate-detail');
  const prevH = !detail.classList.contains('hidden') && window.innerWidth <= 768
    ? detail.querySelector('.gate-detail-card')?.offsetHeight ?? null : null;
  const status = c.status;
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const meaning = status === 'defined' ? (c.definedMeaning || c.pressure)
    : status === 'undefined' ? c.undefinedMeaning : c.openMeaning;

  // Gates that live in this center, active ones marked and clickable.
  const activeSet = new Set(chart.gates.all);
  const gatesIn = Object.keys(GATES).map(Number)
    .filter(g => GATES[g].center === centerKey).sort((a, b) => a - b);
  const gateChips = gatesIn.map(g =>
    `<button class="gate-chip ${activeSet.has(g) ? 'active' : ''}" data-gate="${g}" title="Gate ${g}${GATES[g]?.name ? ' — ' + esc(GATES[g].name) : ''}">${g}</button>`).join('');

  // Channels touching this center, marked defined when they're active in the chart.
  const definedKeys = new Set(chart.channels.map(ch => ch.gates.join('-')));
  const touching = CHANNELS.filter(ch => ch.centers?.includes(centerKey));
  const channelHtml = touching.length ? `
    <div class="center-detail-section">
      <span class="cd-label">Channels through here</span>
      <div class="cd-channels">
        ${touching.map(ch => {
          const key = ch.gates.join('-');
          const on = definedKeys.has(key);
          return `<span class="cd-channel ${on ? 'on' : ''}">${esc(ch.name)} <span class="cd-channel-gates">${key}</span></span>`;
        }).join('')}
      </div>
    </div>` : '';

  detail.innerHTML = `
    <div class="gate-detail-card center-detail-card" data-center="${centerKey}">
      <div class="gate-detail-nav">${detailNav()}</div>
      <div class="gate-detail-body">
        <div class="detail-label">${esc(c.name)}</div>
        <div class="detail-name">${esc(c.theme || c.name)}</div>
        <div class="center-detail-head">
          <span class="center-status ${status}">${statusLabel}</span>
          <span class="center-detail-theme">${esc(c.theme || '')}${c.biological ? ` · ${esc(c.biological)}` : ''}</span>
        </div>
        <p class="gate-detail-desc">${esc(meaning || '')}</p>
        ${status !== 'defined' && c.notSelfQuestion ? `<p class="center-notself">${esc(c.notSelfQuestion)}</p>` : ''}
        <div class="center-detail-section">
          <span class="cd-label">Gates here</span>
          <div class="gate-chip-row">${gateChips}</div>
        </div>
        ${channelHtml}
      </div>
    </div>
  `;
  detail.classList.remove('hidden');
  document.body.classList.add('modal-open');
  fitSheetHeight(detail.querySelector('.gate-detail-card'), prevH);
  bodygraphApi?.setPinned?.({ kind: 'center', id: centerKey });
  detail.querySelector('.gate-detail-back')?.addEventListener('click', goBack);
  detail.querySelector('.gate-detail-close').addEventListener('click', closeDetail);
  detail.querySelectorAll('.gate-chip[data-gate]').forEach(btn => {
    btn.addEventListener('click', () => showGateDetail(parseInt(btn.dataset.gate)));
    wireRowHover(btn, parseInt(btn.dataset.gate));
  });
  detail.querySelector('.gate-detail-close')?.focus({ preventScroll: true });
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
    <div class="center-card ${status}" data-center="${c.key}" tabindex="0" role="button" aria-label="${esc(c.name)} center, ${status}">
      <div class="center-status ${status}">${status === 'defined' ? 'Defined' : status === 'undefined' ? 'Undefined' : 'Open'}</div>
      <div class="center-name">${esc(c.name)}</div>
      <p>${esc(status === 'defined' ? (c.definedMeaning || c.pressure) : status === 'undefined' ? c.undefinedMeaning : c.openMeaning)}</p>
      ${extra}
    </div>
  `;
  const notSelf = c => `<p class="center-notself">${esc(c.notSelfQuestion)}</p>`;

  container.innerHTML = `
    <div class="panel-title">Centers (${chart.centers.definedNames.length} defined · ${chart.centers.undefinedNames.length} undefined · ${chart.centers.openNames.length} open)</div>
    <p class="panel-intro">Defined centers are consistent energy you radiate. Undefined and open centers are where you take in — and amplify — the energy around you; they're your deepest learning. Click any center to see it on your body.</p>
    ${chart.centers.defined.map(c => card(c, 'defined')).join('')}
    ${chart.centers.undefined.map(c => card(c, 'undefined', notSelf(c))).join('')}
    ${chart.centers.open.map(c => card(c, 'open', notSelf(c))).join('')}
  `;
  container.querySelectorAll('.center-card[data-center]').forEach(el => {
    el.addEventListener('click', () => showCenterDetail(el.dataset.center));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showCenterDetail(el.dataset.center); } });
    wireCenterHover(el, el.dataset.center);
  });
}

function renderChannelsPanel(container) {
  const { chart } = current;
  if (chart.channels.length === 0) {
    container.innerHTML = `
      <div class="panel-title">Channels</div>
      <p>No defined channels — as a Reflector, all of your gates are "hanging" gates that complete through the people and transits around you.</p>
    `;
    return;
  }

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
      <div class="channel-item" data-gate="${ch.gates[0]}" onclick="this.classList.toggle('expanded')">
        <div class="channel-name">
          ${esc(ch.name)} (${key})
          <span class="circuit-badge ${esc(ch.circuit)}">${esc(ch.circuit)}</span>
        </div>
        <div class="channel-meta">${esc(ch.theme)} · ${esc(ch.centers.join(' ↔ '))}</div>
        ${desc ? `<div class="gate-description">${esc(desc.description)}<br><br><em>${esc(desc.whenDefined)}</em></div>` : ''}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="panel-title">Channels (${chart.channels.length} defined)</div>
    ${channelsHtml}
    ${hanging.length ? `
      <div class="panel-title" style="margin-top:20px">Hanging Gates (${hanging.length})</div>
      <p class="panel-intro">Active gates waiting for their harmonic partner — you're drawn to people who carry the other half.</p>
      <div class="hanging-gates">
        ${hanging.map(h => `<button class="gate-pill" data-gate="${h.gate}">Gate ${h.gate} <span class="gate-pill-partner">seeks ${h.partners.join(' · ')}</span></button>`).join('')}
      </div>
    ` : ''}
  `;
  container.querySelectorAll('.gate-pill').forEach(btn => {
    btn.addEventListener('click', () => showGateDetail(parseInt(btn.dataset.gate)));
    wireRowHover(btn, parseInt(btn.dataset.gate));
  });
  container.querySelectorAll('.channel-item[data-gate]').forEach(item =>
    wireRowHover(item, parseInt(item.dataset.gate)));
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
      <div class="gate-item" data-gate="${gateNum}">
        <div class="gate-name">Gate ${gateNum}: ${esc(desc?.keynote || GATES[gateNum]?.name || '')}</div>
        <div class="gate-meta">${acts.join(' ')}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="panel-title">Active Gates (${allGates.length})</div>
    <p class="panel-intro"><span class="act-design">Red = Design</span> (unconscious, body) · <span class="act-personality">Black = Personality</span> (conscious, mind). Click a gate for detail.</p>
    ${gatesHtml}
  `;
  container.querySelectorAll('.gate-item').forEach(item => {
    item.addEventListener('click', () => showGateDetail(parseInt(item.dataset.gate)));
    wireRowHover(item, parseInt(item.dataset.gate));
  });
}

function renderPlanetsPanel(container) {
  const { chart } = current;
  // Substructure tooltip: gate.line then color/tone/base (the 6/6/6/5 layers)
  const sub = (g) => g && g.color
    ? `Color ${g.color} · Tone ${g.tone} · Base ${g.base}`
    : '';
  const subCell = (g) => g && g.color ? `${g.color}.${g.tone}.${g.base}` : '';
  const rows = PLANET_ORDER.map(planet => {
    const d = chart.gates.design[planet];
    const p = chart.gates.personality[planet];
    return `
      <div class="planet-table-row">
        <span class="planet-cell act-design" data-gate="${d ? d.gate : ''}" title="${esc(sub(d))}">${d ? `${d.gate}.${d.line}` : '—'}</span>
        <span class="planet-cell-sub" title="Color · Tone · Base">${subCell(d)}</span>
        <span class="planet-cell-glyph" title="${esc(PLANET_NAMES[planet])}">${PLANET_GLYPHS[planet]}</span>
        <span class="planet-cell-name">${esc(PLANET_NAMES[planet])}</span>
        <span class="planet-cell-sub" title="Color · Tone · Base">${subCell(p)}</span>
        <span class="planet-cell act-personality" data-gate="${p ? p.gate : ''}" title="${esc(sub(p))}">${p ? `${p.gate}.${p.line}` : '—'}</span>
      </div>
    `;
  }).join('');

  const dDate = chart.positions?.design?.date;
  container.innerHTML = `
    <div class="panel-title">Planetary Activations</div>
    <p class="panel-intro">Each planet activates a gate and line. Design (red) was calculated ~88 days before birth${dDate ? ` (${esc(dDate)})` : ''} — your unconscious, body-level themes. Personality (black) is the moment of birth — who you know yourself to be.</p>
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
  container.querySelectorAll('.planet-cell[data-gate]').forEach(cell => {
    const g = parseInt(cell.dataset.gate);
    if (g) {
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => showGateDetail(g));
      wireRowHover(cell, g);
    }
  });
}

function renderVariablePanel(container) {
  const v = current.chart.variable;
  if (!v) {
    container.innerHTML = '<div class="panel-title">Variable</div><p>Variable data unavailable.</p>';
    return;
  }
  const arrowSymbol = (dir) => dir === 'left' ? '◀' : '▶';
  const card = (slot, label, sub) => `
    <div class="arrow-card">
      <div class="arrow-direction">${arrowSymbol(slot.arrow)} <span class="arrow-side">${slot.arrow === 'left' ? 'Left — focused' : 'Right — receptive'}</span></div>
      <div class="arrow-label">${label}</div>
      <div class="arrow-type">${esc(slot.name)}</div>
      <div class="arrow-desc">${esc(slot.description)}</div>
      <div class="arrow-meta">Color ${slot.color} · Tone ${slot.tone}</div>
      ${sub || ''}
    </div>
  `;
  container.innerHTML = `
    <div class="panel-title">Variable — ${esc(v.notation)}</div>
    <p class="panel-intro">The four arrows describe how your body and mind are tuned: how to eat, where to thrive, how you see, and what moves you. Subtle, advanced territory — explore slowly.</p>
    <div class="variable-grid">
      ${card(v.determination, 'Determination (Digestion)', v.determination.cognition ? `<div class="arrow-desc" style="margin-top:8px"><strong>Cognition:</strong> ${esc(v.determination.cognition.name)} — ${esc(v.determination.cognition.description)}</div>` : '')}
      ${card(v.environment, 'Environment')}
      ${card(v.perspective, 'Perspective (View)')}
      ${card(v.motivation, 'Motivation')}
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
            <div class="foundation-item">
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
    <div class="panel-heading">${esc(cross.fullName || cross.name)}</div>
    <p>${esc(cross.angleName || '')}${quarter ? ` · Quarter of ${esc(quarter)}` : ''}${cross.theme ? ' — ' + esc(cross.theme) : ''}</p>
    <p class="panel-intro" style="margin-top:8px">Your cross is the life theme carried by your four primary gates — roughly 70% of the chart's energy. It unfolds over a lifetime; you don't have to do anything to live it.</p>
    <div style="margin-top:12px">
      <div class="foundation-grid">
        ${cross.gates.map((gate, i) => `
          <div class="foundation-item foundation-clickable" data-gate="${gate}">
            <div class="label">${labels[i]}</div>
            <div class="value">Gate ${gate}</div>
            <div class="detail">${esc(cross.gateNames?.[i] || '')}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ${geneKeysHtml}
  `;
  container.querySelectorAll('.foundation-clickable').forEach(item => {
    item.addEventListener('click', () => showGateDetail(parseInt(item.dataset.gate)));
    wireRowHover(item, parseInt(item.dataset.gate));
  });
}

export function getCurrentChart() {
  return current;
}
