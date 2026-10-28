/**
 * Server-rendered SEO pages — the crawlable surface the SPA can't provide.
 *
 * The Worker already runs natalengine, so every content page (gates, types,
 * centers, channels, profiles) is rendered as real HTML at the edge from the
 * engine's own data — including the 384 line interpretations, which makes the
 * gate pages uniquely deep. Edge-cached; deterministic; links back into the
 * interactive app. See docs/RESEARCH.md §SEO and docs/GROWTH.md.
 */

import {
  TYPES, PROFILES, AUTHORITIES, CENTERS, GATES, CHANNELS, CIRCUIT_GROUPS,
  GATE_DESCRIPTIONS, LINE_DESCRIPTIONS, CHANNEL_DESCRIPTIONS,
  HEXAGRAM_DESCRIPTIONS, GENE_KEY_DESCRIPTIONS,
  calculateHumanDesign
} from 'natalengine';
import { CELEBRITIES } from './celebrities.js';
import { LINE_THEMES, TYPE_GUIDANCE, CIRCUIT_DESC } from '../src/lib/glossary.js';

const ORIGIN = 'https://openhumandesign.com';
const CELEB_BY_SLUG = Object.fromEntries(CELEBRITIES.map(c => [c.slug, c]));
const NAME_TO_TYPESLUG = Object.fromEntries(Object.keys(TYPES).map(k => [TYPES[k].name, k]));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- slugs ----------------------------------------------------------------
const TYPE_SLUGS = {
  manifestor: 'manifestor',
  generator: 'generator',
  'manifesting-generator': 'manifestingGenerator',
  projector: 'projector',
  reflector: 'reflector'
};
const TYPE_SLUG_OF = { manifestor: 'manifestor', generator: 'generator', manifestingGenerator: 'manifesting-generator', projector: 'projector', reflector: 'reflector' };

const CENTER_ORDER = ['head', 'ajna', 'throat', 'g', 'heart', 'sacral', 'spleen', 'solar', 'root'];
const PROFILE_KEYS = Object.keys(PROFILES); // "1/3" …
const profileSlug = (k) => k.replace('/', '-');
const profileKey = (slug) => slug.replace('-', '/');

const CHANNELS_FOR_GATE = (g) => Object.keys(CHANNEL_DESCRIPTIONS)
  .filter(k => k.split('-').map(Number).includes(g));
const GATES_IN_CENTER = (c) => Object.entries(GATES)
  .filter(([, v]) => v.center === c).map(([g]) => +g).sort((a, b) => a - b);
const CENTER_NAME = (c) => CENTERS[c]?.name || c;

const CIRCUIT_ORDER = ['individual', 'tribal', 'collective', 'integration'];
const CHANNELS_IN_CIRCUIT = (c) => CHANNELS.filter(ch => ch.circuit === c);

