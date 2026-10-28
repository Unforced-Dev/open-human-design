/** The only calculation adapter that knows NatalEngine and the app graph model. */
import { calculateTransitGates, CHANNELS, CENTERS, GATES } from 'natalengine';
import { engineTransitArguments } from '../../lib/transit-time.js';
import { buildTransitGraph } from '../../lib/transit-graph.js';

export function snapshot(instant) {
  return calculateTransitGates(...engineTransitArguments(instant)).gates;
}

// Fastest daily motion (degrees/day) measured in NatalEngine 1.6 over 1900–2100
// (hourly 2024–2026, daily otherwise), rounded up with margin. Nodes get extra.
const MAX_SPEED = {
  moon: 16, mercury: 2.5, venus: 1.4, sun: 1.1, earth: 1.1, mars: 1,
  jupiter: .3, saturn: .2, uranus: .1, neptune: .1, pluto: .1, northNode: 1, southNode: 1
};
const GATE_WIDTH = 360 / 64;
const WHEEL_OFFSET = 358.25; // Gate 25 starts at 358°15'
const DAY = 86_400_000;

/** How long (ms) no planet can reach the edge of its current gate. */
export function safeStep(activations) {
  let step = Infinity;
  for (const [planet, { longitude }] of Object.entries(activations)) {
    const into = ((longitude - WHEEL_OFFSET) % GATE_WIDTH + GATE_WIDTH) % GATE_WIDTH;
    step = Math.min(step, Math.min(into, GATE_WIDTH - into) / (MAX_SPEED[planet] ?? MAX_SPEED.moon) * DAY);
  }
  return step;
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
