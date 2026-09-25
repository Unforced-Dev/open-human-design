/** App-to-feature bridge for chart data, rendering, and shared detail dialogs. */
import { createTransitTimeline } from '../features/transit-timeline/view.js';
import { calculateLineFixings, calculateTransitLineFixings } from '../features/transit-timeline/line-fixing.js';
import { snapshot, natalIdentity } from '../features/transit-timeline/provider.js';
import { buildTransitGraph } from '../lib/transit-graph.js';
import { transitInstants, formatTransitOffset } from '../lib/transit-time.js';
import { closeDetailDialog } from '../lib/detail-dialog.js';
import { getCurrentChart, showTransitDetail, refreshTransitDetail } from './chart.js';
import { renderBodygraph, PLANET_ORDER, PLANET_GLYPHS } from '../bodygraph.js';
import { getLocaleResources, t } from '../lib/i18n.js';
import { centerName, channelName, gateName, planetName } from '../lib/vocabulary.js';

// Localize display labels only; worker row IDs and calculation data stay intact.
export function timelineRowLabel(row) {
  if (row.kind === 'center') return centerName(row.id);
  if (row.kind === 'channel') return `${row.id} · ${channelName(row.id)}`;
  return t('Gate {gate} · {name}', { gate: row.id, name: gateName(row.id) });
}

export function timelineLanguageOptions() {
  return { ...getLocaleResources().timeline, label: timelineRowLabel };
}

export function setupTimelineView(options = {}) {
  return createTransitTimeline({
    root: document.getElementById('timeline-view'),
    ...timelineLanguageOptions(),
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
      showDetail: showTransitDetail,
      refreshDetail: refreshTransitDetail,
      planets: PLANET_ORDER.map(id => ({ id, get name() { return planetName(id); }, glyph: PLANET_GLYPHS[id] })),
      renderGraph(container, chart, context, onHighlight) {
        return renderBodygraph(container, chart, {
          planetColumns: false, animate: false,
          transitGates: context.model.transitGates, transitModel: context.model,
          onGateClick: gate => showTransitDetail('gate', gate, context),
          onCenterClick: center => showTransitDetail('center', center, context),
          onHighlight
        });
      }
    }
  });
}
