import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTransitGraph } from '../src/lib/transit-graph.js';
const natal = { gates: { all: [34,10] }, centers: { definedNames: ['g','sacral'] } };
const sky = { sun:{gate:20,line:1},moon:{gate:57,line:2},mars:{gate:34,line:3} };

test('overlay preserves birth gates and distinguishes new vs reinforced transits', () => {
  const model = buildTransitGraph(natal, sky);
  assert.equal(model.gateSource(34), 'both');
  assert.equal(model.gateSource(10), 'natal');
  assert.equal(model.gateSource(20), 'transit');
  assert.equal(model.channels.length, 6);
  assert.equal(model.channelSource(model.channels.find(c=>c.gates.join('-') === '10-34')), 'natal');
  assert.equal(model.channelSource(model.channels.find(c=>c.gates.join('-') === '20-34')), 'completed');
  assert.equal(model.channelSource(model.channels.find(c=>c.gates.join('-') === '20-57')), 'transit');
});

test('transit-only excludes birth gates, channels and centers even when birth chart defines them', () => {
  const model = buildTransitGraph(natal, sky, 'transit-only');
  assert.equal(model.gateSource(10), 'inactive');
  assert.equal(model.gateSource(34), 'transit');
  assert.equal(model.activeGates.has(10), false);
  assert.equal(model.definedCenters.has('g'), false);
  assert.deepEqual(model.channels.map(c=>c.gates.join('-')), ['20-34','20-57','34-57']);
  assert.ok(model.channels.every(c=>model.channelSource(c) === 'transit'));
});

test('hanging gates do not define a center; a completed mixed channel does', () => {
  const chart = {gates:{all:[20]},centers:{definedNames:[]}};
  assert.equal(buildTransitGraph(chart, {sun:{gate:20,line:3}}).definedCenters.size,0);
  const complete = buildTransitGraph(chart, {sun:{gate:57,line:3}});
  assert.deepEqual([...complete.definedCenters].sort(), ['spleen','throat']);
  assert.equal(buildTransitGraph(chart, {sun:{gate:57,line:3}}, 'transit-only').definedCenters.size,0);
});

test('switching modes does not modify birth or transit data', () => {
  const before = JSON.stringify({natal,sky});
  buildTransitGraph(natal,sky);buildTransitGraph(natal,sky,'transit-only');
  assert.equal(JSON.stringify({natal,sky}),before);
});