// --- shared page shell ----------------------------------------------------
function shell({ title, description, path, h1, kicker, body, breadcrumb }) {
  const canonical = `${ORIGIN}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta property="og:site_name" content="Open Human Design">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/fonts/fonts.css">
<style>
:root{--bg:#faf8f5;--card:#fff;--sunken:#f0ede8;--text:#1a1714;--soft:#6b6560;--line:#e7e1d8;--accent:#9a5e1c;--accent2:#c47a2a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.7 Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
header.site{border-bottom:1px solid var(--line);background:rgba(250,248,245,.9);position:sticky;top:0;backdrop-filter:blur(6px)}
header.site .in{max-width:760px;margin:0 auto;padding:14px 20px;display:flex;justify-content:space-between;align-items:center}
.logo{font-family:'Crimson Pro',serif;font-weight:700;font-size:20px;color:var(--text)}
.cta-top{font-size:14px;font-weight:600}
main{max-width:760px;margin:0 auto;padding:28px 20px 60px}
nav.crumb{font-size:13px;color:var(--soft);margin-bottom:18px}
nav.crumb a{color:var(--soft)}
h1{font-family:'Crimson Pro',serif;font-weight:700;font-size:38px;line-height:1.15;margin:0 0 6px}
.kicker{color:var(--accent);font-weight:600;font-size:15px;margin-bottom:20px}
h2{font-family:'Crimson Pro',serif;font-weight:600;font-size:25px;margin:36px 0 12px}
p{margin:0 0 16px}
.lede{font-size:18px;color:var(--text)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:12px 0}
.card.line{border-left:3px solid var(--accent2)}
.card h3{margin:0 0 4px;font-size:16px;font-family:Inter}
.card p{margin:0;color:var(--soft);font-size:15px}
.pills{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.pill{display:inline-block;padding:6px 12px;background:var(--sunken);border-radius:999px;font-size:14px;font-weight:500}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:12px 0}
.grid a{padding:9px 12px;background:var(--card);border:1px solid var(--line);border-radius:10px;font-size:14px}
.factrow{display:flex;flex-wrap:wrap;gap:8px 24px;margin:14px 0;font-size:15px}
.factrow b{color:var(--soft);font-weight:600}
.cta{margin:40px 0 0;padding:22px;background:var(--card);border:1px solid var(--line);border-radius:14px;text-align:center}
.cta a{display:inline-block;margin-top:10px;padding:11px 20px;background:var(--accent);color:#fff;border-radius:10px;font-weight:600}
.cta a:hover{text-decoration:none;background:#84511a}
footer.site{border-top:1px solid var(--line);color:var(--soft);font-size:13px}
footer.site .in{max-width:760px;margin:0 auto;padding:24px 20px}
footer.site a{color:var(--soft)}
</style>
</head>
<body>
<header class="site"><div class="in"><a class="logo" href="/">Open Human Design</a><a class="cta-top" href="/">Get your free chart →</a></div></header>
<main>
${breadcrumb ? `<nav class="crumb">${breadcrumb}</nav>` : ''}
<h1>${esc(h1)}</h1>
${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ''}
${body}
<div class="cta">
  <strong>See this in your own chart</strong>
  <div>Open Human Design computes your full bodygraph — type, authority, profile, the Variable arrows, connections and transits — free, accurate, no account.</div>
  <a href="/">Calculate your free chart</a>
</div>
</main>
<footer class="site"><div class="in">
  <a href="/human-design">Human Design reference</a> · <a href="/">Free chart calculator</a><br>
  Open Human Design — open-source, original interpretations, computed in your browser. Powered by <a href="https://www.npmjs.com/package/natalengine">natalengine</a>.
</div></footer>
</body>
</html>`;
}

const htmlResponse = (html) => new Response(html, {
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=86400' }
});

