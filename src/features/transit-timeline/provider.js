/** The only calculation adapter that knows NatalEngine and the app graph model. */
import { calculateTransitGates, CHANNELS, CENTERS, GATES } from 'natalengine';
import { engineTransitArguments } from '../../lib/transit-time.js';
import { buildTransitGraph } from '../../lib/transit-graph.js';

export function snapshot(instant) {
  return calculateTransitGates(...engineTransitArguments(instant)).gates;
}

export function catalog() {
  return [
    ...Object.entries(CENTERS).map(([id, center]) => ({ key: `center:${id}`, kind: 'center', id, name: center.name })),
    ...CHANNELS.map(channel => ({ key: `channel:${channel.gates.join('-')}`, kind: 'channel', id: channel.gates.join('-'), name: channel.name })),
    ...Object.entries(GATES).map(([id, gate]) => ({ key: `gate:${id}`, kind: 'gate', id: Number(id), name: gate.name }))
  ];
}

export function stateAt(natal, activations, mode) {
  const model = buildTransitGraph(natal, activations, mode);
  const states = new Map();
  for (const gate of model.activeGates) states.set(`gate:${gate}`, model.gateSource(gate));
  for (const channel of model.channels) states.set(`channel:${channel.gates.join('-')}`, model.channelSource(channel));
  for (const center of model.definedCenters) {
    states.set(`center:${center}`, mode === 'overlay' && model.natalCenters.has(center) ? 'natal' : 'transit');
  }
  return states;
}

// Birth identity includes all data used by this provider; no names or birth data
// are sent to the worker, persisted by the feature, or used as cache keys.
export function natalIdentity(chart) {
  return {
    gates: { all: [...chart.gates.all].sort((a, b) => a - b) },
    centers: { definedNames: [...chart.centers.definedNames].sort() }
  };
}
