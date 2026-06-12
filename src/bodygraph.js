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
// Vivid palette for dark mode: saturated hues that pop against near-black.
const CENTER_COLORS_DARK = {
  head: '#f0c040', ajna: '#5ebd6e', throat: '#c4884a',
  g: '#f0c040', heart: '#e74c3c', spleen: '#c4884a',
  solar: '#c4884a', sacral: '#e74c3c', root: '#c4884a'
};
const centerColors = () => isDark() ? CENTER_COLORS_DARK : CENTER_COLORS_LIGHT;

const SHAPE_KEY_MAP = {
  Head: 'head', Ajna: 'ajna', Throat: 'throat',
  G: 'g', Ego: 'heart', Sacral: 'sacral',
  Spleen: 'spleen', SolarPlexus: 'solar', Root: 'root'
};

const CENTER_DISPLAY = {
  head: 'Head', ajna: 'Ajna', throat: 'Throat', g: 'G',
  heart: 'Ego', spleen: 'Spleen', solar: 'Solar Plexus',
  sacral: 'Sacral', root: 'Root'
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
    personality: dark ? '#f5f0e8' : '#262220',
    design: dark ? '#e74c3c' : '#c0392b',
    inactive: dark ? '#8c847a' : '#b8b0a6',
    undefinedCenter: dark ? '#0d0c0a' : '#ffffff',
    centerStroke: dark ? '#5a5248' : '#c0b8ae',
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
  const showColumns = !opts.compact && opts.planetColumns !== false && !opts.composite;
  const animate = opts.animate !== false && !opts.compact;
  container.innerHTML = '';
  container.classList.add('bg-root');
  if (opts.compact) container.classList.add('bg-compact');

  const colors = palette();

  // Composite (two-person) overlay: color the body by WHO brings each gate,
  // instead of by personality/design. The half-channel model makes this read
  // beautifully — a two-tone channel is an electromagnetic bond.
  const composite = opts.composite || null;

  const personalityGates = new Map(); // gate -> [{planet, line}]
  const designGates = new Map();
  const addActivation = (map, planet, g) => {
    if (!g) return;
    if (!map.has(g.gate)) map.set(g.gate, []);
    map.get(g.gate).push({ planet, line: g.line });
  };
  if (!composite) {
    for (const [planet, g] of Object.entries(chart.gates?.personality || {})) addActivation(personalityGates, planet, g);
    for (const [planet, g] of Object.entries(chart.gates?.design || {})) addActivation(designGates, planet, g);
  }

  let aGates = null, bGates = null, gateOwner = null, centerOwner = null, channelDynamic = null;
  if (composite) {
    aGates = new Set(composite.chartA.gates.all);
    bGates = new Set(composite.chartB.gates.all);
    gateOwner = (g) => { const a = aGates.has(g), b = bGates.has(g); return a && b ? 'both' : a ? 'a' : b ? 'b' : null; };
  }

  const activeGates = composite
    ? new Set([...aGates, ...bGates])
    : new Set([...personalityGates.keys(), ...designGates.keys()]);

  // Channels present across the relationship (both gates appear in either chart).
  const compChannels = composite
    ? CHANNELS.filter(ch => activeGates.has(ch.gates[0]) && activeGates.has(ch.gates[1]))
    : null;
  const definedChannelKeys = composite
    ? new Set(compChannels.map(ch => ch.gates.join('-')))
    : new Set((chart.channels || []).map(ch => ch.gates.join('-')));

  let definedCenters;
  if (composite) {
    const compCenters = new Set();
    for (const ch of compChannels) for (const c of (ch.centers || [])) compCenters.add(c);
    definedCenters = compCenters;
    const aDef = new Set(composite.chartA.centers.definedNames);
    const bDef = new Set(composite.chartB.centers.definedNames);
    centerOwner = (key) => {
      if (!compCenters.has(key)) return null;
      const a = aDef.has(key), b = bDef.has(key);
      if (a && b) return 'both';
      if (a) return 'a';
      if (b) return 'b';
      return 'bridged'; // completed together — neither has it alone
    };
    channelDynamic = (ch) => {
      const [g1, g2] = ch.gates;
      const a1 = aGates.has(g1), a2 = aGates.has(g2), b1 = bGates.has(g1), b2 = bGates.has(g2);
      const aFull = a1 && a2, bFull = b1 && b2;
      if (aFull && bFull) return 'companionship';
      if (aFull || bFull) return (aFull ? (b1 || b2) : (a1 || a2)) ? 'compromise' : 'dominance';
      if ((a1 && b2) || (a2 && b1)) return 'electromagnetic';
      return null;
    };
  } else {
    definedCenters = new Set(chart.centers?.definedNames || []);
  }
  const transitGates = new Set(opts.transitGates || []);

  // ---------- SVG ----------
  const pad = 16;
  const chartSummary = composite
    ? `Combined Human Design bodygraph for ${composite.labelA} and ${composite.labelB}, colored by who carries each gate and channel.`
    : [
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

  // Whisper-subtle radial depth for defined centers: a slightly brighter core
  // fading to the traditional hue at the edge, so a defined center reads as
  // *energized* against a flat-white open one — without touching the hue identity.
  const lighten = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 255) + Math.round(255 * amt));
    const g = Math.min(255, ((n >> 8) & 255) + Math.round(255 * amt));
    const b = Math.min(255, (n & 255) + Math.round(255 * amt));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  };
  const coreAmt = isDark() ? 0.08 : 0.17;
  if (!composite) {
    for (const [key, color] of Object.entries(centerColors())) {
      const grad = svgEl('radialGradient', { id: `bg-cg-${key}`, cx: '0.5', cy: '0.36', r: '0.78' });
      grad.appendChild(svgEl('stop', { offset: '0', 'stop-color': lighten(color, coreAmt) }));
      grad.appendChild(svgEl('stop', { offset: '1', 'stop-color': color }));
      defs.appendChild(grad);
    }
  } else {
    // Person colors + a "together" hue for centers neither defines alone.
    const colA = composite.colorA, colB = composite.colorB;
    const colBridged = composite.colorBridged;
    // Two-tone stripe for gates both people carry (companionship at gate level).
    const ab = svgEl('pattern', { id: 'bg-stripe-ab', width: '8', height: '8', patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    ab.appendChild(svgEl('rect', { width: '8', height: '8', fill: colA }));
    ab.appendChild(svgEl('rect', { width: '4', height: '8', fill: colB }));
    defs.appendChild(ab);
    const radial = (id, color) => {
      const grad = svgEl('radialGradient', { id, cx: '0.5', cy: '0.36', r: '0.78' });
      grad.appendChild(svgEl('stop', { offset: '0', 'stop-color': lighten(color, coreAmt) }));
      grad.appendChild(svgEl('stop', { offset: '1', 'stop-color': color }));
      defs.appendChild(grad);
    };
    radial('bg-cc-a', colA);
    radial('bg-cc-b', colB);
    radial('bg-cc-bridged', colBridged);
    // Both define it → a diagonal blend from one person's hue to the other's.
    const both = svgEl('linearGradient', { id: 'bg-cc-both', x1: '0', y1: '0', x2: '1', y2: '1' });
    both.appendChild(svgEl('stop', { offset: '0', 'stop-color': colA }));
    both.appendChild(svgEl('stop', { offset: '1', 'stop-color': colB }));
    defs.appendChild(both);
  }
  svg.appendChild(defs);

  const gateFill = (gateNum) => {
    if (composite) {
      const o = gateOwner(gateNum);
      if (o === 'both') return 'url(#bg-stripe-ab)';
      if (o === 'a') return composite.colorA;
      if (o === 'b') return composite.colorB;
      return colors.inactive;
    }
    const p = personalityGates.has(gateNum);
    const d = designGates.has(gateNum);
    if (p && d) return 'url(#bg-stripe-both)';
    if (p) return colors.personality;
    if (d) return colors.design;
    return colors.inactive;
  };
  const centerFill = (key, defined) => {
    if (composite) {
      const o = centerOwner(key);
      return o ? `url(#bg-cc-${o})` : colors.undefinedCenter;
    }
    return defined ? `url(#bg-cg-${key})` : colors.undefinedCenter;
  };

  // --- Channel paths (one per gate = half-channel) ---
  const pathGroup = svgEl('g', { class: `bg-paths${animate ? ' bg-reveal-paths' : ''}` });
  const gatePathEls = {};
  for (const [gateStr, pathData] of Object.entries(GATE_PATHS)) {
    const gateNum = parseInt(gateStr);
    const isActive = activeGates.has(gateNum);
    const inactiveOpacity = isDark() ? '0.55' : '0.38';
    const path = svgEl('path', {
      d: pathData,
      fill: gateFill(gateNum),
      opacity: isActive ? '1' : inactiveOpacity,
      'data-gate': gateNum,
      class: 'bg-gate-path'
    });
    gatePathEls[gateNum] = path;
    pathGroup.appendChild(path);
  }
  svg.appendChild(pathGroup);

  // --- Centers (top-to-bottom order so the reveal animation flows down) ---
  const centerGroup = svgEl('g', { class: 'bg-centers' });
  const centerPathEls = {};
  const CENTER_REVEAL_ORDER = ['Head', 'Ajna', 'Throat', 'G', 'Ego', 'Spleen', 'SolarPlexus', 'Sacral', 'Root'];
  CENTER_REVEAL_ORDER.forEach((shapeKey, i) => {
    const shapeData = CENTER_SHAPES[shapeKey];
    const centerKey = SHAPE_KEY_MAP[shapeKey];
    if (!shapeData || !centerKey) return;
    const defined = definedCenters.has(centerKey);
    const path = svgEl('path', {
      d: shapeData.path,
      fill: centerFill(centerKey, defined),
      stroke: defined ? 'none' : colors.centerStroke,
      'stroke-width': '2',
      'data-center': centerKey,
      class: 'bg-center'
    });
    if (animate) {
      path.classList.add('bg-reveal');
      path.style.animationDelay = `${i * 70}ms`;
    }
    if (interactive) {
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('cursor', 'pointer');
      path.setAttribute('aria-label', `${CENTER_DISPLAY[centerKey] || centerKey} center, ${defined ? 'defined' : 'undefined'}`);
    }
    centerPathEls[centerKey] = path;
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
    const inactiveCircleOpacity = isDark() ? '0.55' : '0.42';
    g.appendChild(svgEl('circle', {
      cx: c.cx, cy: c.cy, r: c.r || 12.3,
      fill: isActive ? fill : colors.inactive,
      'fill-opacity': isActive ? '1' : inactiveCircleOpacity,
      stroke: 'none',
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
  // A selection is a gate OR a center. Selecting a gate lights it, its channel
  // partner (when defined), and the center(s) it touches; selecting a center
  // lights the center and the active gates inside it. Everything else dims, so
  // the chart reads as one focused object. `pinned` keeps a selection lit while
  // its detail card is open; hovering previews, and pointer-out reverts to the
  // pinned selection. `opts.onHighlight({gates,centers}|null)` lets the host
  // light the matching rows in the data panels (the reverse direction).
  let highlighted = null; // change-detection token
  let pinned = null;       // { kind:'gate'|'center', id } | null
  const tokenOf = (sel) => sel ? `${sel.kind}:${sel.id}` : null;

  function litFor(sel) {
    const gates = new Set();
    const centers = new Set();
    if (!sel) return { gates, centers };
    if (sel.kind === 'gate') {
      gates.add(sel.id);
      for (const ch of GATE_CHANNELS[sel.id] || []) {
        if (definedChannelKeys.has(ch.gates.join('-'))) ch.gates.forEach(g => gates.add(g));
      }
      for (const g of gates) { const ck = GATES[g]?.center; if (ck) centers.add(ck); }
    } else if (sel.kind === 'center') {
      centers.add(sel.id);
      for (const g of activeGates) { if (GATES[g]?.center === sel.id) gates.add(g); }
    }
    return { gates, centers };
  }

  function renderHighlight(sel) {
    for (const node of Object.values(gatePathEls)) node.classList.remove('bg-lit');
    for (const node of Object.values(gateCircleEls)) node.classList.remove('bg-lit');
    for (const node of Object.values(centerPathEls)) node.classList.remove('bg-lit');
    if (!sel) { svg.classList.remove('bg-dimmed'); return { gates: [], centers: [] }; }
    svg.classList.add('bg-dimmed');
    const { gates, centers } = litFor(sel);
    for (const g of gates) {
      gatePathEls[g]?.classList.add('bg-lit');
      gateCircleEls[g]?.classList.add('bg-lit');
    }
    for (const ck of centers) centerPathEls[ck]?.classList.add('bg-lit');
    return { gates: [...gates], centers: [...centers] };
  }

  function applySelection(sel) {
    const tok = tokenOf(sel);
    if (highlighted === tok) return;
    highlighted = tok;
    const lit = renderHighlight(sel);
    opts.onHighlight?.(sel ? lit : null);
  }

  function highlightGate(gateNum) {
    applySelection(gateNum == null ? pinned : { kind: 'gate', id: gateNum });
  }
  function highlightCenter(centerKey) {
    applySelection(centerKey == null ? pinned : { kind: 'center', id: centerKey });
  }

  // Keep a selection lit independent of hover (its detail card is open).
  function setPinned(sel) {
    pinned = sel; // { kind, id } | null
    highlighted = '__force__'; // force the next call to re-render
    applySelection(pinned);
  }

  // ---------- Tooltip + events ----------
  if (interactive) {
    const tooltip = el('div', { class: 'bg-tooltip', role: 'tooltip' });
    tooltip.style.display = 'none';

    function tooltipText(gateNum) {
      if (composite) return compositeGateTooltip(gateNum);
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

    function centerTooltipText(centerKey) {
      const dn = CENTER_DISPLAY[centerKey] || centerKey;
      if (composite) {
        const o = centerOwner(centerKey);
        const txt = o === 'both' ? 'Both of you define this'
          : o === 'a' ? `${composite.labelA} defines this`
          : o === 'b' ? `${composite.labelB} defines this`
          : o === 'bridged' ? 'Defined together — neither of you has it alone'
          : 'Open between you';
        return `<strong>${dn} Center</strong><div class="bg-tt-channel">${txt}</div>`;
      }
      const defined = definedCenters.has(centerKey);
      const count = [...activeGates].filter(g => GATES[g]?.center === centerKey).length;
      return `<strong>${dn} Center</strong>` +
        `<div class="bg-tt-channel">${defined ? 'Defined — consistent energy you radiate' : 'Open — you take this energy in'}` +
        (count ? ` · ${count} active gate${count === 1 ? '' : 's'}` : '') + `</div>`;
    }

    function compositeGateTooltip(g) {
      const gate = GATES[g];
      const o = gateOwner(g);
      const who = o === 'both' ? `${composite.labelA} + ${composite.labelB}`
        : o === 'a' ? composite.labelA : o === 'b' ? composite.labelB : 'Neither of you';
      const dyn = (GATE_CHANNELS[g] || [])
        .map(ch => { const d = channelDynamic(ch); return d ? `${d} · ${ch.name} (${ch.gates.join('-')})` : null; })
        .filter(Boolean);
      return `<strong>Gate ${g} — ${gate?.name || ''}</strong>` +
        `<div class="bg-tt-acts">${who}</div>` +
        (dyn.length ? `<div class="bg-tt-channel">${dyn.join('<br>')}</div>` : '');
    }

    function moveTooltip(evt) {
      const rect = container.getBoundingClientRect();
      tooltip.style.left = `${evt.clientX - rect.left + 12}px`;
      tooltip.style.top = `${evt.clientY - rect.top + 12}px`;
    }

    svg.addEventListener('pointerover', (evt) => {
      // Touch taps fire a synthetic hover that would leave a tooltip stuck and
      // double up with the click → detail. On touch we let the tap do the work.
      if (evt.pointerType === 'touch') return;
      const gateEl = evt.target.closest('[data-gate]');
      if (gateEl) {
        const gateNum = parseInt(gateEl.getAttribute('data-gate'));
        highlightGate(gateNum);
        tooltip.innerHTML = tooltipText(gateNum);
        tooltip.style.display = 'block';
        moveTooltip(evt);
        return;
      }
      const centerEl = evt.target.closest('[data-center]');
      if (centerEl) {
        const key = centerEl.getAttribute('data-center');
        highlightCenter(key);
        tooltip.innerHTML = centerTooltipText(key);
        tooltip.style.display = 'block';
        moveTooltip(evt);
      }
    });
    svg.addEventListener('pointermove', (evt) => {
      if (tooltip.style.display === 'block') moveTooltip(evt);
    });
    svg.addEventListener('pointerout', (evt) => {
      const rt = evt.relatedTarget;
      const stayingOnTarget = rt && svg.contains(rt) && (rt.closest('[data-gate]') || rt.closest('[data-center]'));
      if (!stayingOnTarget) {
        highlightGate(null); // reverts to the pinned selection (or clears)
        tooltip.style.display = 'none';
      }
    });
    svg.addEventListener('click', (evt) => {
      const gateEl = evt.target.closest('[data-gate]');
      if (gateEl && opts.onGateClick) { opts.onGateClick(parseInt(gateEl.getAttribute('data-gate'))); return; }
      const centerEl = evt.target.closest('[data-center]');
      if (centerEl && opts.onCenterClick) opts.onCenterClick(centerEl.getAttribute('data-center'));
    });
    svg.addEventListener('keydown', (evt) => {
      if (evt.key !== 'Enter' && evt.key !== ' ') return;
      const gateEl = evt.target.closest('[data-gate]');
      if (gateEl && opts.onGateClick) { evt.preventDefault(); opts.onGateClick(parseInt(gateEl.getAttribute('data-gate'))); return; }
      const centerEl = evt.target.closest('[data-center]');
      if (centerEl && opts.onCenterClick) { evt.preventDefault(); opts.onCenterClick(centerEl.getAttribute('data-center')); }
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
        row.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') highlightGate(g.gate); });
        row.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') highlightGate(null); });
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

  const api = { highlightGate, highlightCenter, setPinned };
  if (composite) Object.assign(api, { gateOwner, centerOwner, channelDynamic });
  return api;
}

export default renderBodygraph;
