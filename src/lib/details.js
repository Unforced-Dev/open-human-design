/**
 * Detail content — one renderer per kind of thing a person can tap: gate,
 * line, channel, center, planet, type, authority, profile, definition, cross,
 * circuit, variable arrow, and the Connection / Team items.
 *
 * Pure: (kind, id, ctx) → { label, title, body, pin? } with HTML strings.
 * No DOM, so node tests can render every item of many charts. The panel shell
 * (src/detail-panel.js) owns presentation, history and focus.
 *
 * Links onward are buttons carrying data-detail="kind:id"; the shell opens
 * them in place, so nobody has to leave the panel to learn what a word means.
 *
 * ctx shapes:
 *   chart: { chart, geneKeys?, transitGates?: Set }
 *   pair:  { a, b, nameA, nameB, comparison, model }   (see lib/pair.js)
 *   team:  { result, charts, names }
 */

import {
  GATES, CHANNELS, CENTERS, TYPES, PROFILES, AUTHORITIES, CIRCUIT_GROUPS,
  GATE_DESCRIPTIONS, LINE_DESCRIPTIONS, CHANNEL_DESCRIPTIONS,
  HEXAGRAM_DESCRIPTIONS, GENE_KEY_DESCRIPTIONS, LINE_NAMES
} from 'natalengine';
import { esc } from './format.js';
import {
  LINE_THEMES, TYPE_GUIDANCE, CIRCUIT_DESC, PLANET_ORDER, PLANET_GLYPHS, PLANET_NAMES,
  PLANET_TEXT, SIDE_TEXT, SUBSTRUCTURE_TEXT, AUTHORITY_TEXT, DEFINITION_TEXT, DEFINED_TEXT,
  VARIABLE_TEXT, ARROW_TEXT, CROSS_TEXT, ANGLE_TEXT, CONNECTION_TYPES, PENTA_TEXT
} from './glossary.js';

// ---------- small helpers ----------

/** A link onward: opens kind:id in the same panel. */
export const dl = (kind, id, label, cls = '') =>
  `<button type="button" class="dlink ${cls}" data-detail="${esc(kind)}:${esc(String(id))}">${label}</button>`;

/** Attribute string that makes any element a detail trigger. */
export const dt = (kind, id) => `data-detail="${esc(kind)}:${esc(String(id))}"`;

const section = (label, html) => html ? `<div class="dp-section"><div class="dp-section-label">${label}</div>${html}</div>` : '';
const para = (text, cls = 'dp-text') => text ? `<p class="${cls}">${esc(text)}</p>` : '';
const chips = (items) => items.length ? `<div class="dp-chips">${items.join('')}</div>` : '';
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

const CENTER_ORDER = ['head', 'ajna', 'throat', 'g', 'heart', 'spleen', 'solar', 'sacral', 'root'];
const centerName = (key) => key === 'heart' ? 'Heart (Ego)' : key === 'solar' ? 'Solar Plexus' : (CENTERS[key]?.name || key);
const channelKey = (ch) => ch.gates.join('-');
const CHANNEL_BY_KEY = Object.fromEntries(CHANNELS.map(ch => [channelKey(ch), ch]));
const channelsOfGate = (g) => CHANNELS.filter(ch => ch.gates.includes(g));
const gatesOfCenter = (key) => Object.keys(GATES).map(Number).filter(g => GATES[g].center === key).sort((x, y) => x - y);
const typeKeyByName = (name) => Object.keys(TYPES).find(k => TYPES[k].name === name);
const authorityByName = (name) => Object.values(AUTHORITIES).find(a => a.name === name);

// Which center gives each inner authority its voice.
const AUTHORITY_CENTER = {
  'Emotional Authority': 'solar', 'Sacral Authority': 'sacral', 'Splenic Authority': 'spleen',
  'Ego/Heart Authority': 'heart', 'Self-Projected Authority': 'g'
};

const gateLabel = (g) => `Gate ${g}${GATES[g]?.name ? ` · ${esc(GATES[g].name)}` : ''}`;
const gateLink = (g, cls = '') => dl('gate', g, gateLabel(g), cls);
const channelLink = (ch, cls = '') => dl('channel', channelKey(ch), `${esc(ch.name)} <span class="dl-sub">${ch.gates.join('–')}</span>`, cls);
const centerLink = (key, cls = '') => dl('center', key, esc(centerName(key)), cls);
const circuitLink = (c) => c ? dl('circuit', c, `${esc(cap(c))} circuit`, `circuit-link ${esc(c)}`) : '';

/** All activations of a gate in a chart: [{ side, planet, line, color, tone, base }]. */
function activationsOf(chart, g) {
  const out = [];
  for (const side of ['design', 'personality']) {
    for (const planet of PLANET_ORDER) {
      const a = chart.gates[side]?.[planet];
      if (a?.gate === g) out.push({ side, planet, ...a });
    }
  }
  return out;
}

const sideName = (side) => side === 'design' ? 'Design' : 'Personality';
const planetId = (side, planet) => `${side}.${planet}`;
const actLabel = (a) => `${PLANET_GLYPHS[a.planet]} ${sideName(a.side)} ${PLANET_NAMES[a.planet]} · ${a.gate}.${a.line}`;
const actLink = (a) => dl('planet', planetId(a.side, a.planet), esc(actLabel(a)), `act-${a.side}`);

// ---------- lens (gate reading tradition) ----------
let lens = 'hd';
export const LENSES = [['hd', 'Human Design'], ['iching', 'I Ching'], ['gk', 'Gene Keys']];
export function setLens(next) { if (LENSES.some(([k]) => k === next)) lens = next; }
export function getLens() { return lens; }

