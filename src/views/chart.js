/**
 * Chart view — bodygraph + foundation + tabbed detail panels.
 */

import {
  GATES,
  CHANNELS,
  LINE_NAMES
} from 'natalengine';
import { GATE_DESCRIPTIONS, LINE_DESCRIPTIONS, CHANNEL_DESCRIPTIONS, HEXAGRAM_DESCRIPTIONS, GENE_KEY_DESCRIPTIONS, contentText, crossName, geneKeyTerm } from '../lib/content.js';
import { t, formatDisplay, countLabel } from '../lib/i18n.js';
import {
  typeName, strategy, notSelf, signature, authorityName, profileName,
  definitionName, centerName, gateName, channelName, circuitName,
  planetName, lineName, variable, cognition, typeDescription, hexagramName
} from '../lib/vocabulary.js';


const humanList = items => formatDisplay('list', items);

import { renderBodygraph, PLANET_ORDER, PLANET_GLYPHS } from '../bodygraph.js';
import { TRANSIT_SOURCE_LABELS } from '../lib/transit-graph.js';
import { openDetailDialog, closeDetailDialog } from '../lib/detail-dialog.js';
import { esc, formatBirth } from '../lib/format.js';
import { birthToParams, connectionUrl } from '../lib/share.js';

let current = null; // { birth, chart, geneKeys }
let bodygraphApi = null;
let detailHistory = []; // stack of { kind, id } for modal back-navigation
let currentDetail = null;
let detailContext = null;
const detailGraph = () => detailContext?.api || bodygraphApi;
let currentOnShare = null;

const TYPE_COLORS = {
  'Generator': 'var(--generator)',
  'Manifesting Generator': 'var(--manifesting-generator)',
  'Manifestor': 'var(--manifestor)',
  'Projector': 'var(--projector)',
  'Reflector': 'var(--reflector)'
};

export function refreshChartLanguage() {
  if (!current) return;
  const tab = document.querySelector('.panel-tab.active')?.dataset.panel || 'centers';
  const detail = document.getElementById('gate-detail');
  const open = currentDetail && !detail.classList.contains('hidden');
  const selected = open ? { ...currentDetail } : null;
  const history = detailHistory.map(item => ({ ...item }));
  const lens = currentLens;
  const context = detailContext;
  // A language change is not a close action: preserve feature-owned timing state.
  renderChartView(current, { onShare: currentOnShare, preserveOtherDialog: true });
  document.querySelectorAll('.panel-tab').forEach(button => button.classList.toggle('active', button.dataset.panel === tab));
  renderPanelContent(tab);
  if (selected) {
    detailHistory = history;
    currentLens = lens;
    detailContext = context;
    if (selected.kind === 'gate') showGateDetail(selected.id, false);
    else if (selected.kind === 'channel') showTransitChannelDetail(selected.id, false);
    else showCenterDetail(selected.id, false);
  }
}