// --- page renderers -------------------------------------------------------
function gatePage(n) {
  const g = GATES[n], d = GATE_DESCRIPTIONS[n];
  if (!g || !d) return null;
  const lines = LINE_DESCRIPTIONS[n] || {};
  const linesHtml = [1, 2, 3, 4, 5, 6].map(l => lines[l] ? `
    <div class="card line"><h3>Line ${n}.${l} · ${esc(lines[l].keynote)}</h3><p>${esc(lines[l].description)}</p></div>` : '').join('');
  const channels = CHANNELS_FOR_GATE(n);
  const channelsHtml = channels.length ? `
    <h2>Channels of Gate ${n}</h2>
    <div class="grid">${channels.map(k => `<a href="/channel/${k}">Channel ${k}</a>`).join('')}</div>` : '';
  const center = g.center;
  const harmonic = d.harmonic;
  const prev = n > 1 ? n - 1 : 64, next = n < 64 ? n + 1 : 1;
  const body = `
    <p class="lede">${esc(d.description)}</p>
    <div class="factrow">
      <span><b>I Ching</b> ${esc(g.iching)}</span>
      <span><b>Center</b> <a href="/center/${center}">${esc(CENTER_NAME(center))}</a></span>
      <span><b>Keynote</b> ${esc(d.keynote)}</span>
      ${harmonic ? `<span><b>Harmonic</b> <a href="/gate/${harmonic}">Gate ${harmonic}</a></span>` : ''}
    </div>
    <h2>The six lines of Gate ${n}</h2>
    <p>Every gate expresses through six lines — the universal line quality coloured by this gate's specific energy. These are the line-level interpretations most apps reserve for paid readings.</p>
    ${linesHtml}
    ${channelsHtml}
    ${HEXAGRAM_DESCRIPTIONS[n] ? `
    <h2>The I Ching — Hexagram ${n}, ${esc(HEXAGRAM_DESCRIPTIONS[n].name)}</h2>
    <p>Gate ${n} is built directly on this hexagram — the ancient oracle Human Design grew out of.</p>
    <p>${esc(HEXAGRAM_DESCRIPTIONS[n].meaning)}</p>
    ${[1, 2, 3, 4, 5, 6].map(l => HEXAGRAM_DESCRIPTIONS[n].lines[l] ? `<div class="card line"><h3>Line ${n}.${l}</h3><p>${esc(HEXAGRAM_DESCRIPTIONS[n].lines[l])}</p></div>` : '').join('')}` : ''}
    ${GENE_KEY_DESCRIPTIONS[n] ? `
    <h2>The Gene Keys — Gene Key ${n}</h2>
    <p>In the Gene Keys, the same energy runs a spectrum: Shadow <strong>${esc(GENE_KEY_DESCRIPTIONS[n].shadow)}</strong> → Gift <strong>${esc(GENE_KEY_DESCRIPTIONS[n].gift)}</strong> → Siddhi <strong>${esc(GENE_KEY_DESCRIPTIONS[n].siddhi)}</strong>.</p>
    <p>${esc(GENE_KEY_DESCRIPTIONS[n].description)}</p>` : ''}
    <h2>Where Gate ${n} sits</h2>
    <p>Gate ${n} lives in the <a href="/center/${center}">${esc(CENTER_NAME(center))}</a>. Explore neighbouring gates: <a href="/gate/${prev}">Gate ${prev}</a> · <a href="/gate/${next}">Gate ${next}</a>.</p>`;
  return shell({
    title: `Gate ${n}: ${g.name} — Human Design, I Ching & Gene Keys`,
    description: `Gate ${n} (${g.name}): its Human Design meaning and all six lines, the I Ching Hexagram ${n} it comes from, and the Gene Key ${n} spectrum — free.`,
    path: `/gate/${n}`,
    h1: `Gate ${n}: ${g.name}`,
    kicker: `${g.iching} · ${CENTER_NAME(center)} Center`,
    breadcrumb: `<a href="/human-design">Human Design</a> › <a href="/human-design#gates">Gates</a> › Gate ${n}`,
    body
  });
}

function typePage(slug) {
  const key = TYPE_SLUGS[slug];
  const t = key && TYPES[key];
  if (!t) return null;
  const others = Object.keys(TYPES).filter(k => k !== key);
  const body = `
    <p class="lede">${esc(t.description)}.</p>
    <div class="factrow">
      <span><b>Strategy</b> ${esc(t.strategy)}</span>
      <span><b>Signature</b> ${esc(t.signature)}</span>
      <span><b>Not-Self</b> ${esc(t.notSelf)}</span>
      <span><b>Population</b> ~${esc(t.percentage)}</span>
    </div>
    <h2>How to live as a ${esc(t.name)}</h2>
    <p>${esc(TYPE_GUIDANCE[key] || '')}</p>
    <h2>Strategy &amp; signature</h2>
    <p>Your strategy is <strong>${esc(t.strategy)}</strong>. When you follow it, the signature of a life lived correctly is <strong>${esc(t.signature)}</strong>; when you don't, you feel the not-self theme of <strong>${esc(t.notSelf)}</strong>. That feeling is your feedback loop.</p>
    <h2>The five types</h2>
    <div class="grid">${others.map(k => `<a href="/type/${TYPE_SLUG_OF[k]}">${esc(TYPES[k].name)}</a>`).join('')}</div>`;
  return shell({
    title: `The ${t.name} in Human Design — strategy, signature & how to live it`,
    description: `The ${t.name} Human Design type (~${t.percentage}): strategy is "${t.strategy}", signature ${t.signature}, not-self ${t.notSelf}. What it means and how to live it — free.`,
    path: `/type/${slug}`,
    h1: `The ${t.name}`,
    kicker: `Strategy: ${t.strategy} · Signature: ${t.signature}`,
    breadcrumb: `<a href="/human-design">Human Design</a> › <a href="/human-design#types">Types</a> › ${esc(t.name)}`,
    body
  });
}