function lensBody(g, activeLines) {
  if (lens === 'iching') {
    const hx = HEXAGRAM_DESCRIPTIONS[g];
    if (!hx) return para('No I Ching reading available.');
    const lines = activeLines.map(l => hx.lines?.[l]
      ? `<div class="dp-card"><strong>Line ${l}</strong>${para(hx.lines[l])}</div>` : '').join('');
    return `<div class="dp-keynote">Hexagram ${g} · ${esc(hx.name)}</div>${para(hx.meaning)}${lines}
      <p class="dp-note">The I Ching hexagram this gate is built on — Human Design draws its 64 gates from this classical source.</p>`;
  }
  if (lens === 'gk') {
    const gk = GENE_KEY_DESCRIPTIONS[g];
    if (!gk) return para('No Gene Keys reading available.');
    return `<div class="gk-spectrum"><span class="gk-shadow">${esc(gk.shadow)}</span><span class="gk-arrow">→</span><span class="gk-gift">${esc(gk.gift)}</span><span class="gk-arrow">→</span><span class="gk-siddhi">${esc(gk.siddhi)}</span></div>
      ${para(gk.description)}
      <p class="dp-note">Gene Key ${g} · the Shadow → Gift → Siddhi spectrum (Richard Rudd's evolution of Human Design).</p>`;
  }
  const desc = GATE_DESCRIPTIONS[g];
  return `${desc?.keynote ? `<div class="dp-keynote">${esc(desc.keynote)}</div>` : ''}${para(desc?.description)}`;
}

const lensSwitch = () => `<div class="lens-switch" role="group" aria-label="Reading tradition">${LENSES.map(([k, label]) =>
  `<button type="button" data-lens="${k}" class="${k === lens ? 'active' : ''}" aria-pressed="${k === lens}">${label}</button>`).join('')}</div>`;

/** Six line chips for a gate, the active ones marked, each opening that line. */
function lineChips(g, activeLines = []) {
  return chips([1, 2, 3, 4, 5, 6].map(l => {
    const ld = LINE_DESCRIPTIONS[g]?.[l];
    return dl('line', `${g}.${l}`, `${l}${ld?.keynote ? ` <span class="dl-sub">${esc(ld.keynote)}</span>` : ''}`,
      `line-chip ${activeLines.includes(l) ? 'on' : ''}`);
  }));
}

// ==========================================================================
// Chart scope
// ==========================================================================

function centerStatus(chart, key) {
  if (chart.centers.definedNames.includes(key)) return 'defined';
  if (chart.centers.undefinedNames.includes(key)) return 'undefined';
  return 'open';
}

function chartGate(g, { chart, transitGates }) {
  const gate = GATES[g];
  if (!gate) return null;
  const acts = activationsOf(chart, g);
  const activeLines = [...new Set(acts.map(a => a.line))].sort((x, y) => x - y);
  const definedKeys = new Set(chart.channels.map(channelKey));
  const active = new Set(chart.gates.all);

  const actHtml = acts.length
    ? chips(acts.map(actLink))
    : `<p class="dp-muted">Not active in this chart — you meet this energy through other people and transits.</p>`;

  const lineCards = lens === 'hd' ? activeLines.map(l => {
    const ld = LINE_DESCRIPTIONS[g]?.[l];
    return ld ? `<div class="dp-card" data-gate="${g}">${dl('line', `${g}.${l}`, `Line ${l} · ${esc(ld.keynote)}`, 'dp-card-title')}${para(ld.description)}</div>` : '';
  }).join('') : '';

  const channelRows = channelsOfGate(g).map(ch => {
    const other = ch.gates.find(x => x !== g);
    const status = definedKeys.has(channelKey(ch)) ? 'Defined in your chart'
      : active.has(g) && !active.has(other) ? `Hanging — you're drawn to people with Gate ${other}`
      : active.has(other) && !active.has(g) ? `You carry the other half (Gate ${other})`
      : 'Not active';
    return `<div class="dp-row">${channelLink(ch, definedKeys.has(channelKey(ch)) ? 'on' : '')}<span class="dp-row-note">${esc(status)}</span></div>`;
  }).join('');

  const cs = centerStatus(chart, gate.center);
  const transitNote = transitGates?.has(g)
    ? `<p class="dp-callout">A transiting planet sits in this gate on the chosen date.</p>` : '';

  return {
    label: `Gate ${g}`,
    title: esc(gate.name),
    pin: { kind: 'gate', id: g },
    body: `
      ${transitNote}
      ${section('In your chart', actHtml)}
      ${lensSwitch()}
      <div class="dp-lens">${lensBody(g, activeLines)}</div>
      ${lineCards}
      ${section('Lines of this gate', lineChips(g, activeLines))}
      ${section('Channels', channelRows)}
      ${section('Center', `<div class="dp-row">${centerLink(gate.center)}<span class="dp-row-note">${cap(cs)} in your chart</span></div>`)}
      ${GATE_DESCRIPTIONS[g]?.harmonic ? section('Harmonic gate', gateLink(GATE_DESCRIPTIONS[g].harmonic)) : ''}`
  };
}

function chartLine(id, { chart }) {
  const [g, l] = String(id).split('.').map(Number);
  const ld = LINE_DESCRIPTIONS[g]?.[l];
  if (!GATES[g] || !ld) return null;
  const here = chart ? activationsOf(chart, g).filter(a => a.line === l) : [];
  const theme = LINE_THEMES[l];
  return {
    label: `Gate ${g} · Line ${l}`,
    title: esc(ld.keynote),
    pin: { kind: 'gate', id: g },
    body: `
      ${para(ld.description)}
      ${here.length ? section('In your chart', chips(here.map(actLink))) : ''}
      ${section(`Line ${l} in general`, `<div class="dp-row">${dl('linetheme', l, `${l} · ${esc(theme.name)}`)}</div>${para(theme.text, 'dp-text dp-soft')}`)}
      ${section('Gate', gateLink(g))}
      ${section('Other lines of this gate', lineChips(g, chart ? activationsOf(chart, g).map(a => a.line) : []))}`
  };
}

