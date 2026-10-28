/**
 * Transits view — today's (or any date's) planetary weather over the
 * natal chart, with the transit gates ringed on a bodygraph.
 */

import { calculateHDTransits, calculateTransitGates } from 'natalengine';
import { renderBodygraph } from '../bodygraph.js';
import { esc } from '../lib/format.js';
import { transitInstants, engineTransitArguments, formatTransitOffset } from '../lib/transit-time.js';
import { buildTransitGraph } from '../lib/transit-graph.js';
import { renderTransitLegend, renderTransitSummary, highlightTransitRows } from './transit-presentation.js';

import { registerScope, openDetail, refreshDetail } from '../detail-panel.js';
import { getCurrentChart } from './chart.js';

let transitDetailContext = null; // { transitGates, mode, model, api } of the graph on screen

// Same renderers as the chart, told which gates the sky lights at the chosen time.
registerScope('transit', {
  renderer: 'chart',
  context: () => {
    const current = getCurrentChart();
    return current && transitDetailContext && {
      chart: current.chart, geneKeys: current.geneKeys,
      transit: { activations: transitDetailContext.transitGates, model: transitDetailContext.model }
    };
  },
  onShow: (_entry, result) => transitDetailContext?.api?.setPinned?.(result.pin || null),
  onClose: () => transitDetailContext?.api?.setPinned?.(null)
});

export function setupTransitView() {
  // List items carry data-detail; the panel opens them in the 'transit' scope.
  document.getElementById('transit-content').dataset.detailScope = 'transit';
  const previewDetail = event => {
    if (event.pointerType === 'touch') return;
    const button = event.target.closest('#transit-content [data-detail]');
    if (!button) return;
    const [kind, id] = button.dataset.detail.split(':');
    transitDetailContext?.api?.highlightSelection({ kind, id: kind === 'gate' ? Number(id) : id });
  };
  const clearPreview = event => {
    const button = event.target.closest('#transit-content [data-detail]');
    if (button && !button.contains(event.relatedTarget)) transitDetailContext?.api?.highlightSelection(null);
  };
  const view = document.getElementById('transits-view');
  view.addEventListener('pointerover', previewDetail);
  view.addEventListener('focusin', previewDetail);
  view.addEventListener('pointerout', clearPreview);
  view.addEventListener('focusout', clearPreview);
  document.querySelectorAll('input[name="transit-mode"]').forEach(input => input.addEventListener('change', renderTransits));
  const dateInput = document.getElementById('transit-date');
  const timeInput = document.getElementById('transit-time');
  let zoneInput = document.getElementById('transit-timezone');
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (Intl.supportedValuesOf) {
    const zones = [...new Set(['UTC', localZone, ...Intl.supportedValuesOf('timeZone')])].sort();
    zoneInput.innerHTML = zones.map(zone => `<option value="${esc(zone)}">${esc(zone)}</option>`).join('');
  } else {
    // Older browsers can still resolve a typed IANA zone, even without a zone list.
    const input = document.createElement('input');
    input.id = zoneInput.id;
    input.placeholder = 'e.g. Europe/London';
    input.setAttribute('aria-describedby', 'transit-status');
    zoneInput.replaceWith(input);
    zoneInput = input;
  }

  const setNow = () => {
    const now = new Date();
    dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    timeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zoneInput.tagName === 'SELECT' && ![...zoneInput.options].some(option => option.value === zone)) {
      zoneInput.add(new Option(zone, zone));
    }
    zoneInput.value = zone;
    renderTransits();
  };
  setNow();

  dateInput.addEventListener('change', renderTransits);
  timeInput.addEventListener('change', renderTransits);
  zoneInput.addEventListener('change', renderTransits);
  document.getElementById('transit-choice').addEventListener('change', renderTransits);
  document.getElementById('transit-now').addEventListener('click', setNow);
}

export function renderTransits() {
  const current = getCurrentChart();
  if (!current) return;
  transitDetailContext = null;
  const date = document.getElementById('transit-date').value;
  const time = document.getElementById('transit-time').value;
  const zone = document.getElementById('transit-timezone').value.trim();
  const status = document.getElementById('transit-status');
  const choiceLabel = document.getElementById('transit-choice-label');
  const choice = document.getElementById('transit-choice');
  let matches;
  try {
    matches = transitInstants(date, time, zone);
    if (!matches.length) throw new Error('This local time does not exist in that timezone. Choose another time.');
  } catch (error) {
    status.textContent = error instanceof RangeError ? 'Enter a valid IANA timezone.' : error.message;
    choiceLabel.hidden = true;
    document.getElementById('transit-bodygraph').replaceChildren();
    document.getElementById('transit-content').replaceChildren();
    return;
  }


  const selected = matches.find(m => String(m.instant) === choice.value) || matches[0];
  choiceLabel.hidden = matches.length < 2;
  choice.innerHTML = matches.map(m => `<option value="${m.instant}">${formatTransitOffset(m.offset)} (${new Date(m.instant).toISOString()})</option>`).join('');
  choice.value = String(selected.instant);
  status.textContent = `${date} · ${time} · ${zone} (${formatTransitOffset(selected.offset)}) · ${new Date(selected.instant).toISOString().replace('.000Z', 'Z')}`;
  const [transitDate, engineOffset] = engineTransitArguments(selected.instant);

  const overlay = calculateHDTransits(current.chart, transitDate, engineOffset);
  const transitGates = Object.values(calculateTransitGates(transitDate, engineOffset)?.gates || {})
    .filter(Boolean)
    .map(g => g.gate);

  const mode = document.querySelector('input[name="transit-mode"]:checked').value;
  const model = buildTransitGraph(current.chart, overlay.transitGates, mode);
  renderTransitLegend(mode);

  // Bodygraph colored by activation source
  const graphContainer = document.getElementById('transit-bodygraph');
  if (graphContainer) {
    const context = { transitGates: overlay.transitGates, mode, model };
    transitDetailContext = context;
    context.api = renderBodygraph(graphContainer, current.chart, {
      planetColumns: false,
      animate: false,
      transitGates,
      transitModel: model,
      onGateClick: gate => openDetail('transit', 'gate', gate),
      onCenterClick: center => openDetail('transit', 'center', center),
      onHighlight: highlightTransitRows
    });
  }

  renderTransitContent(overlay, date, time);
  refreshDetail('transit'); // an open panel follows the new time
}

export function renderTransitContent(overlay, date = null) {
  const current = getCurrentChart();
  const mode = document.querySelector('input[name="transit-mode"]:checked').value;
  renderTransitSummary(overlay, buildTransitGraph(current.chart, overlay.transitGates, mode),
    document.getElementById('transit-status')?.textContent || `${date} · 12:00 UTC`);

}