function centerPage(c) {
  const ce = CENTERS[c];
  if (!ce) return null;
  const gates = GATES_IN_CENTER(c);
  const others = CENTER_ORDER.filter(k => k !== c);
  const body = `
    <p class="lede">${esc(ce.definedMeaning)}</p>
    <div class="factrow">
      <span><b>Theme</b> ${esc(ce.theme)}</span>
      ${ce.biological ? `<span><b>Biology</b> ${esc(ce.biological)}</span>` : ''}
      <span><b>Type</b> ${ce.motor ? 'Motor (energy)' : 'Awareness / pressure'}</span>
    </div>
    <h2>Defined ${esc(ce.name)}</h2>
    <p>${esc(ce.definedMeaning)}</p>
    <h2>Undefined or open ${esc(ce.name)}</h2>
    <p>${esc(ce.undefinedMeaning)}</p>
    ${ce.notSelfQuestion ? `<p><b>The not-self question:</b> ${esc(ce.notSelfQuestion)} ${ce.notSelfTheme ? `(the open-center trap here is ${esc(ce.notSelfTheme.toLowerCase())}).` : ''}</p>` : ''}
    <h2>Gates in the ${esc(ce.name)} Center</h2>
    <div class="grid">${gates.map(g => `<a href="/gate/${g}">Gate ${g} · ${esc(GATES[g].name)}</a>`).join('')}</div>
    <h2>The nine centers</h2>
    <div class="grid">${others.map(k => `<a href="/center/${k}">${esc(CENTER_NAME(k))}</a>`).join('')}</div>`;
  return shell({
    title: `The ${ce.name} Center in Human Design — defined vs open`,
    description: `The ${ce.name} Center (${ce.theme}): what it means defined vs undefined, the not-self trap, and every gate it holds — free.`,
    path: `/center/${c}`,
    h1: `The ${ce.name} Center`,
    kicker: `${ce.theme} · ${ce.motor ? 'Motor center' : 'Awareness center'}`,
    breadcrumb: `<a href="/human-design">Human Design</a> › <a href="/human-design#centers">Centers</a> › ${esc(ce.name)}`,
    body
  });
}

function channelPage(key) {
  const ch = CHANNEL_DESCRIPTIONS[key] || CHANNEL_DESCRIPTIONS[key.split('-').reverse().join('-')];
  if (!ch) return null;
  const [a, b] = key.split('-').map(Number);
  const ga = GATES[a], gb = GATES[b];
  const body = `
    <p class="lede">${esc(ch.description)}</p>
    <div class="factrow">
      <span><b>Gates</b> <a href="/gate/${a}">${a} ${esc(ga?.name || '')}</a> ↔ <a href="/gate/${b}">${b} ${esc(gb?.name || '')}</a></span>
      ${ch.energyType ? `<span><b>Circuit type</b> ${esc(ch.energyType)}</span>` : ''}
    </div>
    <h2>When this channel is defined</h2>
    <p>${esc(ch.whenDefined || ch.description)}</p>
    <h2>The two gates</h2>
    <div class="grid">
      <a href="/gate/${a}">Gate ${a}: ${esc(ga?.name || '')}</a>
      <a href="/gate/${b}">Gate ${b}: ${esc(gb?.name || '')}</a>
    </div>`;
  return shell({
    title: `Channel ${key} in Human Design — meaning when defined`,
    description: `The ${key} channel in Human Design: ${esc((ch.description || '').slice(0, 120))}`,
    path: `/channel/${key}`,
    h1: `Channel ${key}`,
    kicker: `${esc(ga?.name || '')} × ${esc(gb?.name || '')}`,
    breadcrumb: `<a href="/human-design">Human Design</a> › <a href="/human-design#channels">Channels</a> › ${key}`,
    body
  });
}