function chartChannel(id, { chart, transitGates }) {
  const ch = CHANNEL_BY_KEY[id];
  if (!ch) return null;
  const desc = CHANNEL_DESCRIPTIONS[id];
  const defined = chart.channels.some(c => channelKey(c) === id);
  const active = new Set(chart.gates.all);
  const have = ch.gates.filter(g => active.has(g));
  const status = defined ? 'Defined in your chart — a consistent part of who you are.'
    : have.length === 1 ? `You carry Gate ${have[0]}, one half of this channel. You feel the other half through people and transits with Gate ${ch.gates.find(g => g !== have[0])}.`
    : 'Not active in your chart — you meet it in others.';
  const viaTransit = transitGates && !defined && ch.gates.every(g => active.has(g) || transitGates.has(g));
  return {
    label: `Channel ${ch.gates.join('–')}`,
    title: `Channel of ${esc(ch.name)}`,
    pin: { kind: 'gate', id: have[0] ?? ch.gates[0] },
    body: `
      <div class="dp-keynote">${esc(ch.theme)}</div>
      <p class="dp-callout ${defined ? 'on' : ''}">${esc(status)}</p>
      ${viaTransit ? `<p class="dp-callout">On the chosen date the transits complete this channel${have.length ? ' through your chart' : ''}, so you live its energy for a while.</p>` : ''}
      ${para(desc?.description)}
      ${defined && desc?.whenDefined ? para(desc.whenDefined, 'dp-text dp-soft') : ''}
      ${section('Gates', ch.gates.map(g => `<div class="dp-row">${gateLink(g, active.has(g) ? 'on' : '')}<span class="dp-row-note">${active.has(g) ? 'active' : 'open'}</span></div>`).join(''))}
      ${section('Connects', chips(ch.centers.map(c => centerLink(c))))}
      ${section('Circuit', circuitLink(ch.circuit))}`
  };
}

function chartCenter(key, { chart }) {
  const c = CENTERS[key];
  if (!c) return null;
  const status = centerStatus(chart, key);
  const meaning = status === 'defined' ? (c.definedMeaning || c.pressure)
    : status === 'undefined' ? c.undefinedMeaning : c.openMeaning;
  const active = new Set(chart.gates.all);
  const definedKeys = new Set(chart.channels.map(channelKey));
  const touching = CHANNELS.filter(ch => ch.centers?.includes(key));
  return {
    label: `${esc(centerName(key))} Center`,
    title: esc(c.theme || c.name),
    pin: { kind: 'center', id: key },
    body: `
      <div class="dp-tags"><span class="center-status ${status}">${cap(status)}</span>${c.biological ? `<span class="dp-tag">${esc(c.biological)}</span>` : ''}${c.motor ? '<span class="dp-tag">Motor</span>' : ''}</div>
      ${para(meaning)}
      ${status !== 'defined' && c.notSelfQuestion ? `<p class="center-notself">${esc(c.notSelfQuestion)}</p>` : ''}
      ${para(DEFINED_TEXT[status], 'dp-text dp-soft')}
      ${section('Gates here', `<div class="gate-chip-row">${gatesOfCenter(key).map(g =>
        `<button type="button" class="gate-chip ${active.has(g) ? 'active' : ''}" data-gate="${g}" ${dt('gate', g)} aria-label="Gate ${g} ${esc(GATES[g]?.name || '')}${active.has(g) ? ', active' : ''}">${g}</button>`).join('')}</div>`)}
      ${section('Channels through here', touching.map(ch =>
        `<div class="dp-row">${channelLink(ch, definedKeys.has(channelKey(ch)) ? 'on' : '')}<span class="dp-row-note">${definedKeys.has(channelKey(ch)) ? 'defined' : ''}</span></div>`).join(''))}`
  };
}

function chartPlanet(id, { chart }) {
  const [side, planet] = String(id).split('.');
  const a = chart.gates[side]?.[planet];
  if (!a || !PLANET_NAMES[planet]) return null;
  const ld = LINE_DESCRIPTIONS[a.gate]?.[a.line];
  const variableSlot = { 'design.sun': 'determination', 'design.northNode': 'environment', 'personality.northNode': 'perspective', 'personality.sun': 'motivation' }[id];
  const inCross = planet === 'sun' || planet === 'earth';
  return {
    label: `${sideName(side)} ${PLANET_NAMES[planet]}`,
    title: `${PLANET_GLYPHS[planet]} ${PLANET_NAMES[planet]} in Gate ${a.gate}.${a.line}`,
    pin: { kind: 'gate', id: a.gate },
    body: `
      ${para(PLANET_TEXT[planet])}
      ${section('Gate', `${gateLink(a.gate)}${GATE_DESCRIPTIONS[a.gate]?.keynote ? para(GATE_DESCRIPTIONS[a.gate].keynote, 'dp-text dp-soft') : ''}`)}
      ${ld ? section('Line', `${dl('line', `${a.gate}.${a.line}`, `Line ${a.line} · ${esc(ld.keynote)}`)}${para(ld.description, 'dp-text dp-soft')}`) : ''}
      ${a.color ? section('Beneath the line', `<div class="dp-sub-grid">
        <div><strong>Color ${a.color}</strong>${para(SUBSTRUCTURE_TEXT.color, 'dp-text dp-soft')}</div>
        <div><strong>Tone ${a.tone}</strong>${para(SUBSTRUCTURE_TEXT.tone, 'dp-text dp-soft')}</div>
        <div><strong>Base ${a.base}</strong>${para(SUBSTRUCTURE_TEXT.base, 'dp-text dp-soft')}</div></div>`) : ''}
      ${section(`${sideName(side)} side`, para(SIDE_TEXT[side], 'dp-text dp-soft'))}
      ${inCross || variableSlot ? section('Also part of', chips([
        inCross ? dl('cross', 'self', 'Incarnation Cross') : '',
        variableSlot ? dl('variable', variableSlot, `Variable · ${VARIABLE_TEXT[variableSlot].label}`) : ''
      ].filter(Boolean))) : ''}`
  };
}

