/**
 * Interactive Bodygraph Renderer
 *
 * Renders the canonical Human Design bodygraph:
 * - Design (red) and Personality (black) planet columns flanking the graph
 * - Per-gate half-channel coloring: black / red / candy-striped for both
 * - Canonical center colors (yellow head & G, green ajna, brown throat/
 *   spleen/solar/root, red heart & sacral)
 * - Hover highlights + tooltips, click-through to gate detail
 * - Optional transit-gate overlay
 *
 * Geometry from hdkit (MIT) via natalengine/bodygraph-data.
 */

import { GATE_PATHS, CENTER_SHAPES, GATE_CIRCLE_POSITIONS } from 'natalengine/bodygraph-data';
import { GATES, CHANNELS } from 'natalengine';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, ns = null) {
  const node = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.setAttribute('class', value);
    else node.setAttribute(key, value);
  }
  return node;
}
const svgEl = (tag, attrs) => el(tag, attrs, SVG_NS);

const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

// Canonical HD planet-column order (Nodes before Moon) and glyphs
export const PLANET_ORDER = [
  'sun', 'earth', 'northNode', 'southNode', 'moon', 'mercury',
  'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'
];

export const PLANET_GLYPHS = {
  sun: '☉', earth: '⊕', moon: '☽', northNode: '☊', southNode: '☋',
  mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄',
  uranus: '♅', neptune: '♆', pluto: '♇'
};

export const PLANET_NAMES = {
  sun: 'Sun', earth: 'Earth', moon: 'Moon', northNode: 'North Node',
  southNode: 'South Node', mercury: 'Mercury', venus: 'Venus', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune',
  pluto: 'Pluto'
};

// Traditional center colors (defined state): Head & G yellow, Ajna green,
// Heart & Sacral red, Throat/Spleen/Solar Plexus/Root brown-tan — tuned
// per theme so the centerpiece respects dark mode instead of glowing.
const CENTER_COLORS_LIGHT = {
  head: '#e9d56b', ajna: '#a3c46c', throat: '#c2a06b',
  g: '#e9d56b', heart: '#dd6356', spleen: '#c2a06b',
  solar: '#c2a06b', sacral: '#dd6356', root: '#c2a06b'
};
const CENTER_COLORS_DARK = {
  head: '#bfa94e', ajna: '#7a9c52', throat: '#9c7f53',
  g: '#bfa94e', heart: '#b54a40', spleen: '#9c7f53',
  solar: '#9c7f53', sacral: '#b54a40', root: '#9c7f53'
};
const centerColors = () => isDark() ? CENTER_COLORS_DARK : CENTER_COLORS_LIGHT;

const SHAPE_KEY_MAP = {
  Head: 'head', Ajna: 'ajna', Throat: 'throat',
  G: 'g', Ego: 'heart', Sacral: 'sacral',
  Spleen: 'spleen', SolarPlexus: 'solar', Root: 'root'
};

// gate -> [channels containing it]
const GATE_CHANNELS = {};
for (const ch of CHANNELS) {
  for (const g of ch.gates) {
    (GATE_CHANNELS[g] = GATE_CHANNELS[g] || []).push(ch);
  }
}

function palette() {
  const dark = isDark();
  return {
    personality: dark ? '#cfc7bb' : '#262220',
    design: dark ? '#e05545' : '#c0392b',
    inactive: dark ? '#28241f' : '#eae5df',
    undefinedCenter: dark ? '#1e1c18' : '#ffffff',
    centerStroke: dark ? '#3a3630' : '#cfc7be',
    text: dark ? '#e8e4de' : '#1a1714',
    textInactive: dark ? '#6f685f' : '#a39a90',
    transit: dark ? '#d4943a' : '#c47a2a'
  };
}

/**
 * Render a bodygraph into `container`.
 *
 * @param {HTMLElement} container
 * @param {object} chart - calculateHumanDesign() result
 * @param {object} [opts]
 * @param {boolean} [opts.compact] - mini graph: no columns, no tooltips, no animation
 * @param {boolean} [opts.planetColumns] - set false to hide columns but keep interactivity
 * @param {boolean} [opts.animate] - reveal animation (default true unless compact)
 * @param {function} [opts.onGateClick] - (gateNum) => void
 * @param {Iterable<number>} [opts.transitGates] - gates to ring with transit overlay
 * @returns {{ highlightGate: (g: number|null) => void }}
 */