function profilePage(slug) {
  const key = profileKey(slug);
  const pr = PROFILES[key];
  if (!pr) return null;
  const [l1, l2] = key.split('/').map(Number);
  const others = PROFILE_KEYS.filter(k => k !== key);
  const body = `
    <p class="lede">The ${key} profile — ${esc(pr.name)} — carries the theme of ${esc((pr.theme || '').toLowerCase())}. Your conscious personality leads with the ${l1} line and your unconscious design carries the ${l2} line, and the two together shape how you meet life.</p>
    <h2>Conscious line — ${l1} (${esc(LINE_THEMES[l1].name)})</h2>
    <p>${esc(LINE_THEMES[l1].text)}</p>
    <h2>Unconscious line — ${l2} (${esc(LINE_THEMES[l2].name)})</h2>
    <p>${esc(LINE_THEMES[l2].text)}</p>
    <h2>The twelve profiles</h2>
    <div class="grid">${others.map(k => `<a href="/profile/${profileSlug(k)}">${k} · ${esc(PROFILES[k].name)}</a>`).join('')}</div>`;
  return shell({
    title: `The ${key} Profile (${pr.name}) in Human Design`,
    description: `The ${key} ${pr.name} profile: ${pr.theme}. How the conscious ${l1} line and unconscious ${l2} line shape your path — free.`,
    path: `/profile/${slug}`,
    h1: `Profile ${key}: ${pr.name}`,
    kicker: esc(pr.theme),
    breadcrumb: `<a href="/human-design">Human Design</a> › <a href="/human-design#profiles">Profiles</a> › ${key}`,
    body
  });
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const formatDate = (d) => { const [y, mo, da] = d.split('-').map(Number); return `${MONTHS[mo - 1]} ${da}, ${y}`; };

function celebrityPage(slug) {
  const c = CELEB_BY_SLUG[slug];
  if (!c) return null;
  const [h, m] = c.birthTime.split(':').map(Number);
  const chart = calculateHumanDesign(c.birthDate, h + (m || 0) / 60, c.utcOffset);
  const tSlug = TYPE_SLUG_OF[NAME_TO_TYPESLUG[chart.type.name]] || 'generator';
  const pSlug = profileSlug(chart.profile.numbers);
  const cross = chart.incarnationCross?.name ? chart.incarnationCross.name.replace(/^The /, '') : null;
  const svg = `/chart.svg?${new URLSearchParams({ d: c.birthDate, t: c.birthTime, tz: String(c.utcOffset), n: c.name })}`;
  const compare = `/?${new URLSearchParams({ d: c.birthDate, t: c.birthTime, tz: String(c.utcOffset), n: c.name, connect: '1' })}`;
  const srcUrl = (c.source.match(/https?:\/\/[^\s)]+/) || [])[0];
  const idx = CELEBRITIES.findIndex(x => x.slug === slug);
  const more = [...CELEBRITIES.slice(idx + 1), ...CELEBRITIES.slice(0, idx)].slice(0, 8);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Person', name: c.name,
    birthDate: c.birthDate, birthPlace: { '@type': 'Place', name: c.place },
    url: `${ORIGIN}/celebrity/${slug}`
  };
  const body = `
    <div style="text-align:center;margin:6px 0 18px"><img src="${svg}" alt="${esc(c.name)}'s Human Design bodygraph" loading="lazy" style="max-width:100%;width:420px;height:auto"></div>
    <div class="factrow">
      <span><b>Type</b> <a href="/type/${tSlug}">${esc(chart.type.name)}</a></span>
      <span><b>Authority</b> ${esc(chart.authority.name)}</span>
      <span><b>Profile</b> <a href="/profile/${pSlug}">${esc(chart.profile.numbers)} ${esc(chart.profile.name || '')}</a></span>
      <span><b>Definition</b> ${esc(chart.definition)}</span>
    </div>
    <p class="lede">${esc(c.name)} is a <a href="/type/${tSlug}">${esc(chart.type.name)}</a> with ${esc(chart.authority.name)} and the <a href="/profile/${pSlug}">${esc(chart.profile.numbers)} ${esc(chart.profile.name || '')}</a> profile.${cross ? ` The incarnation cross is the Cross of ${esc(cross)}.` : ''}</p>
    <div class="cta" style="margin:18px 0 0">
      <strong>Compare your chart with ${esc(c.name)}</strong>
      <div>See your electromagnetic, companionship and dominance connections — free, in seconds.</div>
      <a href="${compare}">Compare my design with ${esc(c.name)}</a>
    </div>
    <h2>Birth data</h2>
    <div class="factrow">
      <span><b>Born</b> ${esc(formatDate(c.birthDate))} at ${esc(c.birthTime)}</span>
      <span><b>Place</b> ${esc(c.place)}</span>
      <span><b>Rodden rating</b> ${esc(c.rodden)}</span>
    </div>
    <p style="font-size:14px;color:var(--soft)">Birth data Rodden-rated <b>${esc(c.rodden)}</b>${srcUrl ? ` · <a href="${esc(srcUrl)}" rel="nofollow noopener" target="_blank">source</a>` : ''}. Human Design is time-sensitive — this chart reflects the recorded birth time above.</p>
    <h2>More celebrity charts</h2>
    <div class="grid">${more.map(x => `<a href="/celebrity/${x.slug}">${esc(x.name)}</a>`).join('')}</div>
    <p style="margin-top:14px"><a href="/celebrity">All celebrity Human Design charts →</a></p>
    <script type="application/ld+json">${JSON.stringify(jsonld)}</script>`;
  return shell({
    title: `${c.name}'s Human Design Chart — ${chart.type.name} ${chart.profile.numbers}`,
    description: `${c.name} is a ${chart.type.name} (${chart.profile.numbers} profile, ${chart.authority.name}). See the full bodygraph and compare it with your own chart — free.`,
    path: `/celebrity/${slug}`,
    h1: `${c.name}'s Human Design`,
    kicker: `${chart.type.name} · ${chart.profile.numbers} · ${chart.authority.name}`,
    breadcrumb: `<a href="/human-design">Human Design</a> › <a href="/celebrity">Celebrities</a> › ${esc(c.name)}`,
    body
  });
}