// ---------- foundation items (generic, with chart extras when available) ----------

function typeDetail(name, ctx) {
  const key = typeKeyByName(name);
  const t = TYPES[key];
  if (!t) return null;
  const chart = ctx?.chart;
  const yours = chart && chart.type.name === name;
  return {
    label: 'Type',
    title: esc(t.name),
    body: `
      ${para(t.description, 'dp-keynote')}
      ${para(TYPE_GUIDANCE[key])}
      <div class="dp-facts">
        <div><span>Strategy</span><strong>${esc(t.strategy)}</strong></div>
        <div><span>Signature</span><strong>${esc(t.signature)}</strong></div>
        <div><span>Not-self</span><strong>${esc(t.notSelf)}</strong></div>
        <div><span>Of people</span><strong>${esc(t.percentage || '')}</strong></div>
      </div>
      <p class="dp-note">The signature is the feeling that tells you you're on track; the not-self feeling is a gentle signal you've drifted from your strategy.</p>
      ${yours ? section('In your chart', chips([
        dl('authority', chart.authority.name, esc(chart.authority.name)),
        dl('profile', chart.profile.numbers, `Profile ${esc(chart.profile.numbers)}`),
        dl('definition', chart.definition, esc(chart.definition)),
        ...chart.centers.definedNames.filter(k => ['sacral', 'throat'].includes(k)).map(k => centerLink(k))
      ])) : ''}`
  };
}

function authorityDetail(name, ctx) {
  const a = authorityByName(name);
  if (!a) return null;
  const ck = AUTHORITY_CENTER[name];
  return {
    label: 'Authority',
    title: esc(a.name),
    pin: ck && ctx?.chart ? { kind: 'center', id: ck } : undefined,
    body: `
      ${para(a.description, 'dp-keynote')}
      ${para(AUTHORITY_TEXT[name])}
      <p class="dp-note">Authority is how you make decisions that are correct for you. Strategy tells you when to engage; authority tells you whether.</p>
      ${ck ? section('Comes from', centerLink(ck)) : ''}`
  };
}

function profileDetail(numbers, ctx) {
  const p = PROFILES[numbers];
  if (!p) return null;
  const [l1, l2] = numbers.split('/').map(Number);
  const chart = ctx?.chart;
  const yours = chart && chart.profile.numbers === numbers;
  const lineRow = (l, role, act) => `<div class="dp-card">
      <div class="dp-card-head">${dl('linetheme', l, `${l} · ${esc(LINE_THEMES[l].name)}`, 'dp-card-title')}<span class="dp-row-note">${role}</span></div>
      ${para(LINE_THEMES[l].text)}
      ${act ? `<div class="dp-chips">${actLink(act)}</div>` : ''}
    </div>`;
  const pSun = yours ? { side: 'personality', planet: 'sun', ...chart.gates.personality.sun } : null;
  const dSun = yours ? { side: 'design', planet: 'sun', ...chart.gates.design.sun } : null;
  return {
    label: 'Profile',
    title: `${esc(numbers)} ${esc(p.name)}`,
    body: `
      ${para(p.theme, 'dp-keynote')}
      <p class="dp-note">Your profile comes from the lines of your two Suns: the first number is the conscious Personality line, the second the unconscious Design line.</p>
      ${lineRow(l1, 'Conscious · Personality Sun', pSun)}
      ${lineRow(l2, 'Unconscious · Design Sun', dSun)}`
  };
}

function lineThemeDetail(n) {
  const t = LINE_THEMES[n];
  if (!t) return null;
  return {
    label: `Line ${n}`,
    title: esc(t.name),
    body: `${para(t.text)}
      <p class="dp-note">Every gate has six lines. The line number gives a gate its particular flavor; the same six themes run through all 64 gates and through every profile.</p>`
  };
}

function definitionDetail(name, ctx) {
  const text = DEFINITION_TEXT[name];
  if (!text) return null;
  const chart = ctx?.chart;
  const yours = chart && chart.definition === name;
  return {
    label: 'Definition',
    title: esc(name),
    body: `
      ${para(text)}
      <p class="dp-note">Definition describes how your defined centers connect to each other through channels.</p>
      ${yours ? section('Your defined centers', chips(chart.centers.definedNames.map(k => centerLink(k)))) : ''}
      ${yours && chart.channels.length ? section('Your channels', chart.channels.map(ch => `<div class="dp-row">${channelLink(ch, 'on')}</div>`).join('')) : ''}`
  };
}

function crossDetail(_id, { chart }) {
  const cross = chart.incarnationCross;
  if (!cross) return null;
  const labels = [['personality', 'sun'], ['personality', 'earth'], ['design', 'sun'], ['design', 'earth']];
  return {
    label: 'Incarnation Cross',
    title: esc(cross.fullName || cross.name),
    body: `
      ${para(CROSS_TEXT)}
      ${para(ANGLE_TEXT[cross.angleName], 'dp-text dp-soft')}
      ${section('The four gates', cross.gates.map((g, i) => {
        const [side, planet] = labels[i];
        const a = chart.gates[side][planet];
        return `<div class="dp-row">${gateLink(g)}<span class="dp-row-note">${dl('planet', planetId(side, planet), `${PLANET_GLYPHS[planet]} ${sideName(side)} ${PLANET_NAMES[planet]}${a ? ` · ${a.gate}.${a.line}` : ''}`)}</span></div>`;
      }).join(''))}
      ${section('Angle', dl('profile', chart.profile.numbers, `Profile ${esc(chart.profile.numbers)} sets the angle`))}`
  };
}

