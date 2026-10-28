/** App-to-feature bridge for chart data, rendering, and shared detail dialogs. */
import { createTransitTimeline } from '../features/transit-timeline/view.js';
import { snapshot, natalIdentity } from '../features/transit-timeline/provider.js';
import { buildTransitGraph } from '../lib/transit-graph.js';
import { transitInstants, formatTransitOffset } from '../lib/transit-time.js';
import { registerScope, openDetail, closeDetail } from '../detail-panel.js';
import { getCurrentChart } from './chart.js';
import { renderBodygraph, PLANET_ORDER, PLANET_NAMES, PLANET_GLYPHS } from '../bodygraph.js';

let detailContext = null; // the timeline's { transitGates, mode, model, api, ... } at the opened moment

registerScope('timeline', {
  renderer: 'chart',
  context: () => {
    const current = getCurrentChart();
    return current && detailContext?.model && {
      chart: current.chart, geneKeys: current.geneKeys, transitGates: detailContext.model.transitGates
    };
  },
  onShow: (_entry, result) => detailContext?.api?.setPinned?.(result.pin || null),
  onClose: () => { detailContext?.api?.setPinned?.(null); detailContext?.onDetailClose?.(); }
});

function showTransitDetail(kind, id, context) {
  detailContext = context;
  openDetail('timeline', kind, id);
}

export function setupTimelineView() {
  return createTransitTimeline({
    root: document.getElementById('timeline-view'),
    host: {
      getChart: getCurrentChart,
      snapshot,
      identity: natalIdentity,
      buildModel: buildTransitGraph,
      resolveTime: transitInstants,
      formatOffset: formatTransitOffset,
      closeDetail,
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
