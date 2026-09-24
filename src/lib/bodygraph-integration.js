// Missing shared span from hdkit's MIT-licensed bodygraph geometry, also used
// by natalengine/bodygraph-data. Keep its separate upper and lower junctions.
// https://github.com/jdempcy/hdkit/blob/main/sample-apps/hdkit_sample_app/app/assets/images/bodygraph-blank-with-gate-outlines.svg
// Extend each connected branch's two straight edges to the trunk's outer
// edge. Gate 34 also overlaps the trunk terminal by half a SVG unit,
// bridging its original gap without an exposed triangular connector.
// Hanging gates still use the original flat-ended GATE_PATHS.
export const INTEGRATION_JOINED_PATHS = {
  10: 'M342.37,683.81L217.275085,685.362072L207.210394,700.876824L342.52,699.21Z',
  34: 'M352.46,968.05L147.253594,825.147342L147.764364,824.36L134.104359,813.57L124.829830,827.866715L346.25,982.05Z'
};
// When only 34–57 is completed, the upper trunk is unlit. Trim both
// branches to their shared miter: the original 57 cap and the trunk-overlap
// shoulder would otherwise protrude above the outside edge of branch 34.
export const INTEGRATION_LOWER_BEND_PATHS = {
  34: 'M352.46,968.05L132.991682,815.215560L124.800412,827.846230L346.25,982.05Z',
  57: 'M132.991682,815.215560L147.253535,825.147301L79.76,929.14L64.44,920.92Z'
};
export const INTEGRATION_SPAN = [
  'M207.63,700.23L227.96,700.74L187.70,762.80L170.705,757.15Z',
  'M170.705,757.15L187.70,762.80L147.44,824.86L133.78,814.07Z'
];

// 10–20 and 34–57 meet at their own junctions. Only the other four
// Integration channels cross the shared span. A hanging gate must not
// color the span as if it completed a channel.
export function integrationSpanGates(channels) {
  const upper = new Set(), lower = new Set();
  for (const { gates } of channels) {
    const top = gates.find(g => g === 10 || g === 20);
    const bottom = gates.find(g => g === 34 || g === 57);
    if (top != null && bottom != null) {
      upper.add(top);
      lower.add(bottom);
    }
  }
  return [[...upper], [...lower]];
}