function circuitDetail(key, ctx) {
  const c = CIRCUIT_GROUPS[key];
  if (!c) return null;
  const chart = ctx?.chart;
  const yours = chart ? chart.channels.filter(ch => ch.circuit === key) : [];
  const all = CHANNELS.filter(ch => ch.circuit === key);
  return {
    label: 'Circuit',
    title: `${esc(c.name)} circuit`,
    body: `
      <div class="dp-keynote">${esc(c.theme)}</div>
      ${para(CIRCUIT_DESC[key])}
      ${chart ? section(yours.length ? 'Your channels here' : 'In your chart', yours.length
        ? yours.map(ch => `<div class="dp-row">${channelLink(ch, 'on')}</div>`).join('')
        : '<p class="dp-muted">None of your defined channels run through this circuit.</p>') : ''}
      ${section(`All ${all.length} channels`, chips(all.map(ch => channelLink(ch, yours.includes(ch) ? 'on' : ''))))}`
  };
}

function variableDetail(slot, { chart }) {
  const v = chart.variable?.[slot];
  const meta = VARIABLE_TEXT[slot];
  if (!v || !meta) return null;
  const source = { determination: 'design.sun', environment: 'design.northNode', perspective: 'personality.northNode', motivation: 'personality.sun' }[slot];
  return {
    label: `Variable · ${meta.label}`,
    title: esc(v.name),
    body: `
      <div class="dp-keynote">${esc(meta.sub)}</div>
      ${para(v.description)}
      ${v.cognition ? `<div class="dp-card"><strong>Cognition · ${esc(v.cognition.name)}</strong>${para(v.cognition.description)}</div>` : ''}
      <div class="dp-facts">
        <div><span>Arrow</span><strong>${v.arrow === 'left' ? '◀ Left' : 'Right ▶'}</strong></div>
        <div><span>Color</span><strong>${v.color}</strong></div>
        <div><span>Tone</span><strong>${v.tone}</strong></div>
      </div>
      ${para(ARROW_TEXT[v.arrow], 'dp-text dp-soft')}
      ${para(meta.text, 'dp-text dp-soft')}
      ${section('Comes from', dl('planet', source, `${PLANET_GLYPHS[source.split('.')[1]]} ${sideName(source.split('.')[0])} ${PLANET_NAMES[source.split('.')[1]]}`))}
      ${section('The four arrows', chips(Object.keys(VARIABLE_TEXT).map(k =>
        dl('variable', k, `${chart.variable[k].arrow === 'left' ? '◀' : '▶'} ${VARIABLE_TEXT[k].label}`, k === slot ? 'on' : ''))))}
      <p class="dp-note">Variable is subtle, advanced territory. Explore it slowly, as an experiment.</p>`
  };
}

// ==========================================================================
// Pair scope (Connection)
// ==========================================================================

const DYN_SHORT = {
  electromagnetic: 'You each bring one half — together you complete it.',
  companionship: 'You both carry the whole channel.',
  compromise: 'One of you has the full channel, the other only half.',
  dominance: 'One of you has the whole channel, the other none of it.'
};

function whoName(ctx, owner) {
  return owner === 'both' ? `${ctx.nameA} + ${ctx.nameB}` : owner === 'a' ? ctx.nameA : owner === 'b' ? ctx.nameB : 'Neither of you';
}

function pairGate(g, ctx) {
  const gate = GATES[g];
  if (!gate) return null;
  const { model, a, b, nameA, nameB } = ctx;
  const carriers = [[a.chart, nameA, 'a'], [b.chart, nameB, 'b']].map(([chart, name, who]) => {
    const acts = activationsOf(chart, g);
    return `<div class="dp-row"><span class="who-dot who-${who}"></span><strong>${esc(name)}</strong><span class="dp-row-note">${acts.length
      ? acts.map(x => `${PLANET_GLYPHS[x.planet]} ${sideName(x.side)} ${PLANET_NAMES[x.planet]} ${x.gate}.${x.line}`).map(esc).join(' · ')
      : 'doesn’t carry it'}</span></div>`;
  }).join('');
  const rows = channelsOfGate(g).map(ch => {
    const dyn = model.channelDynamic(ch);
    return `<div class="dp-row">${dl('channel', channelKey(ch), `${esc(ch.name)} <span class="dl-sub">${ch.gates.join('–')}</span>`, dyn ? `dyn-${dyn}` : '')}<span class="dp-row-note">${dyn ? CONNECTION_TYPES[dyn].label : 'not formed between you'}</span></div>`;
  }).join('');
  const desc = GATE_DESCRIPTIONS[g];
  return {
    label: `Gate ${g}`,
    title: esc(gate.name),
    pin: { kind: 'gate', id: g },
    body: `
      <p class="dp-callout">Carried by <strong>${esc(whoName(ctx, model.gateOwner(g)))}</strong></p>
      ${section('Who carries it', carriers)}
      ${desc?.keynote ? `<div class="dp-keynote">${esc(desc.keynote)}</div>` : ''}
      ${para(desc?.description)}
      ${section('Channels', rows)}
      ${section('Center', centerLink(gate.center))}`
  };
}

function pairChannel(id, ctx) {
  const ch = CHANNEL_BY_KEY[id];
  if (!ch) return null;
  const { model, nameA, nameB } = ctx;
  const dyn = model.channelDynamic(ch);
  const desc = CHANNEL_DESCRIPTIONS[id];
  const bring = ch.gates.map(g => {
    const o = model.gateOwner(g);
    return `<div class="dp-row">${gateLink(g)}<span class="dp-row-note">${o ? `${esc(whoName(ctx, o))} ${o === 'both' ? 'both bring it' : 'brings it'}` : 'neither of you'}</span></div>`;
  }).join('');
  return {
    label: `Channel ${ch.gates.join('–')}${dyn ? ` · ${CONNECTION_TYPES[dyn].label}` : ''}`,
    title: `Channel of ${esc(ch.name)}`,
    pin: { kind: 'gate', id: ch.gates.find(g => model.gateOwner(g)) ?? ch.gates[0] },
    body: `
      <div class="dp-keynote">${esc(ch.theme)}</div>
      ${dyn ? `<div class="dp-card dyn-card dyn-${dyn}">${dl('conntype', dyn, CONNECTION_TYPES[dyn].label, 'dp-card-title')}${para(CONNECTION_TYPES[dyn].text)}</div>`
        : `<p class="dp-muted">This channel doesn’t form between ${esc(nameA)} and ${esc(nameB)}.</p>`}
      ${section('Who brings each gate', bring)}
      ${para(desc?.description)}
      ${section('Connects', chips(ch.centers.map(c => centerLink(c))))}
      ${section('Circuit', circuitLink(ch.circuit))}`
  };
}