export function renderChartView(data, { onShare, preserveOtherDialog = false } = {}) {
  if (!preserveOtherDialog) closeDetailDialog();
  current = data;
  currentOnShare = onShare;
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
    <div><span class="type-badge">${esc(typeName(chart.type.name))}</span></div>
    <div class="type-detail">${esc(chart.profile.numbers)} ${esc(profileName(chart.profile.numbers))} · ${esc(authorityName(chart.authority.name))} · ${esc(definitionName(chart.definition))}</div>
    <div class="type-birthline">${esc(birthLine)}${birth.timeUnknown ? ` · <em>${t('time unknown — chart uses noon')}</em>` : ''}</div>
    <div class="type-strategy">${t('Strategy:')} ${esc(strategy(chart.type.name))}</div>
    <p class="type-plain">${esc(typeDescription(chart.type.name))}</p>
    <div class="banner-actions">
      <button id="share-chart" class="btn-secondary btn-small">${t('Copy chart link')}</button>
      <button id="save-image" class="btn-secondary btn-small">${t('Save image')}</button>
      <button id="invite-compare" class="btn-secondary btn-small">${t('Invite to compare')}</button>
    </div>
  `;
  document.getElementById('share-chart').addEventListener('click', async (e) => {
    if (!onShare) return;
    try {
      await onShare();
      e.target.textContent = t('Link copied ✓');
    } catch {
      e.target.textContent = t('Copy blocked — use the address bar URL');
    }
    setTimeout(() => { e.target.textContent = t('Copy chart link'); }, 2500);
  });

  // Download a 9:16 share card (Reels / Stories / TikTok), rendered by the
  // Worker's /og endpoint. (No-op offline / on the static mirror.)
  document.getElementById('save-image').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.textContent = t('Preparing…');
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
      btn.textContent = t('Saved ✓');
    } catch {
      btn.textContent = t('Image unavailable here');
    }
    setTimeout(() => { btn.textContent = t('Save image'); }, 2500);
  });

  // Dyad loop: copy a "compare designs with me" link. Whoever opens it goes
  // straight to their connection chart against this person.
  document.getElementById('invite-compare').addEventListener('click', async (e) => {
    const btn = e.target;
    try {
      await navigator.clipboard.writeText(connectionUrl(birth));
      btn.textContent = t('Invite copied ✓');
    } catch {
      btn.textContent = t('Copy blocked — use the address bar');
    }
    setTimeout(() => { btn.textContent = t('Invite to compare'); }, 2500);
  });

  // --- Bodygraph ---
  rerenderBodygraph();

  // --- Foundation + default tab ---
  renderFoundation(chart, data.sensitivity, birth);
  const activeTab = document.querySelector('.panel-tab.active');
  renderPanelContent(activeTab ? activeTab.dataset.panel : 'centers');
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
  el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') detailGraph()?.highlightGate?.(gateNum); });
  el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') detailGraph()?.highlightGate?.(null); });
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
        <span>${t('No birth time — this chart is a best guess using noon. Your <strong>Type, Authority and Profile</strong> can change with the real time, so treat this as a starting point until you find it (birth certificates and baby books are the usual sources).')}</span>
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
        <span>${t('Solid chart — even if your birth time were off by 15 minutes, nothing here would change.')}</span>
      </div>`
      : `
      <div class="reliability reliability-soft">
        <span class="reliability-dot"></span>
        <span>${t("Your chart is solid. One fine detail — your <strong>{detail}</strong> — sits right on a line, so it's the only thing a birth time off by 15+ minutes could nudge. Everything else holds no matter what. If your time came from a birth certificate, even that is settled.", { detail: esc(humanList(sensitivity.shifts.map(item => formatDisplay('sensitivity', item)))) })}</span>
      </div>`;
  }
  const crossDisplay = chart.incarnationCross
    ? crossName(chart.incarnationCross)
    : 'Unknown';
  const circuitDominant = chart.circuitAnalysis?.dominant;
  const circuitText = circuitDominant
    ? formatDisplay('circuitSummary', circuitName(circuitDominant.name), countLabel(circuitDominant.channelCount, '{count} channel', '{count} channels'))
    : t('None');

  panel.innerHTML = `
    <div class="panel-title">${t('Foundation')}</div>
    ${reliabilityHtml}
    <div class="foundation-grid">
      <div class="foundation-item">
        <div class="label">${t('Type')}</div>
        <div class="value">${esc(typeName(chart.type.name))}</div>
        <div class="detail">${esc(contentText(chart.type.description))}</div>
      </div>
      <div class="foundation-item">
        <div class="label">${t('Strategy')}</div>
        <div class="value">${esc(strategy(chart.type.name))}</div>
        <div class="detail">${t('Signature:')} ${esc(signature(chart.type.name))} · ${t('Not-Self:')} ${esc(notSelf(chart.type.name))}</div>
      </div>
      <div class="foundation-item">
        <div class="label">${t('Authority')}</div>
        <div class="value">${esc(authorityName(chart.authority.name))}</div>
        <div class="detail">${esc(contentText(chart.authority.description))}</div>
      </div>
      <div class="foundation-item">
        <div class="label">${t('Profile')}</div>
        <div class="value">${esc(chart.profile.numbers)} ${esc(profileName(chart.profile.numbers))}</div>
        <div class="detail">${esc(contentText(chart.profile.theme))}</div>
      </div>
      <div class="foundation-item">
        <div class="label">${t('Definition')}</div>
        <div class="value">${esc(definitionName(chart.definition))}</div>
        <div class="detail">${countLabel(chart.centers.definedNames.length, '{count} defined center', '{count} defined centers')}, ${countLabel(chart.channels.length, '{count} channel', '{count} channels')}</div>
      </div>
      <div class="foundation-item">
        <div class="label">${t('Incarnation Cross')}</div>
        <div class="value">${esc(crossDisplay)}</div>
        <div class="detail">${t('Gates')} ${chart.incarnationCross?.gates?.join(' / ') || '—'}</div>
      </div>
      <div class="foundation-item">
        <div class="label">${t('Dominant Circuit')}</div>
        <div class="value">${esc(circuitText)}</div>
        <div class="detail">${circuitDominant ? esc(contentText(circuitDominant.theme || '')) : t('No defined channels')}</div>
      </div>
      <div class="foundation-item">
        <div class="label">${t('Variable')}</div>
        <div class="value">${esc(current.chart.variable?.notation || '—')}</div>
        <div class="detail">${t('Determination · Environment · Perspective · Motivation')}</div>
      </div>
    </div>
  `;
}

