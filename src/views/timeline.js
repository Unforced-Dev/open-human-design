/** App-to-feature bridge for chart data, rendering, and shared detail dialogs. */
import { createTransitTimeline } from '../features/transit-timeline/view.js';
import { calculateLineFixings, calculateTransitLineFixings } from '../features/transit-timeline/line-fixing.js';
import { snapshot, natalIdentity } from '../features/transit-timeline/provider.js';
import { buildTransitGraph } from '../lib/transit-graph.js';
import { transitInstants, formatTransitOffset } from '../lib/transit-time.js';
import { closeDetailDialog } from '../lib/detail-dialog.js';
import { getCurrentChart, showTransitDetail } from './chart.js';
import { renderBodygraph, PLANET_ORDER, PLANET_NAMES, PLANET_GLYPHS } from '../bodygraph.js';

export function setupTimelineView(options = {}) {
  return createTransitTimeline({
    root: document.getElementById('timeline-view'),
    ...options,
    host: {
      getChart: getCurrentChart,
      snapshot,
      lineFixings: (chart, transit) => ({ birth: calculateLineFixings(chart, transit), transit: calculateTransitLineFixings(chart, transit) }),
      identity: natalIdentity,
      buildModel: buildTransitGraph,
      resolveTime: transitInstants,
      formatOffset: formatTransitOffset,
      closeDetail: closeDetailDialog,
      onExit: () => document.querySelector('.nav-link[data-view="chart"]')?.click(),
      showDetail: showTransitDetail,
      planets: PLANET_ORDER.map(id => ({ id, name: PLANET_NAMES[id], glyph: PLANET_GLYPHS[id] })),
      renderGraph(container, chart, context, onHighlight) {
        return renderBodygraph(container, chart, {
          planetColumns: false, animate: false, touchPreview: true,
          transitGates: context.model.transitGates, transitModel: context.model,
          onGateClick: gate => showTransitDetail('gate', gate, context),
          onCenterClick: center => showTransitDetail('center', center, context),
          onHighlight
        });
      }
    }
  });
}
