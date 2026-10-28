/**
 * Two-chart model for the Connection view: who carries each gate, who defines
 * each center, and how each channel connects the pair. Pure — shared by the
 * combined bodygraph and the detail panel so both always agree.
 */

import { CHANNELS } from 'natalengine';

export function pairModel(chartA, chartB) {
  const aGates = new Set(chartA.gates.all);
  const bGates = new Set(chartB.gates.all);
  const activeGates = new Set([...aGates, ...bGates]);

  // Channels present across the relationship (both gates appear in either chart).
  const compChannels = CHANNELS.filter(ch => activeGates.has(ch.gates[0]) && activeGates.has(ch.gates[1]));
  const compCenters = new Set();
  for (const ch of compChannels) for (const c of (ch.centers || [])) compCenters.add(c);
  const aDef = new Set(chartA.centers.definedNames);
  const bDef = new Set(chartB.centers.definedNames);

  /** 'both' | 'a' | 'b' | null */
  const gateOwner = (g) => {
    const a = aGates.has(g), b = bGates.has(g);
    return a && b ? 'both' : a ? 'a' : b ? 'b' : null;
  };

  /** 'both' | 'a' | 'b' | 'bridged' (completed only together) | null (open) */
  const centerOwner = (key) => {
    if (!compCenters.has(key)) return null;
    const a = aDef.has(key), b = bDef.has(key);
    if (a && b) return 'both';
    if (a) return 'a';
    if (b) return 'b';
    return 'bridged';
  };

  /** 'companionship' | 'compromise' | 'dominance' | 'electromagnetic' | null */
  const channelDynamic = (ch) => {
    const [g1, g2] = ch.gates;
    const a1 = aGates.has(g1), a2 = aGates.has(g2), b1 = bGates.has(g1), b2 = bGates.has(g2);
    const aFull = a1 && a2, bFull = b1 && b2;
    if (aFull && bFull) return 'companionship';
    if (aFull || bFull) return (aFull ? (b1 || b2) : (a1 || a2)) ? 'compromise' : 'dominance';
    if ((a1 && b2) || (a2 && b1)) return 'electromagnetic';
    return null;
  };

  return { aGates, bGates, activeGates, compChannels, compCenters, gateOwner, centerOwner, channelDynamic };
}