// ==========================================
// Gate detail (from bodygraph / list clicks)
// ==========================================
let currentLens = 'hd';
const lenses = () => [['hd', t('Human Design')], ['iching', t('I Ching')], ['gk', t('Gene Keys')]];

function gateActiveLines(gateNum, chart) {
  const s = new Set();
  for (const g of Object.values(chart.gates.design)) if (g?.gate === gateNum) s.add(g.line);
  for (const g of Object.values(chart.gates.personality)) if (g?.gate === gateNum) s.add(g.line);
  return [...s].sort((a, b) => a - b);
}

/** The interpretive body of the gate card, in the currently selected tradition. */
function renderLens(gateNum) {
  const chart = current.chart;
  const lines = [...new Set([
    ...(detailContext?.mode === 'transit-only' ? [] : gateActiveLines(gateNum, chart)),
    ...Object.values(detailContext?.transitGates || {}).filter(g => g?.gate === gateNum).map(g => g.line)
  ])].sort((a, b) => a - b);

  if (currentLens === 'iching') {
    const hx = HEXAGRAM_DESCRIPTIONS[gateNum];
    if (!hx) return `<p class="gate-detail-desc">${t('No I Ching reading available.')}</p>`;
    const lineHtml = lines.map(l => hx.lines?.[l]
      ? `<div class="gate-detail-line"><strong>${t('Line {line}', { line: l })}</strong><p>${esc(hx.lines[l])}</p></div>` : '').join('');
    return `
      <div class="gate-detail-keynote">${t('Hexagram {gate}', { gate: gateNum })} · ${esc(hexagramName(gateNum))}</div>
      <p class="gate-detail-desc">${esc(hx.meaning)}</p>
      ${lineHtml ? `<div class="gate-detail-lines">${lineHtml}</div>` : ''}
      <p class="lens-note">${t('The I Ching hexagram this gate is built on — Ra drew Human Design from this classical source.')}</p>`;
  }

  if (currentLens === 'gk') {
    const gk = GENE_KEY_DESCRIPTIONS[gateNum];
    if (!gk) return `<p class="gate-detail-desc">${t('No Gene Keys reading available.')}</p>`;
    return `
      <div class="gk-spectrum"><span class="gk-shadow">${esc(geneKeyTerm(gateNum, 'shadow'))}</span><span class="gk-arrow">→</span><span class="gk-gift">${esc(geneKeyTerm(gateNum, 'gift'))}</span><span class="gk-arrow">→</span><span class="gk-siddhi">${esc(geneKeyTerm(gateNum, 'siddhi'))}</span></div>
      <p class="gate-detail-desc">${esc(gk.description)}</p>
      <p class="lens-note">${t("Gene Key {gate} · the Shadow → Gift → Siddhi spectrum (Richard Rudd's evolution of Human Design).", { gate: gateNum })}</p>`;
  }

  // Human Design (default)
  const desc = GATE_DESCRIPTIONS[gateNum];
  const lineHtml = lines.map(l => {
    const ld = LINE_DESCRIPTIONS[gateNum]?.[l];
    return ld ? `<div class="gate-detail-line"><strong>${t('Line {line}', { line: l })} · ${esc(ld.keynote)}</strong><p>${esc(ld.description)}</p></div>` : '';
  }).join('');
  return `
    ${desc ? `<div class="gate-detail-keynote">${esc(desc.keynote)}</div>` : ''}
    ${desc ? `<p class="gate-detail-desc">${esc(desc.description)}</p>` : ''}
    ${lineHtml ? `<div class="gate-detail-lines">${lineHtml}</div>` : ''}`;
}

function resetDetail() {
  detailGraph()?.setPinned?.(null);
  detailHistory = [];
  currentDetail = null;
  detailContext?.onDetailClose?.();
  detailContext = null;
}

export function showTransitDetail(kind, id, context) {
  closeDetailDialog();
  detailContext = context;
  if (kind === 'gate') showGateDetail(id);
  else if (kind === 'channel') showTransitChannelDetail(id);
  else showCenterDetail(id);
}

// A locale redraw keeps the selected detail, lens and navigation history.
// The controller updates the same context object with the new graph API first.
export function refreshTransitDetail(context) {
  if (!currentDetail || detailContext !== context) return;
  const { kind, id } = currentDetail;
  if (kind === 'gate') showGateDetail(id, false);
  else if (kind === 'channel') showTransitChannelDetail(id, false);
  else showCenterDetail(id, false);
}

