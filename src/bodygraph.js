/**
 * Interactive Bodygraph Renderer for Bodygraph App
 *
 * Renders an SVG bodygraph with:
 * - Defined/undefined centers
 * - Active gate paths colored by activation type
 * - Gate labels with hover tooltips
 * - Click-to-expand gate details
 */

import { GATE_PATHS, CENTER_SHAPES, GATE_CIRCLE_POSITIONS } from 'natalengine/bodygraph-data';
import { GATES, CHANNELS } from 'natalengine';

function createSvgElement(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

/**
 * Render the bodygraph SVG into a container
 */
export function renderBodygraph(container, data) {
  const existing = container.querySelector('.bodygraph-svg');
  if (existing) existing.remove();

  const padding = 20;
  const svg = createSvgElement('svg', {
    class: 'bodygraph-svg',
    viewBox: `${-padding} ${-padding} ${851.41 + padding * 2} ${1309.4 + padding * 2}`,
    xmlns: 'http://www.w3.org/2000/svg'
  });

  // Determine active gates and their sources
  const personalityGateSet = new Set();
  const designGateSet = new Set();
  const activeGateSet = new Set(data.gates?.all || []);

  if (data.gates?.personality) {
    Object.values(data.gates.personality).forEach(g => { if (g) personalityGateSet.add(g.gate); });
  }
  if (data.gates?.design) {
    Object.values(data.gates.design).forEach(g => { if (g) designGateSet.add(g.gate); });
  }

  // Defined centers
  const definedCenters = new Set(data.centers?.definedNames || []);

  // Colors
  const colors = {
    personality: isDark() ? '#e0dcd6' : '#2d2d2d',
    design: '#c0392b',
    both: isDark() ? '#d4943a' : '#6b4423',
    inactive: isDark() ? '#2a2620' : '#e5e0da',
    definedCenter: isDark() ? '#d4943a' : '#c47a2a',
    undefinedCenter: isDark() ? '#1e1c18' : '#ffffff',
    centerStroke: isDark() ? '#3a3630' : '#c8c0b8',
    text: isDark() ? '#e8e4de' : '#1a1714',
    textInactive: isDark() ? '#4a4540' : '#b8b0a8',
    bg: isDark() ? '#1e1c18' : '#ffffff'
  };

  // --- Layer 1: Gate paths ---
  const pathGroup = createSvgElement('g', { class: 'gate-paths' });

  for (const [gateStr, pathData] of Object.entries(GATE_PATHS)) {
    const gateNum = parseInt(gateStr);
    const isActive = activeGateSet.has(gateNum);
    const isPersonality = personalityGateSet.has(gateNum);
    const isDesign = designGateSet.has(gateNum);

    let color = colors.inactive;
    if (isPersonality && isDesign) color = colors.both;
    else if (isPersonality) color = colors.personality;
    else if (isDesign) color = colors.design;

    const path = createSvgElement('path', {
      d: pathData,
      fill: color,
      opacity: isActive ? '1' : '0.35'
    });
    pathGroup.appendChild(path);
  }
  svg.appendChild(pathGroup);

  // --- Layer 2: Centers ---
  const centerGroup = createSvgElement('g', { class: 'centers' });

  // Map from CENTER_SHAPES keys to our internal center keys
  const shapeKeyMap = {
    Head: 'head', Ajna: 'ajna', Throat: 'throat',
    G: 'g', Ego: 'heart', Sacral: 'sacral',
    Spleen: 'spleen', SolarPlexus: 'solar', Root: 'root'
  };

  const shortNames = {
    Head: 'HD', Ajna: 'AJ', Throat: 'TH',
    G: 'G', Ego: 'EG', Sacral: 'SC',
    Spleen: 'SP', SolarPlexus: 'SP', Root: 'RT'
  };

  for (const [shapeKey, shapeData] of Object.entries(CENTER_SHAPES)) {
    const centerKey = shapeKeyMap[shapeKey];
    if (!centerKey) continue;

    const isDefined = definedCenters.has(centerKey);

    const shape = createSvgElement('path', {
      d: shapeData.path,
      fill: isDefined ? colors.definedCenter : colors.undefinedCenter,
      stroke: isDefined ? colors.definedCenter : colors.centerStroke,
      'stroke-width': isDefined ? '2' : '1.5',
      opacity: isDefined ? '0.9' : '1'
    });
    centerGroup.appendChild(shape);

    // Center label
    if (shapeData.center) {
      const label = createSvgElement('text', {
        x: shapeData.center.x,
        y: shapeData.center.y + 5,
        'text-anchor': 'middle',
        'font-size': '14',
        'font-weight': '600',
        'font-family': 'Inter, system-ui, sans-serif',
        fill: isDefined ? '#fff' : colors.text,
        'pointer-events': 'none'
      });
      label.textContent = shortNames[shapeKey] || '';
      centerGroup.appendChild(label);
    }
  }
  svg.appendChild(centerGroup);

  // --- Layer 3: Gate labels ---
  const gateGroup = createSvgElement('g', { class: 'gate-labels' });

  for (const [gateStr, circleData] of Object.entries(GATE_CIRCLE_POSITIONS)) {
    const gateNum = parseInt(gateStr);
    const isActive = activeGateSet.has(gateNum);
    const isPersonality = personalityGateSet.has(gateNum);
    const isDesign = designGateSet.has(gateNum);

    let fillColor = 'transparent';
    let textColor = colors.textInactive;

    if (isActive) {
      if (isPersonality && isDesign) { fillColor = colors.both; textColor = '#fff'; }
      else if (isPersonality) { fillColor = colors.personality; textColor = '#fff'; }
      else if (isDesign) { fillColor = colors.design; textColor = '#fff'; }
    }

    // Circle background
    const circle = createSvgElement('circle', {
      cx: circleData.cx,
      cy: circleData.cy,
      r: circleData.r || 12,
      fill: fillColor,
      stroke: isActive ? fillColor : colors.inactive,
      'stroke-width': isActive ? '0' : '1'
    });
    gateGroup.appendChild(circle);

    // Gate number text
    const text = createSvgElement('text', {
      x: circleData.cx,
      y: circleData.cy + 4,
      'text-anchor': 'middle',
      'font-size': '10',
      'font-weight': isActive ? '700' : '400',
      'font-family': 'Inter, system-ui, sans-serif',
      fill: textColor,
      'pointer-events': 'none'
    });
    text.textContent = gateNum;
    gateGroup.appendChild(text);
  }
  svg.appendChild(gateGroup);

  // --- Legend ---
  const legendY = 1280;
  const legendItems = [
    { label: 'Personality', color: colors.personality },
    { label: 'Design', color: colors.design },
    { label: 'Both', color: colors.both },
    { label: 'Defined Center', color: colors.definedCenter }
  ];

  let legendX = 200;
  legendItems.forEach(item => {
    const rect = createSvgElement('rect', {
      x: legendX, y: legendY, width: 10, height: 10,
      fill: item.color, rx: 2
    });
    const label = createSvgElement('text', {
      x: legendX + 14, y: legendY + 9,
      'font-size': '11', fill: colors.text,
      'font-family': 'Inter, system-ui, sans-serif'
    });
    label.textContent = item.label;
    svg.appendChild(rect);
    svg.appendChild(label);
    legendX += 14 + item.label.length * 6.5 + 16;
  });

  container.appendChild(svg);
}

export default renderBodygraph;
