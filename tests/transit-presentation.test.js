import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHDTransits, CHANNELS } from 'natalengine';
import { buildTransitGraph } from '../src/lib/transit-graph.js';
import { renderTransitSummary } from '../src/views/transit-presentation.js';

const natal = {
  gates: { all: [11, 12, 22, 13, 33, 7, 21, 41, 55] },
  centers: { definedNames: ['throat', 'g', 'solar'] }, channels: [],
};
const overlay = calculateHDTransits(natal, '2026-09-24');
function summary(t, chart = natal, data = overlay, mode = 'overlay') {
  const previous = globalThis.document;
  const target = { innerHTML: '' };
  globalThis.document = { getElementById: id => {
    assert.equal(id, 'transit-content');
    return target;
  } };
  try {
    renderTransitSummary(data, buildTransitGraph(chart, data.transitGates, mode));
    return target.innerHTML;
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

test('overlay retains the original synthesis, completion narratives and circuit badges', t => {
  const html = summary(t);
  assert.ok(html.includes(`strongest theme is the <strong>${overlay.channelCompletions[0].channel}</strong>`));
  assert.ok(html.includes(`Channel Completions (${overlay.stats.channelCompletions})`));
  assert.ok(html.includes('When a transit gate sits opposite one of your hanging gates'));
  assert.ok(overlay.channelCompletions.some(c => c.natalGate));
  assert.ok(overlay.channelCompletions.some(c => !c.natalGate));
  for (const c of overlay.channelCompletions) {
    assert.ok(html.includes(`${c.channel} (${c.gates.join('-')})`));
    assert.ok(html.includes(`circuit-badge ${c.circuit}">${c.circuit}</span>`));
    assert.ok(html.includes(c.natalGate
      ? `Your Gate ${c.natalGate} is completed by transit Gate ${c.transitGate} (${c.transitPlanet}).`
      : 'Pure transit channel — both gates carried by the planets at the selected time.'));
  }
});

test('overlay retains center themes and every reinforced gate meaning with detail links', t => {
  const html = summary(t);
  assert.ok(overlay.temporarilyDefinedCenters.length > 0);
  assert.ok(overlay.reinforcedGates.length > 0);
  for (const c of overlay.temporarilyDefinedCenters) {
    assert.ok(html.includes(`data-transit-detail="center" data-id="${c.center}"`));
    assert.ok(html.includes(`${c.theme} — usually undefined in your chart, activated at the selected time by transit.`));
  }
  assert.ok(html.includes(`Reinforced Gates (${overlay.reinforcedGates.length})`));
  for (const g of overlay.reinforcedGates) {
    assert.ok(html.includes(`data-transit-detail="gate" data-id="${g.gate}"`));
    assert.ok(html.includes(g.meaning.replace('today.', 'at the selected time.')));
  }
  assert.ok(html.includes('reinforces your natal gate'));
});

test('sky-only summary keeps circuit and center descriptions without natal claims', t => {
  const html = summary(t, natal, overlay, 'transit-only');
  const channels = buildTransitGraph(natal, overlay.transitGates, 'transit-only').channels;
  assert.ok(html.includes(`Transit channels (${channels.length})`));
  assert.ok(channels.length > 0);
  for (const c of channels) assert.ok(html.includes(`circuit-badge ${c.circuit}">${c.circuit}</span>`));
  assert.ok(html.includes('defined by a complete channel in the selected transits.'));
  assert.doesNotMatch(html, /your natal|your chart|Reinforced Gates|Temporarily Defined|strongest theme/);
});

test('no completions retains quiet-sky synthesis and does not list existing natal channels', t => {
  const allDefined = { gates: { all: Array.from({length:64}, (_,i) => i+1) },
    centers: { definedNames: [...new Set(CHANNELS.flatMap(c=>c.centers))] }, channels: CHANNELS };
  const data = calculateHDTransits(allDefined, '2026-09-24');
  const html = summary(t, allDefined, data);
  assert.ok(html.includes('quiet sky for your chart'));
  assert.ok(html.includes('Channel Completions (0)'));
  assert.ok(html.includes('No channel completions from these transits.'));
  assert.doesNotMatch(html, /data-transit-detail="channel"|Temporarily Defined Centers/);
});