function showTransitChannelDetail(id, pushHistory = true) {
  const model = detailContext?.model;
  const channel = CHANNELS.find(ch => ch.gates.join('-') === id);
  if (!model || !channel) return;
  const description = CHANNEL_DESCRIPTIONS[id]?.description;
  if (pushHistory && currentDetail) detailHistory.push(currentDetail);
  currentDetail = { kind: 'channel', id };
  const active = model.channels.some(ch => ch.gates.join('-') === id);
  const detail = document.getElementById('gate-detail');
  detail.innerHTML = `<div class="gate-detail-card"><div class="gate-detail-nav">${detailNav()}</div>
    <div class="gate-detail-body">
      <div class="detail-label">${t('Channel {channel}', { channel: id })}</div><div class="detail-name">${esc(channelName(channel.gates))}</div>
      <span class="circuit-badge transit-source-badge ${active ? model.channelSource(channel) : 'inactive'}">${t(active ? TRANSIT_SOURCE_LABELS[model.channelSource(channel)] : 'No complete channel in this view')}</span>
      <p class="gate-detail-desc">${t(active ? 'Both gates are active, so the full channel is connected in this view.' : 'A full channel needs both gates. At least one is inactive in this view.')}</p>
      ${description ? `<p class="gate-detail-desc transit-channel-description">${esc(contentText(description))}</p>` : ''}
      <div class="transit-channel-gates">${channel.gates.map(g => `<button type="button" class="transit-detail-link" data-channel-gate="${g}" aria-label="${esc(t('Gate {gate} · {source}', { gate: g, source: t(TRANSIT_SOURCE_LABELS[model.gateSource(g)]) }))}">
        <span class="transit-detail-gate"><strong>${t('Gate {gate}', { gate: g })}</strong>${model.transitGates.has(g) ? `<span class="circuit-badge transit-source-badge">${t('Transit')}</span>` : model.gateSource(g) === 'inactive' ? `<span class="circuit-badge transit-source-badge inactive">${t('Inactive')}</span>` : ''}</span>
        <span class="transit-detail-action">${t('View gate details')}</span>
      </button>`).join('')}</div>
      <p class="lens-note">${t('Transit additions do not change your birth chart.')}</p>
    </div></div>`;
  detailContext?.decorateDetail?.(detail, currentDetail);
  openDetailDialog(detail, resetDetail);
  fitSheetHeight(detail.querySelector('.gate-detail-card'));
  detailGraph()?.setPinned?.({ kind: 'channel', id });
  detail.querySelector('.gate-detail-back')?.addEventListener('click', goBack);
  detail.querySelectorAll('[data-channel-gate]').forEach(button => button.addEventListener('click', () => showGateDetail(Number(button.dataset.channelGate))));
}

function goBack() {
  const prev = detailHistory.pop();
  if (!prev) return closeDetailDialog();
  if (prev.kind === 'gate') showGateDetail(prev.id, false);
  else if (prev.kind === 'channel') showTransitChannelDetail(prev.id, false);
  else showCenterDetail(prev.id, false);
}

