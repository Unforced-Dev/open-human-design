/**
 * Chart computation — single funnel from birth data to engine output.
 */

import { calculateHumanDesign, calculateGeneKeys } from 'natalengine';

function toDecimalHour(birthTime) {
  const [hours, minutes] = (birthTime || '12:00').split(':').map(Number);
  return hours + (minutes || 0) / 60;
}

/**
 * @param {object} birth - { birthDate, birthTime, timezone, name?, location? }
 * @returns {{ birth, chart, geneKeys }}
 */
export function computeChart(birth) {
  const chart = calculateHumanDesign(birth.birthDate, toDecimalHour(birth.birthTime), birth.timezone ?? 0);
  const geneKeys = calculateGeneKeys(chart);
  return { birth, chart, geneKeys };
}

/**
 * Birth-time sensitivity check: recompute the chart at ±windowMinutes and
 * report which foundational elements would change. Honest accuracy framing —
 * the dominant real-world error source is birth-time uncertainty, and users
 * deserve to know how stable their chart is.
 *
 * @returns {{ stable: string[], shifts: string[] }}
 */
export function sensitivityCheck(birth, chart, windowMinutes = 15) {
  const base = {
    type: chart.type.name,
    authority: chart.authority.name,
    profile: chart.profile.numbers,
    definition: chart.definition,
    cross: chart.incarnationCross?.gates?.join(','),
    variable: chart.variable?.notation,
    moon: `${chart.gates.personality.moon?.gate}.${chart.gates.personality.moon?.line}`
  };

  const labels = {
    type: 'Type', authority: 'Authority', profile: 'Profile',
    definition: 'Definition', cross: 'Incarnation Cross',
    variable: 'Variable', moon: 'Moon'
  };

  const decimal = toDecimalHour(birth.birthTime);
  const shifted = new Set();
  for (const delta of [-windowMinutes / 60, windowMinutes / 60]) {
    const c = calculateHumanDesign(birth.birthDate, decimal + delta, birth.timezone ?? 0);
    const probe = {
      type: c.type.name,
      authority: c.authority.name,
      profile: c.profile.numbers,
      definition: c.definition,
      cross: c.incarnationCross?.gates?.join(','),
      variable: c.variable?.notation,
      moon: `${c.gates.personality.moon?.gate}.${c.gates.personality.moon?.line}`
    };
    for (const key of Object.keys(base)) {
      if (probe[key] !== base[key]) shifted.add(key);
    }
  }

  return {
    stable: Object.keys(base).filter(k => !shifted.has(k)).map(k => labels[k]),
    shifts: [...shifted].map(k => labels[k])
  };
}