export function renderBodygraph(container, chart, opts = {}) {
  const interactive = !opts.compact;
  const showColumns = !opts.compact && opts.planetColumns !== false;
  const animate = opts.animate !== false && !opts.compact;
  container.innerHTML = '';
  container.classList.add('bg-root');
  if (opts.compact) container.classList.add('bg-compact');

  const colors = palette();

  const personalityGates = new Map(); // gate -> [{planet, line}]
  const designGates = new Map();
  const addActivation = (map, planet, g) => {
    if (!g) return;
    if (!map.has(g.gate)) map.set(g.gate, []);
    map.get(g.gate).push({ planet, line: g.line });
  };
  for (const [planet, g] of Object.entries(chart.gates?.personality || {})) addActivation(personalityGates, planet, g);
  for (const [planet, g] of Object.entries(chart.gates?.design || {})) addActivation(designGates, planet, g);
  const activeGates = new Set([...personalityGates.keys(), ...designGates.keys()]);
  const definedCenters = new Set(chart.centers?.definedNames || []);
  const definedChannelKeys = new Set((chart.channels || []).map(ch => ch.gates.join('-')));
  const transitGates = new Set(opts.transitGates || []);

  // ---------- SVG ----------
  const pad = 16;
  const chartSummary = [
    `Human Design bodygraph.`,
    chart.type?.name ? `Type: ${chart.type.name}.` : '',
    chart.profile?.numbers ? `Profile ${chart.profile.numbers}.` : '',
    chart.authority?.name ? `${chart.authority.name}.` : '',
    definedCenters.size
      ? `Defined centers: ${[...definedCenters].join(', ')}.`
      : 'No defined centers (Reflector).',
    chart.channels?.length
      ? `Active channels: ${chart.channels.map(c => `${c.gates.join('-')} ${c.name}`).join('; ')}.`
      : ''
  ].filter(Boolean).join(' ');

  const svg = svgEl('svg', {
    class: 'bodygraph-svg',
    viewBox: `${-pad} ${-pad} ${851.41 + pad * 2} ${1309.4 + pad * 2}`,
    role: 'img',
    'aria-label': chartSummary
  });

  // Stripe pattern for gates activated by both personality and design
  const defs = svgEl('defs');
  const pattern = svgEl('pattern', {
    id: 'bg-stripe-both', width: '8', height: '8',
    patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'
  });
  pattern.appendChild(svgEl('rect', { width: '8', height: '8', fill: colors.personality }));
  pattern.appendChild(svgEl('rect', { width: '4', height: '8', fill: colors.design }));
  defs.appendChild(pattern);
  svg.appendChild(defs);

  const gateFill = (gateNum) => {
    const p = personalityGates.has(gateNum);
    const d = designGates.has(gateNum);
    if (p && d) return 'url(#bg-stripe-both)';
    if (p) return colors.personality;
    if (d) return colors.design;
    return colors.inactive;
  };

  // --- Channel paths (one per gate = half-channel) ---
  const pathGroup = svgEl('g', { class: `bg-paths${animate ? ' bg-reveal-paths' : ''}` });
  const gatePathEls = {};
  for (const [gateStr, pathData] of Object.entries(GATE_PATHS)) {
    const gateNum = parseInt(gateStr);
    const isActive = activeGates.has(gateNum);
    const path = svgEl('path', {
      d: pathData,
      fill: gateFill(gateNum),
      opacity: isActive ? '1' : '0.4',
      'data-gate': gateNum,
      class: 'bg-gate-path'
    });
    gatePathEls[gateNum] = path;
    pathGroup.appendChild(path);
  }
  svg.appendChild(pathGroup);

  // --- Centers (top-to-bottom order so the reveal animation flows down) ---
  const centerGroup = svgEl('g', { class: 'bg-centers' });
  const CENTER_REVEAL_ORDER = ['Head', 'Ajna', 'Throat', 'G', 'Ego', 'Spleen', 'SolarPlexus', 'Sacral', 'Root'];
  CENTER_REVEAL_ORDER.forEach((shapeKey, i) => {
    const shapeData = CENTER_SHAPES[shapeKey];
    const centerKey = SHAPE_KEY_MAP[shapeKey];
    if (!shapeData || !centerKey) return;
    const defined = definedCenters.has(centerKey);
    const path = svgEl('path', {
      d: shapeData.path,
      fill: defined ? centerColors()[centerKey] : colors.undefinedCenter,
      stroke: defined ? 'none' : colors.centerStroke,
      'stroke-width': '1.5',
      'data-center': centerKey,
      class: 'bg-center'
    });
    if (animate) {
      path.classList.add('bg-reveal');
      path.style.animationDelay = `${i * 70}ms`;
    }
    centerGroup.appendChild(path);
  });
  svg.appendChild(centerGroup);

  // --- Gate circles + numbers ---
  const gateGroup = svgEl('g', { class: 'bg-gates' });
  const gateCircleEls = {};
  for (const [gateStr, c] of Object.entries(GATE_CIRCLE_POSITIONS)) {
    const gateNum = parseInt(gateStr);
    const isActive = activeGates.has(gateNum);
    const fill = gateFill(gateNum);

    const g = svgEl('g', { class: 'bg-gate', 'data-gate': gateNum, cursor: opts.compact ? 'default' : 'pointer' });
    if (interactive) {
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `Gate ${gateNum}${GATES[gateNum]?.name ? ' — ' + GATES[gateNum].name : ''}${isActive ? ', active' : ', inactive'}`);
      // Invisible enlarged hit area (~44px-equivalent) so fingers can
      // actually tap a gate; the visible circle stays delicate.
      g.appendChild(svgEl('circle', {
        cx: c.cx, cy: c.cy, r: 24,
        fill: 'transparent', stroke: 'none', class: 'bg-gate-hit'
      }));
    }
    g.appendChild(svgEl('circle', {
      cx: c.cx, cy: c.cy, r: c.r || 12.3,
      fill: isActive ? fill : 'transparent',
      stroke: isActive ? 'none' : colors.inactive,
      'stroke-width': '1',
      class: 'bg-gate-circle'
    }));
    if (transitGates.has(gateNum)) {
      g.appendChild(svgEl('circle', {
        cx: c.cx, cy: c.cy, r: (c.r || 12.3) + 4.5,
        fill: 'none', stroke: colors.transit, 'stroke-width': '2.5',
        'stroke-dasharray': '4 3', class: 'bg-transit-ring'
      }));
    }
    // Text must contrast with the circle fill: in dark mode the
    // personality fill is light, so use dark text there.
    const litTextColor = isDark() && personalityGates.has(gateNum) ? '#16130f' : '#fff';
    g.appendChild(svgEl('text', {
      x: c.cx, y: c.cy + 4,
      'text-anchor': 'middle', 'font-size': '11',
      'font-weight': isActive ? '700' : '400',
      'font-family': 'Inter, system-ui, sans-serif',
      fill: isActive ? litTextColor : colors.textInactive,
      'pointer-events': 'none',
      text: gateNum
    }));
    gateCircleEls[gateNum] = g;
    gateGroup.appendChild(g);
  }
  svg.appendChild(gateGroup);

  // ---------- Highlight machinery ----------
  let highlighted = null;
  function setDim(dim) {
    svg.classList.toggle('bg-dimmed', dim);
  }
  function highlightGate(gateNum) {
    if (highlighted === gateNum) return;
    // clear
    for (const elList of [gatePathEls, gateCircleEls]) {
      for (const node of Object.values(elList)) node.classList.remove('bg-lit');
    }
    highlighted = gateNum;
    if (gateNum == null) { setDim(false); return; }
    setDim(true);
    const lit = new Set([gateNum]);
    // light the full channel when the partner is also active
    for (const ch of GATE_CHANNELS[gateNum] || []) {
      if (definedChannelKeys.has(ch.gates.join('-'))) ch.gates.forEach(g => lit.add(g));
    }
    for (const g of lit) {
      gatePathEls[g]?.classList.add('bg-lit');
      gateCircleEls[g]?.classList.add('bg-lit');
    }
  }

  // ---------- Tooltip + events ----------
  if (interactive) {
    const tooltip = el('div', { class: 'bg-tooltip', role: 'tooltip' });
    tooltip.style.display = 'none';

    function tooltipText(gateNum) {
      const gate = GATES[gateNum];
      const acts = [];
      for (const { planet, line } of designGates.get(gateNum) || []) {
        acts.push(`<span class="bg-tt-design">${PLANET_GLYPHS[planet]} ${gateNum}.${line}</span>`);
      }
      for (const { planet, line } of personalityGates.get(gateNum) || []) {
        acts.push(`<span class="bg-tt-personality">${PLANET_GLYPHS[planet]} ${gateNum}.${line}</span>`);
      }
      const channelNote = (GATE_CHANNELS[gateNum] || [])
        .filter(ch => definedChannelKeys.has(ch.gates.join('-')))
        .map(ch => `Channel of ${ch.name} (${ch.gates.join('-')})`)
        .join(' · ');
      return `<strong>Gate ${gateNum} — ${gate?.name || ''}</strong>` +
        (acts.length ? `<div class="bg-tt-acts">${acts.join(' ')}</div>` : '') +
        (channelNote ? `<div class="bg-tt-channel">${channelNote}</div>` : '');
    }

    function moveTooltip(evt) {
      const rect = container.getBoundingClientRect();
      tooltip.style.left = `${evt.clientX - rect.left + 12}px`;
      tooltip.style.top = `${evt.clientY - rect.top + 12}px`;
    }

    svg.addEventListener('pointerover', (evt) => {
      const target = evt.target.closest('[data-gate]');
      if (!target) return;
      const gateNum = parseInt(target.getAttribute('data-gate'));
      highlightGate(gateNum);
      tooltip.innerHTML = tooltipText(gateNum);
      tooltip.style.display = 'block';
      moveTooltip(evt);
    });
    svg.addEventListener('pointermove', (evt) => {
      if (tooltip.style.display === 'block') moveTooltip(evt);
    });
    svg.addEventListener('pointerout', (evt) => {
      if (!evt.relatedTarget || !svg.contains(evt.relatedTarget) || !evt.relatedTarget.closest('[data-gate]')) {
        highlightGate(null);
        tooltip.style.display = 'none';
      }
    });
    svg.addEventListener('click', (evt) => {
      const target = evt.target.closest('[data-gate]');
      if (target && opts.onGateClick) opts.onGateClick(parseInt(target.getAttribute('data-gate')));
    });
    svg.addEventListener('keydown', (evt) => {
      if (evt.key !== 'Enter' && evt.key !== ' ') return;
      const target = evt.target.closest('[data-gate]');
      if (target && opts.onGateClick) {
        evt.preventDefault();
        opts.onGateClick(parseInt(target.getAttribute('data-gate')));
      }
    });

    container.appendChild(tooltip);
  }

  // ---------- Planet columns ----------
  function planetColumn(side, gates, dateLabel) {
    const col = el('div', { class: `bg-planets bg-planets-${side}` });
    const title = side === 'design' ? 'Design' : 'Personality';
    col.appendChild(el('div', {
      class: 'bg-planets-head',
      text: title
    }));
    if (dateLabel) col.appendChild(el('div', { class: 'bg-planets-date', text: dateLabel }));
    for (const planet of PLANET_ORDER) {
      const g = gates?.[planet];
      const row = el('button', {
        class: 'bg-planet-row',
        type: 'button',
        'data-gate': g ? g.gate : '',
        title: PLANET_NAMES[planet],
        'aria-label': g ? `${title} ${PLANET_NAMES[planet]}: gate ${g.gate} line ${g.line}` : `${PLANET_NAMES[planet]}: no activation`
      });
      row.appendChild(el('span', { class: 'bg-planet-glyph', text: PLANET_GLYPHS[planet] }));
      row.appendChild(el('span', { class: 'bg-planet-act', text: g ? `${g.gate}.${g.line}` : '—' }));
      if (g) {
        row.addEventListener('pointerenter', () => highlightGate(g.gate));
        row.addEventListener('pointerleave', () => highlightGate(null));
        if (opts.onGateClick) {
          row.style.cursor = 'pointer';
          row.addEventListener('click', () => opts.onGateClick(g.gate));
        }
      }
      col.appendChild(row);
    }
    return col;
  }

  if (showColumns) {
    const designDate = chart.positions?.design?.date || null;
    const wrap = el('div', { class: 'bg-grid' });
    wrap.appendChild(planetColumn('design', chart.gates?.design, designDate));
    const svgWrap = el('div', { class: 'bg-svg-wrap' });
    svgWrap.appendChild(svg);
    wrap.appendChild(svgWrap);
    wrap.appendChild(planetColumn('personality', chart.gates?.personality, chart.positions?.personality?.date || null));
    container.appendChild(wrap);
  } else {
    container.appendChild(svg);
  }

  return { highlightGate };
}

export default renderBodygraph;