function detailNav() {
  const backBtn = detailHistory.length > 0
    ? `<button class="gate-detail-back">← ${t('Back')}</button>`
    : `<span></span>`;
  return `
    <span class="gate-detail-handle" aria-hidden="true"></span>
    <div class="gate-detail-nav-buttons">
      ${backBtn}
      <button class="gate-detail-close" title="${t('Close')}">&times;</button>
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

  const acts = [];
  const lineTag = (line) => LINE_NAMES[line]
    ? formatDisplay('lineTag', line, lineName(line))
    : '';
  for (const [planet, g] of Object.entries(chart.gates.design)) {
    if (g?.gate === gateNum) acts.push(`<span class="bg-tt-design">${PLANET_GLYPHS[planet]} ${t('Design')} ${planetName(planet)} — ${gateNum}.${g.line}${lineTag(g.line)}</span>`);
  }
  for (const [planet, g] of Object.entries(chart.gates.personality)) {
    if (g?.gate === gateNum) acts.push(`<span class="bg-tt-personality">${PLANET_GLYPHS[planet]} ${t('Personality')} ${planetName(planet)} — ${gateNum}.${g.line}${lineTag(g.line)}</span>`);
  }

  const transitActs = Object.entries(detailContext?.transitGates || {})
    .filter(([, g]) => g?.gate === gateNum)
    .map(([planet, g]) => `<span>${PLANET_GLYPHS[planet] || ''} ${t('Transit')} ${esc(planetName(planet))} — ${gateNum}.${g.line}${lineTag(g.line)}</span>`);

  const inChannels = (detailContext?.model?.channels || chart.channels || []).filter(ch => ch.gates.includes(gateNum));
  const channelHtml = inChannels.map(ch => {
    const key = ch.gates.join('-');
    const chDesc = CHANNEL_DESCRIPTIONS[key];
    return `
      <div class="gate-detail-channel">
        ${detailContext?.model ? `<button type="button" class="gate-link" data-channel="${key}">${t('Channel {channel}', { channel: key })} · ${esc(channelName(ch.gates))}</button>` : `<strong>${esc(formatDisplay('channelDetail', channelName(ch.gates), key))}</strong>`}
        <span class="circuit-badge ${esc(ch.circuit)}">${esc(circuitName(ch.circuit))}</span>
        ${detailContext?.model ? `<span class="circuit-badge transit-source-badge ${detailContext.model.channelSource(ch)}">${t(TRANSIT_SOURCE_LABELS[detailContext.model.channelSource(ch)])}</span>` : chDesc ? `<p>${esc(chDesc.whenDefined)}</p>` : ''}
      </div>
    `;
  }).join('');

  const isActive = acts.length > 0;
  detail.innerHTML = `
    <div class="gate-detail-card">
      <div class="gate-detail-nav">${detailNav()}</div>
      <div class="gate-detail-body">
        <div class="detail-label">${t('Gate {gate}', { gate: gateNum })}</div>
        <div class="detail-name">${esc(gateName(gateNum))}</div>
        ${detailContext?.mode === 'transit-only' ? '' : acts.length ? `<div class="gate-detail-acts">${detailContext ? `<div class="detail-label">${t('Birth activations')}</div>` : ''}${acts.join('<br>')}</div>` : `<p class="gate-detail-inactive">${t('Not activated in your natal chart.')}</p>`}
        ${detailContext ? `<div class="gate-detail-transits"><div class="detail-label">${t('Transit activations')}</div>${transitActs.length ? transitActs.join('<br>') : t('Not activated by the selected transit.')}</div>` : ''}
        <div class="lens-switch">${lenses().map(([k, label]) => `<button type="button" data-lens="${k}" class="${k === currentLens ? 'active' : ''}">${label}</button>`).join('')}</div>
        <div id="lens-content">${renderLens(gateNum)}</div>
        ${(isActive || detailContext?.model) && channelHtml ? channelHtml : ''}
        ${desc?.harmonic ? `<p class="gate-detail-harmonic">${t('Harmonic gate:')} <button class="gate-link" data-gate="${desc.harmonic}">${t('Gate {gate}', { gate: desc.harmonic })}</button>${t(detailContext?.model ? (detailContext.model.channels.some(ch => ch.gates.includes(gateNum) && ch.gates.includes(desc.harmonic)) ? ' (channel active in this view)' : ' (no complete channel in this view)') : chart.gates.all.includes(desc.harmonic) ? ' (active — channel formed)' : ' (open — you meet this energy in others)')}</p>` : ''}
      </div>
    </div>
  `;
  detailContext?.decorateDetail?.(detail, currentDetail);
  openDetailDialog(detail, resetDetail);
  fitSheetHeight(detail.querySelector('.gate-detail-card'), prevH);
  detailGraph()?.setPinned?.({ kind: 'gate', id: gateNum });
  detail.querySelector('.gate-detail-back')?.addEventListener('click', goBack);
  detail.querySelectorAll('.lens-switch button').forEach(btn => btn.addEventListener('click', () => {
    currentLens = btn.dataset.lens;
    detail.querySelectorAll('.lens-switch button').forEach(b => b.classList.toggle('active', b.dataset.lens === currentLens));
    document.getElementById('lens-content').innerHTML = renderLens(gateNum);
  }));
  detail.querySelectorAll('[data-channel]').forEach(btn => btn.addEventListener('click', () => showTransitChannelDetail(btn.dataset.channel)));
  detail.querySelectorAll('.gate-link[data-gate]').forEach(btn =>
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
  const model = detailContext?.model;
  const definedHere = model?.definedCenters.has(centerKey);
  const natalHere = model?.mode === 'overlay' && model.natalCenters.has(centerKey);
  const status = model ? definedHere ? natalHere ? 'defined' : 'transit-defined' : 'undefined' : c.status;
  const statusLabel = t(model ? natalHere ? 'Defined in birth chart' : definedHere ? model.mode === 'transit-only' ? 'Defined by transits' : 'Defined with transits' : 'Not defined in this view' : status.charAt(0).toUpperCase() + status.slice(1));
  const meaning = contentText(status === 'defined' ? (c.definedMeaning || c.pressure)
    : status === 'undefined' ? c.undefinedMeaning : c.openMeaning);

  // Gates that live in this center, active ones marked and clickable.
  const activeSet = model?.activeGates || new Set(chart.gates.all);
  const gatesIn = Object.keys(GATES).map(Number)
    .filter(g => GATES[g].center === centerKey).sort((a, b) => a - b);
  const gateChips = gatesIn.map(g =>
    `<button class="gate-chip ${activeSet.has(g) ? model?.gateSource(g) === 'transit' ? 'transit-active' : 'active' : ''}" data-gate="${g}" title="${t('Gate {gate}', { gate: g })}${GATES[g]?.name ? ' — ' + esc(gateName(g)) : ''}">${g}</button>`).join('');

  // Channels touching this center, marked defined when they're active in the chart.
  const definedKeys = new Set((model?.channels || chart.channels).map(ch => ch.gates.join('-')));
  const touching = CHANNELS.filter(ch => ch.centers?.includes(centerKey));
  const channelHtml = touching.length ? `
    <div class="center-detail-section">
      <span class="cd-label">${t('Channels through here')}</span>
      <div class="cd-channels">
        ${touching.map(ch => {
          const key = ch.gates.join('-');
          const on = definedKeys.has(key);
          return model ? `<button type="button" class="cd-channel ${on ? 'on' : ''}" data-center-channel="${key}">${esc(channelName(ch.gates))} <span class="cd-channel-gates">${key}</span></button>` : `<span class="cd-channel ${on ? 'on' : ''}">${esc(channelName(ch.gates))} <span class="cd-channel-gates">${key}</span></span>`;
        }).join('')}
      </div>
    </div>` : '';

  detail.innerHTML = `
    <div class="gate-detail-card center-detail-card" data-center="${centerKey}">
      <div class="gate-detail-nav">${detailNav()}</div>
      <div class="gate-detail-body">
        <div class="detail-label">${esc(centerName(centerKey))}</div>
        <div class="detail-name">${esc(contentText(c.theme || c.name))}</div>
        ${model ? `<p class="lens-note">${t(model.mode === 'transit-only' ? 'Transit only · status from the selected time.' : 'Birth chart + transits · hatching marks temporary additions.')}</p>` : ''}
        <div class="center-detail-head">
          <span class="center-status ${status}">${statusLabel}</span>
          <span class="center-detail-theme">${esc(contentText(c.theme || ''))}${c.biological ? ` · ${esc(contentText(c.biological))}` : ''}</span>
        </div>
        <p class="gate-detail-desc">${esc(model ? t(definedHere ? natalHere ? 'This center is already defined in the birth chart.' : 'A complete channel defines this center in the selected view. This does not change your birth chart.' : 'No complete channel defines this center in the selected view.') : meaning || '')}</p>
        ${!model && status !== 'defined' && c.notSelfQuestion ? `<p class="center-notself">${esc(contentText(c.notSelfQuestion))}</p>` : ''}
        <div class="center-detail-section">
          <span class="cd-label">${t('Gates here')}</span>
          <div class="gate-chip-row">${gateChips}</div>
        </div>
        ${channelHtml}
      </div>
    </div>
  `;
  detailContext?.decorateDetail?.(detail, currentDetail);
  openDetailDialog(detail, resetDetail);
  fitSheetHeight(detail.querySelector('.gate-detail-card'), prevH);
  detailGraph()?.setPinned?.({ kind: 'center', id: centerKey });
  detail.querySelector('.gate-detail-back')?.addEventListener('click', goBack);
  detail.querySelectorAll('[data-center-channel]').forEach(btn => btn.addEventListener('click', () => showTransitChannelDetail(btn.dataset.centerChannel)));
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
  const statusLabel = status => t(status === 'defined' ? 'Defined' : status === 'undefined' ? 'Undefined' : 'Open');
  const card = (c, status, extra = '') => `
    <div class="center-card ${status}" data-center="${c.key}" tabindex="0" role="button" aria-label="${esc(formatDisplay('centerAria', centerName(c.key), status, statusLabel(status)))}">
      <div class="center-status ${status}">${statusLabel(status)}</div>
      <div class="center-name">${esc(centerName(c.key))}</div>
      <p>${esc(contentText(status === 'defined' ? (c.definedMeaning || c.pressure) : status === 'undefined' ? c.undefinedMeaning : c.openMeaning))}</p>
      ${extra}
    </div>
  `;
  const notSelf = c => `<p class="center-notself">${esc(contentText(c.notSelfQuestion))}</p>`;

  container.innerHTML = `
    <div class="panel-title">${t('Centers ({defined} defined · {undefined} undefined · {open} open)', { defined: chart.centers.definedNames.length, undefined: chart.centers.undefinedNames.length, open: chart.centers.openNames.length })}</div>
    <p class="panel-intro">${t("Defined centers are consistent energy you radiate. Undefined and open centers are where you take in — and amplify — the energy around you; they're your deepest learning. Click any center to see it on your body.")}</p>
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
      <div class="panel-title">${t('Channels')}</div>
      <p>${t('No defined channels — as a Reflector, all of your gates are "hanging" gates that complete through the people and transits around you.')}</p>
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
          ${esc(channelName(ch.gates))} ${formatDisplay('parentheses', key)}
          <span class="circuit-badge ${esc(ch.circuit)}">${esc(circuitName(ch.circuit))}</span>
        </div>
        <div class="channel-meta">${esc(contentText(ch.theme))} · ${esc(formatDisplay('channelCenters', ch.centers, ch.centers.map(centerName)))}</div>
        ${desc ? `<div class="gate-description">${esc(desc.description)}<br><br><em>${esc(desc.whenDefined)}</em></div>` : ''}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="panel-title">${t('Channels ({count} defined)', { count: chart.channels.length })}</div>
    ${channelsHtml}
    ${hanging.length ? `
      <div class="panel-title" style="margin-top:20px">${t('Hanging Gates ({count})', { count: hanging.length })}</div>
      <p class="panel-intro">${t("Active gates waiting for their harmonic partner — you're drawn to people who carry the other half.")}</p>
      <div class="hanging-gates">
        ${hanging.map(h => `<button class="gate-pill" data-gate="${h.gate}">${t('Gate {gate}', { gate: h.gate })} <span class="gate-pill-partner">${t('seeks')} ${h.partners.join(' · ')}</span></button>`).join('')}
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
        <div class="gate-name">${t('Gate {gate}: {name}', { gate: gateNum, name: esc(desc?.keynote || GATES[gateNum]?.name || '') })}</div>
        <div class="gate-meta">${acts.join(' ')}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="panel-title">${t('Active Gates ({count})', { count: allGates.length })}</div>
    <p class="panel-intro"><span class="act-design">${t('Red = Design')}</span> ${t('(unconscious, body)')} · <span class="act-personality">${t('Black = Personality')}</span> ${t('(conscious, mind). Click a gate for detail.')}</p>
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
    ? t('Color {color} · Tone {tone} · Base {base}', { color: g.color, tone: g.tone, base: g.base })
    : '';
  const subCell = (g) => g && g.color ? `${g.color}.${g.tone}.${g.base}` : '';
  const rows = PLANET_ORDER.map(planet => {
    const d = chart.gates.design[planet];
    const p = chart.gates.personality[planet];
    return `
      <div class="planet-table-row">
        <span class="planet-cell act-design" data-gate="${d ? d.gate : ''}" title="${esc(sub(d))}">${d ? `${d.gate}.${d.line}` : '—'}</span>
        <span class="planet-cell-sub" title="${t('Color · Tone · Base')}">${subCell(d)}</span>
        <span class="planet-cell-glyph" title="${esc(planetName(planet))}">${PLANET_GLYPHS[planet]}</span>
        <span class="planet-cell-name">${esc(planetName(planet))}</span>
        <span class="planet-cell-sub" title="${t('Color · Tone · Base')}">${subCell(p)}</span>
        <span class="planet-cell act-personality" data-gate="${p ? p.gate : ''}" title="${esc(sub(p))}">${p ? `${p.gate}.${p.line}` : '—'}</span>
      </div>
    `;
  }).join('');

  const dDate = chart.positions?.design?.date;
  container.innerHTML = `
    <div class="panel-title">${t('Planetary Activations')}</div>
    <p class="panel-intro">${t('Each planet activates a gate and line. Design (red) was calculated ~88 days before birth{date} — your unconscious, body-level themes. Personality (black) is the moment of birth — who you know yourself to be.', { date: dDate ? esc(formatDisplay('inlineDate', dDate)) : '' })}</p>
    <div class="planet-table">
      <div class="planet-table-row planet-table-head">
        <span class="planet-cell act-design">${t('Design')}</span>
        <span class="planet-cell-sub">c.t.b</span>
        <span></span><span></span>
        <span class="planet-cell-sub">c.t.b</span>
        <span class="planet-cell act-personality">${t('Personality')}</span>
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
    container.innerHTML = `<div class="panel-title">${t('Variable')}</div><p>${t('Variable data unavailable.')}</p>`;
    return;
  }
  const arrowSymbol = (dir) => dir === 'left' ? '◀' : '▶';
  const card = (slot, label, sub) => {
    const [name] = variable(slot);
    const originalTerm = formatDisplay('originalTerm', slot.name);
    return `
    <div class="arrow-card">
      <div class="arrow-direction">${arrowSymbol(slot.arrow)} <span class="arrow-side">${t(slot.arrow === 'left' ? 'Left — focused' : 'Right — receptive')}</span></div>
      <div class="arrow-label">${label}</div>
      <div class="arrow-type">${esc(name)}${originalTerm ? ` <span class="label-soft">${esc(originalTerm)}</span>` : ''}</div>
      <div class="arrow-desc">${esc(contentText(slot.description))}</div>
      <div class="arrow-meta">${t('Color {color} · Tone {tone}', { color: slot.color, tone: slot.tone })}</div>
      ${sub || ''}
    </div>
  `; };
  container.innerHTML = `
    <div class="panel-title">${t('Variable — {notation}', { notation: esc(v.notation) })}</div>
    <p class="panel-intro">${t('The four arrows describe how your body and mind are tuned: how to eat, where to thrive, how you see, and what moves you. Subtle, advanced territory — explore slowly.')}</p>
    <div class="variable-grid">
      ${card(v.determination, t('Determination (Digestion)'), v.determination.cognition ? `<div class="arrow-desc" style="margin-top:8px"><strong>${t('Cognition:')}</strong> ${esc(cognition(v.determination.cognition.name))} ${formatDisplay('separator', 'cognition')} ${esc(contentText(v.determination.cognition.description))}</div>` : '')}
      ${card(v.environment, t('Environment'))}
      ${card(v.perspective, t('Perspective (View)'))}
      ${card(v.motivation, t('Motivation'))}
    </div>
  `;
}