function celebrityIndexPage() {
  const items = CELEBRITIES.map(c => {
    const [h, m] = c.birthTime.split(':').map(Number);
    const chart = calculateHumanDesign(c.birthDate, h + (m || 0) / 60, c.utcOffset);
    return { c, type: chart.type.name, profile: chart.profile.numbers };
  });
  const byType = {};
  for (const it of items) (byType[it.type] = byType[it.type] || []).push(it);
  const body = `
    <p class="lede">Human Design charts for ${CELEBRITIES.length} well-known people — birth data verified against Astro-Databank, with only reliable birth times published. Tap any name for the full bodygraph, or compare them with your own chart.</p>
    ${Object.keys(byType).sort().map(t => `
      <h2>${esc(t)}s</h2>
      <div class="grid">${byType[t].sort((a, b) => a.c.name.localeCompare(b.c.name)).map(it => `<a href="/celebrity/${it.c.slug}">${esc(it.c.name)} · ${esc(it.profile)}</a>`).join('')}</div>`).join('')}`;
  return shell({
    title: 'Celebrity Human Design charts — verified birth data',
    description: `Human Design charts for ${CELEBRITIES.length} famous people — Einstein, Bowie, Beyoncé, Obama and more — with verified birth data. Compare any with your own, free.`,
    path: '/celebrity',
    h1: 'Celebrity Human Design charts',
    kicker: 'Verified birth data · compare with your own',
    breadcrumb: `<a href="/human-design">Human Design</a> › Celebrities`,
    body
  });
}

