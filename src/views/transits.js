/**
 * Transits view — today's (or any date's) planetary weather over the
 * natal chart, with the transit gates ringed on a bodygraph.
 */

import { calculateHDTransits, calculateTransitGates } from 'natalengine';
import { renderBodygraph } from '../bodygraph.js';
import { esc } from '../lib/format.js';
import { transitInstants, engineTransitArguments, formatTransitOffset } from '../lib/transit-time.js';

const plural2 = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
import { getCurrentChart, showGateDetail } from './chart.js';

export function setupTransitView() {
  const dateInput = document.getElementById('transit-date');
  const timeInput = document.getElementById('transit-time');
  const secondsInput = document.getElementById('transit-seconds');
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
    if (secondsInput.checked) timeInput.value += `:${String(now.getSeconds()).padStart(2, '0')}`;
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
  secondsInput.addEventListener('change', () => {
    const minute = timeInput.value.slice(0, 5);
    timeInput.step = secondsInput.checked ? '1' : '60';
    timeInput.value = minute ? minute + (secondsInput.checked ? ':00' : '') : '';
    renderTransits();
  });
  zoneInput.addEventListener('change', renderTransits);
  document.getElementById('transit-choice').addEventListener('change', renderTransits);
  document.getElementById('transit-now').addEventListener('click', setNow);
}

export function renderTransits() {
  const current = getCurrentChart();
  if (!current) return;
  const date = document.getElementById('transit-date').value;
  let time = document.getElementById('transit-time').value;
  if (time.length === 5 && document.getElementById('transit-seconds').checked) time += ':00';
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

  renderTransitContent(overlay, date, time);
}

export function renderTransitContent(overlay, date = null, time = null) {
  const container = document.getElementById('transit-content');
  const sunGate = overlay.highlights.sun;
  const moonGate = overlay.highlights.moon;

  const when = date ? `on ${date} at ${time}` : 'today';
  const whenCap = date ? `On ${date} at ${time}` : 'Today';

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