function renderCrossPanel(container) {
  const { chart, geneKeys } = current;
  const cross = chart.incarnationCross;
  if (!cross) {
    container.innerHTML = `<div class="panel-title">${t('Incarnation Cross')}</div><p>${t('Cross data unavailable.')}</p>`;
    return;
  }

  const labels = ['Personality Sun', 'Personality Earth', 'Design Sun', 'Design Earth'];
  const geneKeysHtml = geneKeys ? `
    <div style="margin-top:24px">
      <div class="panel-title">${t('Gene Keys — Activation Sequence')}</div>
      <p class="panel-intro">${t("The same four positions through Richard Rudd's Shadow → Gift → Siddhi lens.")}</p>
      <div class="foundation-grid">
        ${['lifeWork', 'evolution', 'radiance', 'purpose'].map(sphere => {
          const s = geneKeys.activationSequence[sphere];
          return s ? `
            <div class="foundation-item">
              <div class="label">${esc(contentText(s.sphere))}</div>
              <div class="value">${t('Key {key}', { key: esc(s.keyLine || s.key) })}</div>
              <div class="detail">${['shadow', 'gift', 'siddhi'].map(field => esc(geneKeyTerm(s.key, field) || s[field])).join(' → ')}</div>
            </div>
          ` : '';
        }).join('')}
      </div>
    </div>
  ` : '';

  const quarter = GATE_DESCRIPTIONS[chart.gates.personality.sun?.gate]?.quarter;
  container.innerHTML = `
    <div class="panel-title">${t('Incarnation Cross')}</div>
    <div class="panel-heading">${esc(crossName(cross))}</div>
    <p>${esc(contentText(cross.angleName || ''))}${quarter ? ` · ${t('Quarter of {quarter}', { quarter: esc(contentText(quarter)) })}` : ''}${cross.theme ? formatDisplay('separator', 'theme') + esc(contentText(cross.theme)) : ''}</p>
    <p class="panel-intro" style="margin-top:8px">${t("Your cross is the life theme carried by your four primary gates — roughly 70% of the chart's energy. It unfolds over a lifetime; you don't have to do anything to live it.")}</p>
    <div style="margin-top:12px">
      <div class="foundation-grid">
        ${cross.gates.map((gate, i) => `
          <div class="foundation-item foundation-clickable" data-gate="${gate}">
            <div class="label">${t(labels[i])}</div>
            <div class="value">${t('Gate {gate}', { gate })}</div>
            <div class="detail">${esc(gateName(gate))}</div>
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