function circuitPage(slug) {
  const cg = CIRCUIT_GROUPS[slug];
  if (!cg || !CIRCUIT_DESC[slug]) return null;
  const channels = CHANNELS_IN_CIRCUIT(slug);
  const others = CIRCUIT_ORDER.filter(k => k !== slug);
  const body = `
    <p class="lede">${esc(CIRCUIT_DESC[slug])}</p>
    <div class="factrow">
      <span><b>Theme</b> ${esc(cg.theme)}</span>
      <span><b>Keynotes</b> ${esc(cg.keywords)}</span>
      <span><b>Channels</b> ${channels.length}</span>
    </div>
    <h2>Channels in the ${esc(cg.name)} circuit</h2>
    <div class="grid">${channels.map(ch => `<a href="/channel/${ch.gates.join('-')}">${ch.gates.join('-')} · ${esc(ch.name)}</a>`).join('')}</div>
    <h2>The four circuits</h2>
    <div class="grid">${others.map(k => `<a href="/circuit/${k}">${esc(CIRCUIT_GROUPS[k].name)}</a>`).join('')}</div>
    <p style="margin-top:14px">Circuits shape how energy connects between two people — see <a href="/compatibility">Human Design compatibility</a>.</p>`;
  return shell({
    title: `The ${cg.name} Circuit in Human Design — meaning & channels`,
    description: `The ${cg.name} circuit (${cg.theme}): what it means, its keynotes, and the ${channels.length} channels that run through it — free.`,
    path: `/circuit/${slug}`,
    h1: `The ${cg.name} Circuit`,
    kicker: esc(cg.theme),
    breadcrumb: `<a href="/human-design">Human Design</a> › <a href="/human-design#circuits">Circuits</a> › ${esc(cg.name)}`,
    body
  });
}

function compatibilityPage() {
  const types = [
    ['Electromagnetic', 'Each person carries one half of a channel — together they complete it, generating energy neither has alone. This is the spark of attraction, and the friction that rides along with it.'],
    ['Companionship', 'Both people already have the whole channel — shared, stable common ground where they simply understand each other with no effort.'],
    ['Compromise', 'One person has the full channel, the other only half of it. The full-channel person sets the tone; the other is drawn into their frequency — workable, but it asks for give and take.'],
    ['Dominance', 'One person has the full channel and the other has nothing in it. That energy flows one way, consistently conditioning the open person.']
  ];
  const body = `
    <p class="lede">A Human Design connection chart overlays two bodygraphs and reads how their energies meet — the channels you complete together, the centers you condition in each other, and the way your types and authorities make decisions side by side.</p>
    <h2>The four ways two charts connect</h2>
    ${types.map(([name, txt]) => `<div class="card line"><h3>${name}</h3><p>${esc(txt)}</p></div>`).join('')}
    <h2>Center conditioning</h2>
    <p>Where one person has a defined center and the other has it open, the defined person steadily conditions the open one — a consistent, often unspoken influence. Centers open in both amplify together; centers defined in both are fixed common ground.</p>
    <h2>Circuits</h2>
    <p>Every connecting channel runs through a circuit, which colours what the connection is about: <a href="/circuit/individual">Individual</a> (mutation, uniqueness), <a href="/circuit/tribal">Tribal</a> (support, resources), <a href="/circuit/collective">Collective</a> (sharing, logic), and <a href="/circuit/integration">Integration</a> (self-empowerment).</p>
    <div class="cta" style="margin:18px 0">
      <strong>See your own connection chart</strong>
      <div>Compare your design with anyone — partner, friend, family — free, in seconds.</div>
      <a href="/">Calculate your chart, then compare</a>
    </div>`;
  return shell({
    title: 'Human Design Compatibility & Connection Charts — how to read them',
    description: 'How Human Design connection charts work: electromagnetic, companionship, compromise and dominance channels, center conditioning, and circuits. Compare any two charts free.',
    path: '/compatibility',
    h1: 'Human Design Compatibility',
    kicker: 'How two designs meet — connection charts explained',
    breadcrumb: `<a href="/human-design">Human Design</a> › Compatibility`,
    body
  });
}

