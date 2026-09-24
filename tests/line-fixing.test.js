import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLineFixings, calculateTransitLineFixings } from '../src/features/transit-timeline/line-fixing.js';
import { LINE_FIXING_PLANETS } from '../src/features/transit-timeline/line-fixing-data.js';

const at = (gate, line) => ({ gate, line });
const chart = (design = {}, personality = {}) => ({ gates: { design, personality } });

test('MIT rule table has 759 entries and leaves unverified 54.4 unknown', () => {
  assert.equal(Object.keys(LINE_FIXING_PLANETS).length, 383);
  assert.equal(Object.values(LINE_FIXING_PLANETS).reduce(
    (count, rule) => count + rule.exalted.length + rule.detriment.length, 0,
  ), 759);
  assert.equal(calculateLineFixings(chart({ sun: at(54, 4) })).design.sun.natalState, 'unknown');
});

test('Jovian examples: own placement, opposite gate, and same gate across different lines', () => {
  const own = calculateLineFixings(chart({ pluto: at(43, 2) }));
  assert.equal(own.design.pluto.natalState, 'exalted');

  const opposite = calculateLineFixings(chart({ sun: at(55, 2) }, { venus: at(39, 4) }));
  assert.equal(opposite.design.sun.natalState, 'exalted');
  assert.deepEqual(opposite.design.sun.natalProviders.map(x => x.side), ['personality']);

  const sameGate = calculateLineFixings(chart({ mars: at(16, 1), sun: at(16, 3), earth: at(16, 4) }));
  assert.equal(sameGate.design.sun.natalState, 'detriment');
  assert.equal(sameGate.design.earth.natalState, 'detriment');
});

test('real chart sample separates birth fixing from transit Pluto across Gate 41-30', () => {
  const design = {
    sun: at(61, 3), earth: at(62, 3), moon: at(54, 5), northNode: at(52, 1),
    southNode: at(58, 1), mercury: at(60, 3), venus: at(19, 3), mars: at(30, 3),
    jupiter: at(34, 4), saturn: at(28, 2), uranus: at(9, 2), neptune: at(11, 6), pluto: at(50, 4),
  };
  const personality = {
    sun: at(42, 1), earth: at(32, 1), moon: at(25, 2), northNode: at(12, 6),
    southNode: at(11, 6), mercury: at(27, 6), venus: at(8, 4), mars: at(27, 3),
    jupiter: at(9, 6), saturn: at(50, 6), uranus: at(9, 4), neptune: at(10, 2), pluto: at(50, 3),
  };
  const result = calculateLineFixings(chart(design, personality), { pluto: at(41, 2) });
  assert.equal(result.design.mars.natalState, 'none');
  assert.equal(result.design.mars.transitAdjustedState, 'exalted');
  assert.equal(result.design.mars.temporaryChange, true);
  assert.equal(result.design.pluto.natalState, 'juxtaposed');
  assert.equal(result.personality.mars.natalState, 'juxtaposed');
  assert.equal(result.personality.sun.natalState, 'exalted');
  assert.equal(result.personality.mercury.natalState, 'detriment');
});

test('all transit arrows in three video frames require natal plus transit providers', () => {
  const planets = [
    'sun', 'earth', 'moon', 'northNode', 'southNode', 'mercury', 'venus',
    'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
  ];
  const values = pairs => Object.fromEntries(planets.map((planet, index) => [
    planet, at(...pairs[index]),
  ]));
  const design = values([
    [61, 3], [62, 3], [54, 5], [52, 1], [58, 1], [60, 3], [19, 3],
    [30, 3], [34, 4], [28, 2], [9, 2], [11, 6], [50, 4],
  ]);
  const personality = values([
    [42, 1], [32, 1], [25, 2], [12, 6], [11, 6], [27, 6], [8, 4],
    [27, 3], [9, 6], [50, 6], [9, 4], [10, 2], [50, 3],
  ]);
  const frames = [
    {
      id: 'second_02',
      pairs: [
        [46, 5], [25, 5], [63, 1], [30, 6], [29, 6], [32, 2], [28, 6],
        [56, 2], [7, 6], [21, 3], [20, 6], [25, 6], [41, 2],
      ],
      marked: { northNode: 'exalted', neptune: 'exalted', pluto: 'detriment' },
    },
    {
      id: 'second_12',
      pairs: [
        [46, 4], [25, 4], [55, 4], [30, 6], [29, 6], [32, 1], [28, 6],
        [56, 2], [7, 6], [21, 3], [20, 6], [25, 6], [41, 2],
      ],
      marked: { northNode: 'exalted', neptune: 'exalted', pluto: 'detriment' },
    },
    {
      id: 'second_37',
      pairs: [
        [18, 1], [17, 1], [51, 6], [30, 6], [29, 6], [50, 1], [44, 1],
        [56, 4], [4, 1], [21, 3], [20, 6], [25, 6], [41, 2],
      ],
      marked: { northNode: 'exalted', mercury: 'exalted', venus: 'detriment', pluto: 'detriment' },
    },
  ];
  const expectedNatal = {
    design: {
      venus: 'exalted', mars: 'exalted', uranus: 'detriment',
      neptune: 'exalted', pluto: 'juxtaposed',
    },
    personality: {
      sun: 'exalted', southNode: 'exalted', mercury: 'detriment',
      mars: 'juxtaposed', pluto: 'detriment',
    },
  };

  for (const frame of frames) {
    const transits = values(frame.pairs);
    const transitResult = calculateTransitLineFixings(chart(design, personality), transits);
    const natalResult = calculateLineFixings(chart(design, personality), transits);
    for (const planet of planets) {
      assert.equal(
        transitResult[planet].combinedState,
        frame.marked[planet] || 'none',
        `${frame.id} transit ${planet}`,
      );
    }
    for (const side of ['design', 'personality']) {
      for (const planet of planets) {
        assert.equal(
          natalResult[side][planet].transitAdjustedState,
          expectedNatal[side][planet] || 'none',
          `${frame.id} natal ${side} ${planet}`,
        );
      }
    }
  }

  const solo = calculateTransitLineFixings(chart(design, personality), values(frames[2].pairs));
  assert.equal(solo.mercury.transitOnlyState, 'none');
  assert.equal(solo.mercury.combinedState, 'exalted');
  assert.equal(solo.mercury.natalProviders[0].planet, 'mars');
  assert.equal(solo.neptune.transitOnlyState, 'none');
});

test('incomplete chart data is not mistaken for a known absence of fixing', () => {
  const incomplete = calculateLineFixings({ gates: { design: { sun: at(55, 2) } } });
  assert.equal(incomplete.design.sun.natalState, 'unknown');
  const malformedTransit = calculateLineFixings(chart({ sun: at(55, 2) }), { venus: { gate: 39 } });
  assert.equal(malformedTransit.design.sun.natalState, 'none');
  assert.equal(malformedTransit.design.sun.transitAdjustedState, 'unknown');
});
