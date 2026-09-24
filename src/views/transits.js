/**
 * Transits view — today's (or any date's) planetary weather over the
 * natal chart, with the transit gates ringed on a bodygraph.
 */

import { calculateHDTransits, calculateTransitGates } from 'natalengine';
import { renderBodygraph } from '../bodygraph.js';
import { buildTransitGraph } from '../lib/transit-graph.js';
import { renderTransitLegend, renderTransitSummary, highlightTransitRows } from './transit-presentation.js';

import { getCurrentChart, showTransitDetail } from './chart.js';

let transitDetailContext = null;

export function setupTransitView() {
  document.getElementById('transits-view').addEventListener('click', event => {
    const button = event.target.closest('[data-transit-detail]');
    if (button && transitDetailContext) {
      const kind = button.dataset.transitDetail;
      showTransitDetail(kind, kind === 'gate' ? Number(button.dataset.id) : button.dataset.id, transitDetailContext);
    }

  });
  const previewDetail = event => {
    if (event.pointerType === 'touch') return;
    const button = event.target.closest('[data-transit-detail]');
    if (!button) return;
    const kind = button.dataset.transitDetail;
    transitDetailContext?.api?.highlightSelection({ kind, id: kind === 'gate' ? Number(button.dataset.id) : button.dataset.id });
  };
  const clearPreview = event => {
    const button = event.target.closest('[data-transit-detail]');
    if (button && !button.contains(event.relatedTarget)) transitDetailContext?.api?.highlightSelection(null);
  };
  const view = document.getElementById('transits-view');
  view.addEventListener('pointerover', previewDetail);
  view.addEventListener('focusin', previewDetail);
  view.addEventListener('pointerout', clearPreview);
  view.addEventListener('focusout', clearPreview);
  document.querySelectorAll('input[name="transit-mode"]').forEach(input => input.addEventListener('change', renderTransits));
  const dateInput = document.getElementById('transit-date');
  const todayBtn = document.getElementById('transit-today');

  dateInput.value = new Date().toISOString().split('T')[0];

  dateInput.addEventListener('change', renderTransits);
  todayBtn.addEventListener('click', () => {
    dateInput.value = new Date().toISOString().split('T')[0];
    renderTransits();
  });
}

export function renderTransits() {
  const current = getCurrentChart();
  if (!current) return;
  transitDetailContext = null;
  const dateInput = document.getElementById('transit-date');
  const date = dateInput.value || new Date().toISOString().split('T')[0];

  const overlay = calculateHDTransits(current.chart, date);
  const transitGates = Object.values(calculateTransitGates(date)?.gates || {})
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
      onGateClick: gate => showTransitDetail('gate', gate, context),
      onCenterClick: center => showTransitDetail('center', center, context),
      onHighlight: highlightTransitRows
    });
  }

  renderTransitContent(overlay, date);
}

export function renderTransitContent(overlay, date = null) {
  const current = getCurrentChart();
  const mode = document.querySelector('input[name="transit-mode"]:checked').value;
  renderTransitSummary(overlay, buildTransitGraph(current.chart, overlay.transitGates, mode),
    document.getElementById('transit-status')?.textContent || `${date} · 12:00 UTC`);
}