function pairCenter(key, ctx) {
  const c = CENTERS[key];
  if (!c) return null;
  const { model, nameA, nameB, a, b } = ctx;
  const owner = model.centerOwner(key);
  const dn = centerName(key);
  const tag = owner === 'both' ? 'Both define' : owner === 'a' ? `${nameA} defines`
    : owner === 'b' ? `${nameB} defines` : owner === 'bridged' ? 'Made together' : 'Open between you';
  const txt = owner === 'both' ? `You both define the ${dn} — fixed, reliable common ground between you.`
    : owner === 'a' ? `${nameA} defines the ${dn}; ${nameB} takes it in. ${nameA} steadily conditions ${nameB} here — a consistent, often unspoken influence.`
    : owner === 'b' ? `${nameB} defines the ${dn}; ${nameA} takes it in. ${nameB} steadily conditions ${nameA} here — a consistent, often unspoken influence.`
    : owner === 'bridged' ? `Neither of you defines the ${dn} alone — but together your gates complete a channel into it. You generate this energy only as a pair.`
    : `The ${dn} stays open between you — you both amplify whatever’s in the room here. Watch for shared not-self patterns.`;
  const gateRow = gatesOfCenter(key).filter(g => model.gateOwner(g)).map(g =>
    dl('gate', g, `${g} <span class="dl-sub">${esc(whoName(ctx, model.gateOwner(g)))}</span>`, `who-${model.gateOwner(g)}`));
  const each = [[a.chart, nameA], [b.chart, nameB]].map(([chart, name]) =>
    `<div class="dp-row"><strong>${esc(name)}</strong><span class="dp-row-note">${cap(centerStatus(chart, key))}</span></div>`).join('');
  return {
    label: `${esc(dn)} Center`,
    title: esc(c.theme || dn),
    pin: { kind: 'center', id: key },
    body: `
      <div class="dp-tags"><span class="conn-center-tag ${owner || 'open'}">${esc(tag)}</span></div>
      ${para(txt)}
      ${section('Each of you', each)}
      ${section('What this center does', para(c.definedMeaning || c.pressure, 'dp-text dp-soft'))}
      ${gateRow.length ? section('Gates you bring here', chips(gateRow)) : ''}`
  };
}

function connType(dyn, ctx) {
  const t = CONNECTION_TYPES[dyn];
  if (!t) return null;
  const items = ctx.comparison?.connectionChart?.connections?.[dyn] || [];
  return {
    label: 'How your channels connect',
    title: esc(t.label),
    body: `
      ${para(t.text)}
      ${section(`Between you (${items.length})`, items.length
        ? items.map(c => `<div class="dp-row">${dl('channel', c.gates.slice().sort((x, y) => x - y).join('-'), `${esc(c.channel)} <span class="dl-sub">${c.gates.join('–')}</span>`)}<span class="dp-row-note">${esc(c.theme || '')}</span></div>`).join('')
        : `<p class="dp-muted">None between you.</p>`)}
      ${section('The other three', chips(Object.keys(CONNECTION_TYPES).filter(k => k !== dyn).map(k => dl('conntype', k, CONNECTION_TYPES[k].label))))}`
  };
}

function pairPerson(who, ctx) {
  const p = who === 'a' ? ctx.a : who === 'b' ? ctx.b : null;
  if (!p) return null;
  const chart = p.chart;
  const name = who === 'a' ? ctx.nameA : ctx.nameB;
  return {
    label: 'Person',
    title: esc(name),
    body: `
      <div class="dp-facts">
        <div><span>Type</span>${dl('type', chart.type.name, esc(chart.type.name))}</div>
        <div><span>Authority</span>${dl('authority', chart.authority.name, esc(chart.authority.name))}</div>
        <div><span>Profile</span>${dl('profile', chart.profile.numbers, `${esc(chart.profile.numbers)} ${esc(chart.profile.name)}`)}</div>
        <div><span>Definition</span>${dl('definition', chart.definition, esc(chart.definition))}</div>
      </div>
      ${section('Defined centers', chips(chart.centers.definedNames.map(k => centerLink(k))))}
      ${section('Channels', chart.channels.length ? chips(chart.channels.map(ch => channelLink(ch))) : '<p class="dp-muted">No defined channels.</p>')}`
  };
}

function pairTypes(_id, ctx) {
  const ti = ctx.comparison.typeInteraction;
  return {
    label: 'Your types together',
    title: esc(ti.dynamic),
    body: `
      <div class="dp-facts">
        <div><span>Gifts</span><strong>${esc(ti.gifts)}</strong></div>
        <div><span>Challenge</span><strong>${esc(ti.challenges)}</strong></div>
        <div><span>Make it work</span><strong>${esc(ti.tips)}</strong></div>
      </div>
      ${section('Each type', chips([
        dl('type', ctx.a.chart.type.name, `${esc(ctx.nameA)} · ${esc(ctx.a.chart.type.name)}`),
        dl('type', ctx.b.chart.type.name, `${esc(ctx.nameB)} · ${esc(ctx.b.chart.type.name)}`)
      ]))}`
  };
}

