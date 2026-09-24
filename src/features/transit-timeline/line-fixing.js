import { CHANNELS } from 'natalengine';
import { LINE_FIXING_PLANETS } from './line-fixing-data.js';

const KNOWN_PLANETS = new Set([
  'sun', 'earth', 'moon', 'northNode', 'southNode', 'mercury', 'venus',
  'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
]);

const HARMONICS = new Map(Array.from({ length: 64 }, (_, index) => [index + 1, new Set([index + 1])]));
for (const { gates: [first, second] } of CHANNELS) {
  HARMONICS.get(first).add(second);
  HARMONICS.get(second).add(first);
}

function validActivation(value) {
  return Number.isInteger(value?.gate) && value.gate >= 1 && value.gate <= 64
    && Number.isInteger(value?.line) && value.line >= 1 && value.line <= 6;
}

function flattenActivations(sides) {
  const result = [];
  for (const side of ['design', 'personality']) {
    for (const [planet, activation] of Object.entries(sides?.[side] || {})) {
      result.push({ side, planet, ...activation });
    }
  }
  return result;
}

function flattenTransit(transitActivations) {
  const input = transitActivations?.gates || transitActivations;
  return input && typeof input === 'object' && !Array.isArray(input)
    ? Object.entries(input).map(([planet, activation]) => ({ side: 'transit', planet, ...activation }))
    : null;
}

function complete(activations) {
  return activations?.every(a => KNOWN_PLANETS.has(a.planet) && validActivation(a)) || false;
}

function unknownState() {
  return {
    natalState: 'unknown', transitAdjustedState: 'unknown',
    temporaryChange: false, natalProviders: [], transitProviders: [],
  };
}

function stateFrom(contributions) {
  const poles = new Set(contributions.map(({ polarity }) => polarity));
  if (poles.has('exalted') && poles.has('detriment')) return 'juxtaposed';
  if (poles.has('exalted')) return 'exalted';
  if (poles.has('detriment')) return 'detriment';
  return 'none';
}

function contributionsFor(target, providers, rule) {
  const harmonicGates = HARMONICS.get(target.gate);
  const contributions = [];
  for (const provider of providers) {
    if (!harmonicGates.has(provider.gate)) continue;
    for (const polarity of ['exalted', 'detriment']) {
      if (rule[polarity].includes(provider.planet)) {
        contributions.push({
          side: provider.side,
          planet: provider.planet,
          gate: provider.gate,
          line: provider.line,
          polarity,
        });
      }
    }
  }
  return contributions;
}

/**
 * Calculate fixed line states for natal chart activations, without mutating the chart.
 *
 * @param {object} chart - NatalEngine chart with gates.design and gates.personality.
 * @param {object} [transitActivations] - Optional calculateTransitGates().gates,
 *   or an equivalent planet -> {gate, line} map for one instant.
 * @returns {object} design/personality maps keyed by natal planet. Each result has
 *   natalState, transitAdjustedState, temporaryChange, and contributing planets.
 *   Missing rules or incomplete activation input produce 'unknown'.
 */
export function calculateLineFixings(chart, transitActivations) {
  const sides = chart?.gates;
  const natal = flattenActivations(sides);
  const transit = transitActivations == null ? [] : flattenTransit(transitActivations);
  const natalComplete = sides?.design && sides?.personality && complete(natal);
  const transitComplete = complete(transit);
  const result = { design: {}, personality: {} };

  for (const target of natal) {
    const rule = validActivation(target)
      ? LINE_FIXING_PLANETS[`${target.gate}.${target.line}`]
      : undefined;
    if (!rule || !natalComplete) {
      result[target.side][target.planet] = unknownState();
      continue;
    }

    const natalProviders = contributionsFor(target, natal, rule);
    const natalState = stateFrom(natalProviders);
    const transitProviders = transitComplete ? contributionsFor(target, transit, rule) : [];
    const transitAdjustedState = transitComplete
      ? stateFrom([...natalProviders, ...transitProviders]) : 'unknown';
    result[target.side][target.planet] = {
      natalState,
      transitAdjustedState,
      temporaryChange: transitAdjustedState !== 'unknown' && transitAdjustedState !== natalState,
      natalProviders,
      transitProviders,
    };
  }
  return result;
}

/**
 * Calculate fixing for each transit activation. Both possible comparison scopes
 * are exposed because a transit chart and a transit-to-natal overlay are distinct.
 * `transitOnlyState` uses the transit planets alone; `combinedState` also uses
 * the chart's Design and Personality planets as fixing providers.
 */
export function calculateTransitLineFixings(chart, transitActivations) {
  const sides = chart?.gates;
  const natal = flattenActivations(sides);
  const transit = flattenTransit(transitActivations);
  const natalComplete = sides?.design && sides?.personality && complete(natal);
  const transitComplete = complete(transit);
  const result = {};
  for (const target of transit || []) {
    const rule = validActivation(target)
      ? LINE_FIXING_PLANETS[`${target.gate}.${target.line}`]
      : undefined;
    if (!rule || !transitComplete) {
      result[target.planet] = {
        transitOnlyState: 'unknown', combinedState: 'unknown',
        natalInfluence: false, transitProviders: [], natalProviders: [],
      };
      continue;
    }
    const transitProviders = contributionsFor(target, transit, rule);
    const transitOnlyState = stateFrom(transitProviders);
    const natalProviders = natalComplete ? contributionsFor(target, natal, rule) : [];
    const combinedState = natalComplete
      ? stateFrom([...transitProviders, ...natalProviders]) : 'unknown';
    result[target.planet] = {
      transitOnlyState,
      combinedState,
      natalInfluence: combinedState !== 'unknown' && combinedState !== transitOnlyState,
      transitProviders,
      natalProviders,
    };
  }
  return result;
}
