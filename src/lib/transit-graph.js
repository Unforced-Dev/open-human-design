import { CHANNELS } from 'natalengine';

// Display topology is derived from gates, so centers require an entire channel.
export function buildTransitGraph(natal, activations, mode = 'overlay') {
  const natalGates = new Set(natal.gates.all);
  const transitGates = new Set(Object.values(activations).filter(Boolean).map(g => g.gate));
  const activeGates = mode === 'transit-only' ? new Set(transitGates) : new Set([...natalGates, ...transitGates]);
  const channels = CHANNELS.filter(c => c.gates.every(g => activeGates.has(g)));
  const natalCenters = new Set(natal.centers.definedNames);
  const definedCenters = new Set(channels.flatMap(c => c.centers));
  const gateSource = gate => mode === 'transit-only'
    ? transitGates.has(gate) ? 'transit' : 'inactive'
    : natalGates.has(gate) ? transitGates.has(gate) ? 'both' : 'natal'
      : transitGates.has(gate) ? 'transit' : 'inactive';
  const channelSource = channel => mode === 'transit-only' ? 'transit'
    : channel.gates.every(g => natalGates.has(g)) ? 'natal'
      : channel.gates.every(g => !natalGates.has(g)) ? 'transit' : 'completed';
  return { mode, natalGates, transitGates, activeGates, channels, natalCenters, definedCenters, gateSource, channelSource };
}
export const TRANSIT_SOURCE_LABELS = { natal: 'Birth chart', transit: 'Transit only', completed: 'Completed by transit', both: 'Birth chart + transit', inactive: 'Inactive' };
