/**
 * "Start here" steps and the first-chart save rule.
 *
 * For a spread of charts (every type and authority), the card must offer
 * strategy, authority and a not-defined center, each with a practical line
 * and each opening a real detail panel.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateHumanDesign } from 'natalengine';
import { startSteps, centerToNotice, nameToSave, FIRST_CHART_NAME } from '../src/lib/starthere.js';
import { renderDetail } from '../src/lib/details.js';

const BIRTHS = [
  ['1990-06-15', 14.5, -6], ['1985-03-20', 8, 0], ['1992-11-02', 12, 9],
  ['1975-12-01', 6.5, -5], ['1968-02-11', 23.75, 1], ['2001-09-09', 3.25, 5.5],
  ['1955-07-04', 17, -4], ['1981-01-31', 9.5, 10], ['1999-04-17', 0.5, 2],
  ['1979-08-27', 11, -7], ['1950-02-01', 7, 0], ['1950-05-04', 4, 0],
  ['1950-08-07', 1, 0], ['1950-05-28', 4, 0], ['1953-08-07', 1, 0],
  ['1959-11-10', 22, 0]
];
const charts = BIRTHS.map(([d, h, tz]) => calculateHumanDesign(d, h, tz));

test('the sample covers every type and authority', () => {
  assert.equal(new Set(charts.map(c => c.type.name)).size, 5);
  assert.equal(new Set(charts.map(c => c.authority.name)).size, 7);
});

test('every chart gets strategy, authority and an open center, each opening a panel', () => {
  for (const chart of charts) {
    const steps = startSteps(chart);
    assert.deepEqual(steps.map(s => s.kind), ['type', 'authority', 'center'], chart.type.name);
    for (const step of steps) {
      assert.ok(step.line.length > 30, `${chart.type.name}/${chart.authority.name}: ${step.kind} has no practical line`);
      assert.doesNotMatch(`${step.label} ${step.value} ${step.line}`, /undefined ·|\bnull\b|\bNaN\b/);
      const panel = renderDetail('chart', step.kind, step.id, { chart });
      assert.ok(panel?.title, `${step.kind}:${step.id} opens nothing`);
    }
    assert.equal(steps[0].value, chart.type.strategy);
  }
});

test('the center to notice is never a defined one, and prefers fully open centers', () => {
  for (const chart of charts) {
    const key = centerToNotice(chart);
    assert.ok(!chart.centers.definedNames.includes(key), `${key} is defined`);
    if (chart.centers.openNames.length) assert.ok(chart.centers.openNames.includes(key), `${key} is not open though open centers exist`);
  }
});

test('a chart with all nine centers defined skips the center step', () => {
  const chart = structuredClone(charts[0]);
  chart.centers.definedNames = ['head', 'ajna', 'throat', 'g', 'heart', 'sacral', 'spleen', 'solar', 'root'];
  chart.centers.undefinedNames = [];
  chart.centers.openNames = [];
  assert.deepEqual(startSteps(chart).map(s => s.kind), ['type', 'authority']);
});

test('the first chart is kept as "Me" without a name; later nameless charts are not', () => {
  assert.equal(nameToSave(null, 0), FIRST_CHART_NAME);
  assert.equal(nameToSave('', 0), FIRST_CHART_NAME);
  assert.equal(nameToSave('Riley', 0), 'Riley');
  assert.equal(nameToSave(null, 2), null);
  assert.equal(nameToSave('Sam', 2), 'Sam');
});
