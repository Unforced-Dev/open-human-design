/**
 * A newcomer's first run: keeping their first chart, and the "Start here"
 * card.
 *
 * "Start here" — the three things a newcomer reads first: strategy,
 * authority in practice, and one not-defined center worth noticing. Each
 * step opens its item in the detail panel (data-detail kind:id).
 *
 * Pure, no DOM: node tests check every step resolves for many charts.
 */

import { TYPES } from 'natalengine';
import { STRATEGY_PRACTICE, AUTHORITY_PRACTICE, CENTER_NOTICE } from './glossary.js';
import { centerName } from './details.js';
import { SELF_NAME } from './share.js';

// Fully open centers come first (they take in the most), then undefined
// ones; within each, the conditioning people tend to feel most day to day.
const NOTICE_ORDER = ['solar', 'sacral', 'heart', 'spleen', 'head', 'ajna', 'g', 'throat', 'root'];

/** The not-defined center to point a newcomer at, or null if all nine are defined. */
export function centerToNotice(chart) {
  const open = new Set(chart.centers.openNames);
  const undefinedSet = new Set(chart.centers.undefinedNames);
  return NOTICE_ORDER.find(k => open.has(k)) || NOTICE_ORDER.find(k => undefinedSet.has(k)) || null;
}

/** [{ kind, id, label, value, line }] — always strategy and authority, plus a center when one is open. */
export function startSteps(chart) {
  const typeKey = Object.keys(TYPES).find(k => TYPES[k].name === chart.type.name);
  const steps = [
    { kind: 'type', id: chart.type.name, label: 'Strategy', value: chart.type.strategy, line: STRATEGY_PRACTICE[typeKey] || '' },
    { kind: 'authority', id: chart.authority.name, label: 'Authority, in practice', value: chart.authority.name, line: AUTHORITY_PRACTICE[chart.authority.name] || '' }
  ];
  const center = centerToNotice(chart);
  if (center) {
    const status = chart.centers.openNames.includes(center) ? 'open' : 'undefined';
    steps.push({ kind: 'center', id: center, label: `An ${status} center to notice`, value: centerName(center), line: CENTER_NOTICE[center] });
  }
  return steps;
}

/** What a newcomer's first chart is saved as when they leave Name blank. */
export const FIRST_CHART_NAME = SELF_NAME;

/**
 * The name a newly entered chart is saved under, or null to leave it
 * unsaved. The first chart is always kept (as "Me" without a name), so a
 * newcomer who comes back finds it; later nameless charts stay unsaved.
 */
export function nameToSave(name, savedCount) {
  return name || (savedCount === 0 ? FIRST_CHART_NAME : null);
}
