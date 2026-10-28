import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANNELS } from 'natalengine';
import { integrationSpanGates } from '../src/lib/bodygraph-integration.js';

test('all sixteen Integration gate combinations color only completed crossing channels', () => {
  const integration = [10, 20, 34, 57];
  for (let mask = 0; mask < 16; mask++) {
    const active = integration.filter((_, i) => mask & (1 << i));
    const channels = CHANNELS.filter(c => c.gates.every(g => active.includes(g)));
    const [top, bottom] = integrationSpanGates(channels);
    const topActive = active.filter(g => g === 10 || g === 20);
    const bottomActive = active.filter(g => g === 34 || g === 57);
    const crossing = topActive.length > 0 && bottomActive.length > 0;
    assert.deepEqual(top.sort((a, b) => a - b), crossing ? topActive : [], `upper span with gates ${active}`);
    assert.deepEqual(bottom.sort((a, b) => a - b), crossing ? bottomActive : [], `lower span with gates ${active}`);
  }
});

test('ordinary channels never light the shared Integration span', () => {
  const ordinary = CHANNELS.filter(c => !c.gates.every(g => [10, 20, 34, 57].includes(g)));
  assert.deepEqual(integrationSpanGates(ordinary), [[], []]);
});

// Probe the actual outline at the two previously notched corners, not just
// channel activation. These positions used to fall outside the colored path.
import { INTEGRATION_JOINED_PATHS, INTEGRATION_LOWER_BEND_PATHS } from '../src/lib/bodygraph-integration.js';
const vertices = d => [...d.matchAll(/[-\d.]+/g)].map(m => Number(m[0]))
  .reduce((points, n, i, all) => i % 2 ? points : [...points, [n, all[i + 1]]], []);
function contains(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

test('connected gate 10 fills the former step and follows the straight trunk edge', () => {
  const points = vertices(INTEGRATION_JOINED_PATHS[10]);
  for (const [x, y] of [[219, 686], [217, 690], [213, 695]]) {
    assert.ok(contains(points, x, y), `upper corner covers ${x},${y}`);
  }
  for (const [x, y] of points.slice(1, 3)) {
    const expectedX = 207.63 + (y - 700.23) * (133.78 - 207.63) / (814.07 - 700.23);
    assert.ok(Math.abs(x - expectedX) < 0.00001, 'outer corner is collinear with trunk');
  }
});

test('connected gate 34 covers the entire former gap at the lower trunk terminal', () => {
  const points = vertices(INTEGRATION_JOINED_PATHS[34]);
  for (let i = 1; i < 20; i++) {
    const t = i / 20;
    const x = 133.78 + (147.44 - 133.78) * t;
    const y = 814.07 + (824.86 - 814.07) * t;
    assert.ok(contains(points, x, y + 0.15), `lower corner covers terminal at ${t}`);
  }
  for (const [x, y] of points.slice(3, 5)) {
    const expectedX = 207.63 + (y - 700.23) * (133.78 - 207.63) / (814.07 - 700.23);
    assert.ok(Math.abs(x - expectedX) < 0.00001, 'outer corner is collinear with trunk');
  }
});


test('34–57 elbow stays below the branch outer edge with no projecting cap or gap', () => {
  const polygons = Object.values(INTEGRATION_LOWER_BEND_PATHS).map(vertices);
  const topEdge = x => 819.72 + (x - 139.46) * 148.33 / 213;
  for (const polygon of polygons) {
    for (const [x, y] of polygon) {
      assert.ok(y >= topEdge(x) - 0.00001, 'neither branch projects above the elbow');
    }
  }
  // The former tip must be uncolored; samples inside the bend stay filled.
  assert.ok(!polygons.some(p => contains(p, 134.1, 814)));
  for (const [x, y] of [[134, 818], [139, 824], [141, 827], [140, 830]]) {
    assert.ok(polygons.some(p => contains(p, x, y)), `elbow remains filled at ${x},${y}`);
  }
});
