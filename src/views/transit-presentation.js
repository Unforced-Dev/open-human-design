import { CENTERS } from 'natalengine';
import { esc } from '../lib/format.js';

export function renderTransitLegend(mode) {
  const only = mode === 'transit-only';
  document.getElementById('transit-graph-legend').innerHTML = `
    <div class="transit-legend-group">
      ${only ? '' : '<span><i class="transit-key natal" aria-hidden="true"></i>Birth activations</span>'}
      <span><i class="transit-key sky-line" aria-hidden="true"></i>Transit activations</span>
    </div>
    <div class="transit-legend-group">
      <span><i class="transit-key sky-gate" aria-hidden="true"></i>${only ? 'Transit gates' : 'Gates added by transit'}</span>
      ${only ? '' : '<span><i class="transit-key both" aria-hidden="true"></i>Birth + transit gates</span>'}
    </div>
    <span><i class="transit-key center" aria-hidden="true"></i>${only ? 'Transit-defined center' : 'Center defined with transits'}</span>`;

}

// Reuse the natal view's row-lit state in both directions: card to graph,
// and graph to the matching cards. Its inset stripe thickens the left edge
// without moving the card text or changing the layout.
export function highlightTransitRows(selection) {
  const gates = new Set(selection?.gates || []);
  const centers = new Set(selection?.centers || []);
  document.querySelectorAll('#transit-content [data-transit-detail]').forEach(row => {
    const { transitDetail: kind, id } = row.dataset;
    const lit = kind === 'gate' ? gates.has(Number(id))
      : kind === 'center' ? centers.has(id)
      : kind === 'channel' && id.split('-').every(gate => gates.has(Number(gate)));
    row.classList.toggle('row-lit', Boolean(lit));
  });
}

// Keep the original overlay analysis and its narrative intact. The graph model
// supplies the separate sky-only view, not a replacement for natal interpretation.
export function renderTransitSummary(overlay, model) {
  const only = model.mode === 'transit-only';
  const channels = only ? model.channels.map(ch => ({
    channel: ch.name, gates: ch.gates, circuit: ch.circuit, significance: 'moderate',
  })) : overlay.channelCompletions;
  const centers = only ? [...model.definedCenters].map(center => ({
    center, centerName: CENTERS[center]?.name, theme: CENTERS[center]?.theme,
  })) : overlay.temporarilyDefinedCenters;
  const strongest = overlay.channelCompletions[0];
  const synthesis = only ? '' : strongest
    ? `At the selected time, the strongest theme is the <strong>${esc(strongest.channel)}</strong> channel ${strongest.natalGate ? 'completing through your chart' : 'active in the field'} — ${overlay.stats.channelCompletions} channel completion${overlay.stats.channelCompletions === 1 ? '' : 's'} in total.`
    : 'At the selected time, it is a quiet sky for your chart — no transit completes one of your channels, so the weather passes through gently.';

  document.getElementById('transit-content').innerHTML = `
    ${synthesis ? `<p class="panel-intro" style="font-size:14px">${synthesis}</p>` : ''}
    <div class="foundation-grid" style="margin-bottom:20px">
      ${[['Sun', overlay.highlights.sun], ['Moon', overlay.highlights.moon]].map(([name, g]) => `<button type="button" class="foundation-item foundation-clickable transit-summary-button" data-transit-detail="gate" data-id="${g.gate}"><span class="label">Transit ${name}</span><span class="value">Gate ${g.gate} · Line ${g.line}</span><span class="detail">${esc(g.gateName)}${!only && g.reinforcesNatal ? ' — reinforces your natal gate' : ''}</span></button>`).join('')}
    </div>
    <div class="panel-title">${only ? 'Transit channels' : 'Channel Completions'} (${channels.length})</div>
    <p class="panel-intro">${only ? 'Both gates are activated by the selected transits.' : 'When a transit gate sits opposite one of your hanging gates, the channel completes — you temporarily live that defined energy.'}</p>
    ${channels.length ? channels.map(ch => `<button type="button" class="channel-item transit-completion transit-summary-button ${esc(ch.significance)}" data-transit-detail="channel" data-id="${ch.gates.join('-')}">
      <span class="completion-title">${esc(ch.channel)} (${ch.gates.join('-')})${ch.natalGate ? '<span class="circuit-badge transit-source-badge completed">Completed by transit</span>' : ''}</span>
      <span class="completion-detail">${ch.natalGate
        ? `Your Gate ${ch.natalGate} is completed by transit Gate ${ch.transitGate} (${esc(ch.transitPlanet)}).`
        : 'Pure transit channel — both gates carried by the planets at the selected time.'}
        <span class="circuit-badge ${esc(ch.circuit)}">${esc(ch.circuit)}</span>
      </span>
    </button>`).join('') : `<p class="panel-intro">${only ? 'No complete channels at this time.' : 'No channel completions from these transits.'}</p>`}
    ${centers.length ? `<div class="panel-title" style="margin-top:20px">${only ? 'Transit-defined centers' : 'Temporarily Defined Centers'} (${centers.length})</div>
      ${centers.map(c => `<button type="button" class="center-card defined transit-summary-button" data-transit-detail="center" data-id="${c.center}">
        <span class="center-name">${esc(c.centerName)}</span>
        <span class="center-detail">${esc(c.theme)} — ${only ? 'defined by a complete channel in the selected transits.' : 'usually undefined in your chart, activated at the selected time by transit.'}</span>
      </button>`).join('')}` : ''}
    ${!only && overlay.reinforcedGates.length ? `<div class="panel-title" style="margin-top:20px">Reinforced Gates (${overlay.reinforcedGates.length})</div>
      ${overlay.reinforcedGates.map(g => `<button type="button" class="gate-item transit-summary-button" data-transit-detail="gate" data-id="${g.gate}">
        <span class="gate-name">Gate ${g.gate}: ${esc(g.gateName)}</span>
        <span class="gate-meta">${esc(g.meaning.replace(/today\.$/, 'at the selected time.'))}</span>
      </button>`).join('')}` : ''}`;
}