function pairAuthority(_id, ctx) {
  const ad = ctx.comparison.authorityDynamic;
  return {
    label: 'How you decide together',
    title: `${esc(ad.authorityA)} + ${esc(ad.authorityB)}`,
    body: `
      ${para(ad.description)}
      ${ad.timing ? `<p class="dp-callout">Timing: ${esc(ad.timing)}</p>` : ''}
      <p class="dp-note">Each of you decides by your own authority. Knowing the other's helps you give them the time or the question they need.</p>
      ${section('Each authority', chips([
        dl('authority', ctx.a.chart.authority.name, `${esc(ctx.nameA)} · ${esc(ctx.a.chart.authority.name)}`),
        dl('authority', ctx.b.chart.authority.name, `${esc(ctx.nameB)} · ${esc(ctx.b.chart.authority.name)}`)
      ]))}`
  };
}

function pairProfiles(_id, ctx) {
  const ph = ctx.comparison.profileHarmony;
  return {
    label: 'Your profiles together',
    title: `${esc(ph.profileA)} + ${esc(ph.profileB)}`,
    body: `
      ${para(ph.description)}
      ${section('Each profile', chips([
        dl('profile', ph.profileA, `${esc(ctx.nameA)} · ${esc(ph.profileA)} ${esc(ph.nameA)}`),
        dl('profile', ph.profileB, `${esc(ctx.nameB)} · ${esc(ph.profileB)} ${esc(ph.nameB)}`)
      ]))}`
  };
}

function pairComposite(_id, ctx) {
  const cc = ctx.comparison.connectionChart;
  const centers = CENTER_ORDER.filter(k => ctx.model.centerOwner(k));
  return {
    label: 'Together you are',
    title: esc(cc.compositeType),
    body: `
      <p class="dp-text">Put your two charts on one body and this is the type it reads as — the way your shared energy tends to move when you're together.</p>
      ${section('Defined between you', chips(centers.map(k => centerLink(k))))}
      ${section('Type', dl('type', cc.compositeType, esc(cc.compositeType)))}`
  };
}

function pairConditioning(_id, ctx) {
  const cd = ctx.comparison.centerDynamics || [];
  const rows = cd.filter(c => /Conditions/.test(c.dynamic)).map(c => {
    const from = c.dynamic.startsWith('A') ? ctx.nameA : ctx.nameB;
    const to = c.dynamic.startsWith('A') ? ctx.nameB : ctx.nameA;
    return `<div class="dp-row">${centerLink(c.center)}<span class="dp-row-note">${esc(from)} conditions ${esc(to)}</span></div>`;
  }).join('');
  return {
    label: 'Conditioning',
    title: 'Where one of you shapes the other',
    body: `
      <p class="dp-text">Where one of you has a center defined and the other has it open, the defined person steadily conditions the open one. It isn't good or bad — it's worth noticing.</p>
      ${section('Centers', rows || '<p class="dp-muted">Neither of you conditions the other’s centers.</p>')}`
  };
}

// ==========================================================================
// Team scope
// ==========================================================================

function teamRole(centerKey, ctx) {
  const r = ctx.result.roles?.[centerKey];
  if (!r) return null;
  const missing = ctx.result.missingRoles.find(m => m.center === centerKey);
  const idx = (name) => ctx.names.indexOf(name);
  return {
    label: 'Team role',
    title: esc(r.role),
    body: `
      ${para(r.description)}
      ${r.filled
        ? section(`Filled by (${r.contributors.length})`, chips(r.contributors.map(n => dl('member', idx(n), esc(n)))))
        : `<p class="dp-callout">${esc(missing?.suggestion || 'Nobody in this group fills this role.')}</p>`}
      ${section('Comes from', `${dl('teamcenter', centerKey, esc(centerName(centerKey)))}<span class="dp-row-note"> — whoever has this center defined fills the role</span>`)}
      <p class="dp-note">${esc(PENTA_TEXT)}</p>`
  };
}

function teamMember(i, ctx) {
  const chart = ctx.charts[i];
  const name = ctx.names[i];
  const m = ctx.result.members?.[i];
  if (!chart) return null;
  const roles = Object.entries(ctx.result.roles || {}).filter(([, r]) => r.contributors.includes(name));
  return {
    label: 'Team member',
    title: esc(name),
    body: `
      <div class="dp-facts">
        <div><span>Type</span>${dl('type', chart.type.name, esc(chart.type.name))}</div>
        <div><span>Authority</span>${dl('authority', chart.authority.name, esc(chart.authority.name))}</div>
        <div><span>Profile</span>${dl('profile', chart.profile.numbers, `${esc(chart.profile.numbers)} ${esc(chart.profile.name)}`)}</div>
        ${m?.careerType ? `<div><span>Brings</span><strong>${esc(m.careerType)}</strong></div>` : ''}
      </div>
      ${section('Roles they fill', roles.length ? chips(roles.map(([k, r]) => dl('role', k, esc(r.role)))) : '<p class="dp-muted">No defined centers — they read and reflect the group.</p>')}
      ${section('Channels', chart.channels.length ? chips(chart.channels.map(ch => dl('teamchannel', channelKey(ch), `${esc(ch.name)} <span class="dl-sub">${ch.gates.join('–')}</span>`))) : '<p class="dp-muted">No defined channels.</p>')}`
  };
}