function hubPage() {
  const types = Object.keys(TYPES).map(k => `<a href="/type/${TYPE_SLUG_OF[k]}">${esc(TYPES[k].name)}</a>`).join('');
  const centers = CENTER_ORDER.map(c => `<a href="/center/${c}">${esc(CENTER_NAME(c))}</a>`).join('');
  const profiles = PROFILE_KEYS.map(k => `<a href="/profile/${profileSlug(k)}">${k} ${esc(PROFILES[k].name)}</a>`).join('');
  const gates = Array.from({ length: 64 }, (_, i) => i + 1).map(g => `<a href="/gate/${g}">${g}</a>`).join('');
  const channels = Object.keys(CHANNEL_DESCRIPTIONS).sort().map(k => `<a href="/channel/${k}">${k}</a>`).join('');
  const circuits = CIRCUIT_ORDER.map(c => `<a href="/circuit/${c}">${esc(CIRCUIT_GROUPS[c].name)}</a>`).join('');
  const body = `
    <p class="lede">A free, open reference to the Human Design system — every type, center, profile, gate, channel and circuit, with original interpretations and all 384 line meanings. Then compute your own chart in seconds.</p>
    <p><a href="/celebrity">Browse charts for ${CELEBRITIES.length} well-known people →</a> · <a href="/compatibility">How compatibility &amp; connection charts work →</a></p>
    <h2 id="types">The five types</h2><div class="grid">${types}</div>
    <h2 id="centers">The nine centers</h2><div class="grid">${centers}</div>
    <h2 id="profiles">The twelve profiles</h2><div class="grid">${profiles}</div>
    <h2 id="circuits">The four circuits</h2><div class="grid">${circuits}</div>
    <h2 id="gates">The 64 gates</h2><div class="grid">${gates}</div>
    <h2 id="channels">The 36 channels</h2><div class="grid">${channels}</div>`;
  return shell({
    title: 'Human Design reference — types, centers, gates, channels & profiles',
    description: 'A free, open Human Design reference: all five types, nine centers, twelve profiles, 64 gates with all 384 line interpretations, and 36 channels. Compute your own chart free.',
    path: '/human-design',
    h1: 'Human Design, in full',
    kicker: 'Free and open — every type, center, gate, channel and line',
    body
  });
}

// --- router + sitemap -----------------------------------------------------
export async function handleSeoPage(request) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/$/, '') || '/';
  let html = null, m;
  if (p === '/human-design') html = hubPage();
  else if (p === '/compatibility') html = compatibilityPage();
  else if (p === '/celebrity') html = celebrityIndexPage();
  else if ((m = p.match(/^\/celebrity\/([a-z0-9-]+)$/))) html = celebrityPage(m[1]);
  else if ((m = p.match(/^\/circuit\/([a-z]+)$/))) html = circuitPage(m[1]);
  else if ((m = p.match(/^\/gate\/(\d{1,2})$/))) html = gatePage(+m[1]);
  else if ((m = p.match(/^\/type\/([a-z-]+)$/))) html = typePage(m[1]);
  else if ((m = p.match(/^\/center\/([a-z]+)$/))) html = centerPage(m[1]);
  else if ((m = p.match(/^\/channel\/(\d{1,2}-\d{1,2})$/))) html = channelPage(m[1]);
  else if ((m = p.match(/^\/profile\/(\d-\d)$/))) html = profilePage(m[1]);
  if (!html) return null;

  const cache = caches.default;
  const cacheKey = new Request(`${ORIGIN}${p}`, { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const res = htmlResponse(html);
  await cache.put(cacheKey, res.clone());
  return res;
}

export function handleSitemap() {
  const urls = [
    '/', '/human-design', '/celebrity', '/compatibility',
    ...Object.keys(TYPES).map(k => `/type/${TYPE_SLUG_OF[k]}`),
    ...CENTER_ORDER.map(c => `/center/${c}`),
    ...CIRCUIT_ORDER.map(c => `/circuit/${c}`),
    ...PROFILE_KEYS.map(k => `/profile/${profileSlug(k)}`),
    ...Array.from({ length: 64 }, (_, i) => `/gate/${i + 1}`),
    ...Object.keys(CHANNEL_DESCRIPTIONS).map(k => `/channel/${k}`),
    ...CELEBRITIES.map(c => `/celebrity/${c.slug}`)
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `<url><loc>${ORIGIN}${u}</loc></url>`).join('\n')}
</urlset>`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
}

export function handleRobots() {
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' }
  });
}
