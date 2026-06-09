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
  TYPES, PROFILES, AUTHORITIES, CENTERS, GATES,
  GATE_DESCRIPTIONS, LINE_DESCRIPTIONS, CHANNEL_DESCRIPTIONS,
  calculateHumanDesign
} from 'natalengine';
import { CELEBRITIES } from './celebrities.js';

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

// Original generic line themes (the gate pages carry the specific 384; these
// describe the universal quality, used on profile pages).
const LINE_THEMES = {
  1: { name: 'Investigator', text: 'The foundation. You build security by studying, understanding and getting to the bottom of things before you act — and others come to rely on the depth you lay down.' },
  2: { name: 'Hermit', text: 'The natural. You carry an innate gift others often see before you do; it flowers in your own quiet time and resists being summoned on demand.' },
  3: { name: 'Martyr', text: 'Trial and error. You learn by doing — bumping into what does not work and adapting — resilient, experimental and wise to whatever actually holds up.' },
  4: { name: 'Opportunist', text: 'The networker. Your opportunities travel through relationships and trusted bonds; warmth and friendship, not cold pursuit, open the right doors.' },
  5: { name: 'Heretic', text: 'The projected one. People project practical, universal solutions onto you; meet the moment and you are trusted as a leader, fall short and the same hope can sour — reputation matters.' },
  6: { name: 'Role Model', text: 'The example. You live in three phases — a trial-and-error youth, a withdrawn observing middle, then a trusted, objective exemplar others measure themselves against.' }
};

// Brief original "how to live it" guidance per type (keeps type pages from
// being thin).
const TYPE_GUIDANCE = {
  manifestor: 'Manifestors are here to initiate and get things moving. Your power comes from acting on your own urges rather than waiting — and from informing the people your actions affect, which dissolves the resistance that otherwise meets you. When you honour that, life feels peaceful; when you suppress it, anger.',
  generator: 'Generators are the life force of the world, built to do work they love. Your power is not in chasing but in responding — letting things come to you and noticing the gut pull toward yes or no. Work that lights you up is sustainable; forcing what doesn\'t leads to frustration and burnout.',
  manifestingGenerator: 'Manifesting Generators respond like a Generator and then move fast, often skipping steps and juggling several things at once. Your path is rarely linear, and that is by design. Respond first, then inform before you leap, and trust the multi-passionate route — frustration and anger both signal you have got ahead of your response.',
  projector: 'Projectors are the guides, here to see and direct energy rather than generate it. Your gift lands when it is recognised and invited — pushing in uninvited meets resistance and exhaustion. Master what fascinates you, manage your energy, and wait for the right invitations; success feels like recognition, not hustle.',
  reflector: 'Reflectors are rare mirrors of their community, sampling the energy around them. You are deeply affected by where you are and who you are with, so environment is everything. Give big decisions a full lunar cycle before committing — clarity comes over time, not on demand — and a true life feels like delight.'
};

const CHANNELS_FOR_GATE = (g) => Object.keys(CHANNEL_DESCRIPTIONS)
  .filter(k => k.split('-').map(Number).includes(g));
const GATES_IN_CENTER = (c) => Object.entries(GATES)
  .filter(([, v]) => v.center === c).map(([g]) => +g).sort((a, b) => a - b);
const CENTER_NAME = (c) => CENTERS[c]?.name || c;

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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
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
    <h2>Where Gate ${n} sits</h2>
    <p>Gate ${n} lives in the <a href="/center/${center}">${esc(CENTER_NAME(center))}</a>. Explore neighbouring gates: <a href="/gate/${prev}">Gate ${prev}</a> · <a href="/gate/${next}">Gate ${next}</a>.</p>`;
  return shell({
    title: `Gate ${n}: ${g.name} — meaning, all 6 lines | Human Design`,
    description: `Gate ${n} (${g.name}) in Human Design: ${d.keynote}. Full meaning plus all six line interpretations — free.`,
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

function hubPage() {
  const types = Object.keys(TYPES).map(k => `<a href="/type/${TYPE_SLUG_OF[k]}">${esc(TYPES[k].name)}</a>`).join('');
  const centers = CENTER_ORDER.map(c => `<a href="/center/${c}">${esc(CENTER_NAME(c))}</a>`).join('');
  const profiles = PROFILE_KEYS.map(k => `<a href="/profile/${profileSlug(k)}">${k} ${esc(PROFILES[k].name)}</a>`).join('');
  const gates = Array.from({ length: 64 }, (_, i) => i + 1).map(g => `<a href="/gate/${g}">${g}</a>`).join('');
  const channels = Object.keys(CHANNEL_DESCRIPTIONS).sort().map(k => `<a href="/channel/${k}">${k}</a>`).join('');
  const body = `
    <p class="lede">A free, open reference to the Human Design system — every type, center, profile, gate and channel, with original interpretations and all 384 line meanings. Then compute your own chart in seconds.</p>
    <p><a href="/celebrity">Browse Human Design charts for ${CELEBRITIES.length} well-known people →</a></p>
    <h2 id="types">The five types</h2><div class="grid">${types}</div>
    <h2 id="centers">The nine centers</h2><div class="grid">${centers}</div>
    <h2 id="profiles">The twelve profiles</h2><div class="grid">${profiles}</div>
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
  else if (p === '/celebrity') html = celebrityIndexPage();
  else if ((m = p.match(/^\/celebrity\/([a-z0-9-]+)$/))) html = celebrityPage(m[1]);
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
    '/', '/human-design', '/celebrity',
    ...Object.keys(TYPES).map(k => `/type/${TYPE_SLUG_OF[k]}`),
    ...CENTER_ORDER.map(c => `/center/${c}`),
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