function teamChannel(id, ctx) {
  const ch = CHANNEL_BY_KEY[id];
  if (!ch) return null;
  const full = ctx.charts.map((c, i) => c.channels.some(x => channelKey(x) === id) ? i : -1).filter(i => i >= 0);
  const ems = (ctx.result.electromagnetics || []).filter(e => e.gates.slice().sort((x, y) => x - y).join('-') === id);
  const desc = CHANNEL_DESCRIPTIONS[id];
  const half = ch.gates.map(g => {
    const who = ctx.charts.map((c, i) => c.gates.all.includes(g) ? i : -1).filter(i => i >= 0);
    return `<div class="dp-row">${dl('teamgate', g, gateLabel(g))}<span class="dp-row-note">${who.length ? who.map(i => esc(ctx.names[i])).join(', ') : 'nobody'}</span></div>`;
  }).join('');
  return {
    label: `Channel ${ch.gates.join('–')}`,
    title: `Channel of ${esc(ch.name)}`,
    body: `
      <div class="dp-keynote">${esc(ch.theme)}</div>
      ${para(desc?.description)}
      ${section('Who has the whole channel', full.length ? chips(full.map(i => dl('member', i, esc(ctx.names[i])))) : '<p class="dp-muted">Nobody on their own.</p>')}
      ${ems.length ? section('Made together', ems.map(e => `<div class="dp-row"><span>${esc(e.personA)} + ${esc(e.personB)}</span><span class="dp-row-note">${dl('conntype', 'electromagnetic', 'Electromagnetic')}</span></div>`).join('')) : ''}
      ${section('Who carries each gate', half)}
      ${section('Circuit', circuitLink(ch.circuit))}`
  };
}

function teamGate(g, ctx) {
  const gate = GATES[g];
  if (!gate) return null;
  const who = ctx.charts.map((c, i) => c.gates.all.includes(g) ? i : -1).filter(i => i >= 0);
  const desc = GATE_DESCRIPTIONS[g];
  return {
    label: `Gate ${g}`,
    title: esc(gate.name),
    body: `
      ${desc?.keynote ? `<div class="dp-keynote">${esc(desc.keynote)}</div>` : ''}
      ${para(desc?.description)}
      ${section(`Carried by (${who.length})`, who.length ? chips(who.map(i => dl('member', i, esc(ctx.names[i])))) : '<p class="dp-muted">Nobody in this group.</p>')}
      ${section('Channels', channelsOfGate(g).map(ch => `<div class="dp-row">${dl('teamchannel', channelKey(ch), `${esc(ch.name)} <span class="dl-sub">${ch.gates.join('–')}</span>`)}</div>`).join(''))}
      ${section('Center', dl('teamcenter', gate.center, esc(centerName(gate.center))))}`
  };
}

function teamCenter(key, ctx) {
  const c = CENTERS[key];
  if (!c) return null;
  const who = ctx.charts.map((ch, i) => ch.centers.definedNames.includes(key) ? i : -1).filter(i => i >= 0);
  const role = ctx.result.roles?.[key];
  return {
    label: `${esc(centerName(key))} Center`,
    title: esc(c.theme || c.name),
    body: `
      ${para(c.definedMeaning || c.pressure)}
      ${section(`Defined in (${who.length})`, who.length ? chips(who.map(i => dl('member', i, esc(ctx.names[i])))) : '<p class="dp-muted">Open for everyone in this group — the group takes this energy in from outside.</p>')}
      ${role ? section('Team role', dl('role', key, esc(role.role))) : ''}
      ${section('Gates here', chips(gatesOfCenter(key).map(g => dl('teamgate', g, String(g), ctx.charts.some(ch => ch.gates.all.includes(g)) ? 'on' : ''))))}`
  };
}

function teamGroupType(_id, ctx) {
  const r = ctx.result;
  const dist = Object.entries(r.careerTypeDistribution || {});
  return {
    label: 'Group type',
    title: esc(r.groupType),
    body: `
      <p class="dp-text">Read the whole group as one body, and this is the type it takes. It describes how the group's energy tends to move when you work together.</p>
      ${r.groupCareerType ? `<p class="dp-callout">${esc(r.groupCareerType)}</p>` : ''}
      ${dist.length ? section('Who brings what', dist.map(([k, n]) => `<div class="dp-row"><span>${esc(k)}</span><span class="dp-row-note">${n}</span></div>`).join('')) : ''}
      ${section('Type', dl('type', r.groupType, esc(r.groupType)))}`
  };
}

// ==========================================================================
// Registry
// ==========================================================================

const GENERIC = {
  type: typeDetail,
  authority: authorityDetail,
  profile: profileDetail,
  linetheme: lineThemeDetail,
  definition: definitionDetail,
  circuit: circuitDetail,
  conntype: connType
};

const SCOPED = {
  chart: {
    gate: (id, ctx) => chartGate(Number(id), ctx),
    line: chartLine,
    channel: chartChannel,
    center: chartCenter,
    planet: chartPlanet,
    cross: crossDetail,
    variable: variableDetail
  },
  pair: {
    gate: (id, ctx) => pairGate(Number(id), ctx),
    line: (id) => chartLine(id, {}),
    channel: pairChannel,
    center: pairCenter,
    person: pairPerson,
    pairtypes: pairTypes,
    pairauthority: pairAuthority,
    pairprofiles: pairProfiles,
    composite: pairComposite,
    conditioning: pairConditioning
  },
  team: {
    role: teamRole,
    member: (id, ctx) => teamMember(Number(id), ctx),
    teamchannel: teamChannel,
    teamgate: (id, ctx) => teamGate(Number(id), ctx),
    teamcenter: teamCenter,
    grouptype: teamGroupType,
    // Generic links from inside team panels resolve to team-aware views.
    channel: teamChannel,
    gate: (id, ctx) => teamGate(Number(id), ctx),
    center: teamCenter
  }
};

/**
 * Render one item. `scope` is 'chart' | 'pair' | 'team' and picks the
 * renderer set; generic kinds (type, authority, profile…) work in any scope.
 * Returns null for unknown kinds/ids — the shell shows nothing rather than
 * a half-empty panel.
 */
export function renderDetail(scope, kind, id, ctx = {}) {
  const fn = SCOPED[scope]?.[kind] || GENERIC[kind];
  if (!fn) return null;
  try {
    return fn(id, ctx) || null;
  } catch (err) {
    console.warn(`detail ${scope}/${kind}:${id} failed`, err);
    return null;
  }
}

export { CHANNEL_BY_KEY, centerName };
