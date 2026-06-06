/**
 * Transits view — today's (or any date's) planetary weather over the
 * natal chart, with the transit gates ringed on a bodygraph.
 */

import { calculateHDTransits, calculateTransitGates } from 'natalengine';
import { renderBodygraph } from '../bodygraph.js';
import { esc } from '../lib/format.js';

const plural2 = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
import { getCurrentChart, showGateDetail } from './chart.js';

export function setupTransitView() {
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
  const dateInput = document.getElementById('transit-date');
  const date = dateInput.value || new Date().toISOString().split('T')[0];

  const overlay = calculateHDTransits(current.chart, date);
  const transitGates = Object.values(calculateTransitGates(date)?.gates || {})
    .filter(Boolean)
    .map(g => g.gate);

  // Bodygraph with transit rings
  const graphContainer = document.getElementById('transit-bodygraph');
  if (graphContainer) {
    renderBodygraph(graphContainer, current.chart, {
      planetColumns: false,
      animate: false,
      transitGates,
      onGateClick: showGateDetail
    });
  }

  renderTransitContent(overlay, date);
}

export function renderTransitContent(overlay, date = null) {
  const container = document.getElementById('transit-content');
  const sunGate = overlay.highlights.sun;
  const moonGate = overlay.highlights.moon;

  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = !date || date === todayStr;
  const when = isToday ? 'today' : `on ${date}`;
  const whenCap = isToday ? 'Today' : `On ${date}`;

  // One-line synthesis: lead with the strongest signal instead of data soup
  const strongest = overlay.channelCompletions[0];
  const synthesis = strongest
    ? `${whenCap}, the strongest theme is the <strong>${esc(strongest.channel)}</strong> channel ${strongest.natalGate ? 'completing through your chart' : 'active in the field'} — ${plural2(overlay.stats.channelCompletions, 'channel completion')} in total.`
    : `${whenCap} is a quiet sky for your chart — no transit completes one of your channels, so the weather passes through gently.`;

  const completionsHtml = overlay.channelCompletions.length > 0
    ? overlay.channelCompletions.map(c => `
        <div class="transit-completion ${esc(c.significance)}">
          <div class="completion-title">${esc(c.channel)} (${c.gates.join('-')})</div>
          <div class="completion-detail">
            ${c.natalGate ? `Your Gate ${c.natalGate} is completed by transit Gate ${c.transitGate} (${esc(c.transitPlanet)}).` : `Pure transit channel — both gates carried by the planets ${when}.`}
            <span class="circuit-badge ${esc(c.circuit)}">${esc(c.circuit)}</span>
          </div>
        </div>
      `).join('')
    : '<p style="color:var(--text-secondary)">No channel completions from these transits.</p>';

  const tempCentersHtml = overlay.temporarilyDefinedCenters.length > 0
    ? `<div class="panel-title" style="margin-top:16px">Temporarily Defined Centers</div>` +
      overlay.temporarilyDefinedCenters.map(c => `
        <div class="center-card defined" style="margin-bottom:6px">
          <div class="center-name">${esc(c.centerName)}</div>
          <p>${esc(c.theme)} — usually undefined in your chart, activated ${esc(when)} by transit.</p>
        </div>
      `).join('')
    : '';

  const reinforcedHtml = overlay.reinforcedGates.length > 0
    ? `<div style="margin-top:16px">
        <div class="panel-title">Reinforced Gates (${overlay.reinforcedGates.length})</div>
        ${overlay.reinforcedGates.slice(0, 8).map(g => `
          <div class="gate-item" style="margin-bottom:4px">
            <div class="gate-name">Gate ${g.gate}: ${esc(g.gateName)}</div>
            <div class="gate-meta">${esc(g.meaning)}</div>
          </div>
        `).join('')}
       </div>`
    : '';

  container.innerHTML = `
    <p class="panel-intro" style="font-size:14px">${synthesis}</p>
    <div class="foundation-grid" style="margin-bottom:20px">
      <div class="foundation-item">
        <div class="label">Transit Sun</div>
        <div class="value">Gate ${sunGate.gate}.${sunGate.line}</div>
        <div class="detail">${esc(sunGate.gateName)}${sunGate.reinforcesNatal ? ' — reinforces your natal gate' : ''}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Transit Moon</div>
        <div class="value">Gate ${moonGate.gate}.${moonGate.line}</div>
        <div class="detail">${esc(moonGate.gateName)}${moonGate.reinforcesNatal ? ' — reinforces your natal gate' : ''}</div>
      </div>
    </div>
    <div class="panel-title">Channel Completions (${overlay.stats.channelCompletions})</div>
    <p class="panel-intro">When a transit gate sits opposite one of your hanging gates, the channel completes — you temporarily live that defined energy.</p>
    ${completionsHtml}
    ${tempCentersHtml}
    ${reinforcedHtml}
  `;
}
