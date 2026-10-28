/**
 * Open Human Design — remote MCP server (Phase 2: ad-hoc compute tools).
 *
 * Five one-shot tools, no auth required — they compute deterministic math
 * from birth data supplied in the call (no user data is stored or read).
 * See docs/PLATFORM.md for the tool design rationale and the Phase-4
 * additions (list_people / save_person / saved-name BirthInputs).
 *
 * Stateless: a fresh Server + transport per request (the SDK-documented
 * pattern for serverless runtimes). Charts compute in ~1ms, so JSON
 * responses (no SSE stream) keep clients simple and fast.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import {
  calculateHumanDesign,
  calculateGeneKeys,
  calculateAstrology,
  compareHumanDesign,
  calculateHDTransits,
  analyzePenta,
  searchPlaces,
  resolveUtcOffset,
  GATE_DESCRIPTIONS,
  LINE_DESCRIPTIONS,
  CHANNEL_DESCRIPTIONS,
  HEXAGRAM_DESCRIPTIONS,
  GENE_KEY_DESCRIPTIONS,
  CENTERS,
  GATES,
  renderBodygraphSVG
} from 'natalengine';
import { tombstone } from './sync.js';

// ---------------------------------------------------------------------------
// BirthInput resolution
// ---------------------------------------------------------------------------

const BIRTH_INPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      properties: {
        birthDate: { type: 'string', description: 'YYYY-MM-DD (local date of birth)' },
        birthTime: { type: 'string', description: 'HH:MM 24h local. Omit if unknown (noon is used and noted — minutes matter in Human Design).' },
        place: { type: 'string', description: 'Birth place, e.g. "Boulder, Colorado". Geocoded server-side; the historical UTC offset at the birth moment is resolved automatically (handles DST and timezone history). Preferred over utcOffset.' },
        lat: { type: 'number', description: 'Latitude — only needed if place is not given' },
        lon: { type: 'number', description: 'Longitude — only needed if place is not given' },
        utcOffset: { type: 'number', description: 'UTC offset in hours at the birth moment (e.g. -6, 5.5). Only use when place is unavailable — you must account for historical DST yourself.' }
      },
      required: ['birthDate']
    },
    {
      type: 'string',
      description: 'The name of a saved person (personal connector only) — e.g. "Mom". Use list_people to see who is available.'
    }
  ]
};

// OAuth scopes (granted on the consent page, carried in props.scope). Tokens
// minted before scopes were enforced have no props.scope: read-only.
function hasScope(ctx, scope) {
  return (ctx?.scopes || []).includes(scope);
}
function scopeError(what, scope) {
  return new Error(`${what} need the "${scope}" permission, which this connection was not granted. Reconnect Open Human Design from your AI app and allow it.`);
}

/** Resolve "Saved Name" → stored birth data (ai_access-gated, SQL-enforced). */
async function lookupPerson(ctx, name) {
  if (!ctx?.userId || !ctx?.env?.DB) {
    throw new Error(`"${name}": saved names only work on the personal connector (sign in at openhumandesign.com and connect /mcp/my)`);
  }
  if (!hasScope(ctx, 'charts:read')) throw scopeError('Saved names', 'charts:read');
  // Exact (case-insensitive) match, never LIKE: "%" / "M%" let a caller probe
  // names. Hidden people (AI access off) get the same answer as missing ones.
  const { results } = await ctx.env.DB.prepare(
    `SELECT * FROM people WHERE user_id = ?1 AND deleted_at IS NULL AND ai_access = 1 AND name = ?2 COLLATE NOCASE`
  ).bind(ctx.userId, name).all();

  const allowed = results.filter(r => r.ai_access); // the SQL filters too; belt and braces
  if (!allowed.length) {
    throw new Error(`No saved person named "${name}" that your AI can see. Use list_people to see who is available (people with AI access off stay hidden; the user can turn it on in the app), or save_person to add them.`);
  }
  if (allowed.length > 1) {
    throw new Error(`Multiple people named "${name}" — candidates: ${allowed.map(r => `${r.name} (born ${r.birth_date})`).join('; ')}. Ask the user which one.`);
  }
  const r = allowed[0];
  return {
    birthDate: r.birth_date,
    birthTime: r.time_unknown ? undefined : r.birth_time,
    lat: r.loc_lat ?? undefined,
    lon: r.loc_lon ?? undefined,
    utcOffset: r.loc_timezone ?? undefined,
    _savedName: r.name
  };
}

/**
 * Geocode a free-form place string. Open-Meteo matches bare names only,
 * but AIs naturally pass "City, Region" / "City, Country" — so on a miss,
 * retry with the name before the first comma and rank candidates by how
 * well their full label matches the qualifier.
 */
async function geocodeFlexible(placeStr) {
  let places = await searchPlaces(placeStr, 5);
  if (places.length || !placeStr.includes(',')) return places;

  const [head, ...rest] = placeStr.split(',').map(s => s.trim());
  places = await searchPlaces(head, 10);
  const qualifier = rest.join(' ').toLowerCase();
  if (!places.length || !qualifier) return places;

  const qualifierTokens = qualifier.split(/[\s,]+/).filter(Boolean);
  const matches = places.filter(p => {
    const lbl = p.label.toLowerCase();
    return qualifierTokens.some(tok => lbl.includes(tok));
  });
  return matches.length ? matches : places;
}

async function resolveBirth(input, label = 'birth', ctx = null) {
  if (typeof input === 'string') {
    input = await lookupPerson(ctx, input);
  }
  if (!input || typeof input !== 'object') throw new Error(`${label}: expected birth data or a saved person's name`);
  const { birthDate } = input;
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new Error(`${label}.birthDate must be YYYY-MM-DD`);
  }
  const timeUnknown = !input.birthTime;
  const birthTime = input.birthTime && /^\d{1,2}:\d{2}$/.test(input.birthTime) ? input.birthTime : '12:00';

  let utcOffset = typeof input.utcOffset === 'number' ? input.utcOffset : null;
  let placeNote = null;

  if (utcOffset === null && input.place) {
    const places = await geocodeFlexible(input.place);
    if (!places.length) throw new Error(`${label}.place: no match found for "${input.place}" — try a larger nearby city or pass utcOffset directly`);
    const top = places[0];
    utcOffset = resolveUtcOffset(birthDate, birthTime, top.timezone);
    placeNote = {
      resolved: top.label,
      ianaTimezone: top.timezone,
      utcOffsetAtBirth: utcOffset,
      lat: top.latitude,
      lon: top.longitude,
      ...(places.length > 1 ? { otherCandidates: places.slice(1, 4).map(p => p.label) } : {})
    };
  }

  if (utcOffset === null) {
    throw new Error(`${label}: provide either place (preferred) or utcOffset`);
  }

  const [h, m] = birthTime.split(':').map(Number);
  return {
    birthDate,
    birthTime,
    birthHour: h + (m || 0) / 60,
    timeUnknown,
    utcOffset,
    placeNote,
    _savedName: input._savedName
  };
}

// ---------------------------------------------------------------------------
// Chart serializers — token-efficient, interpretive text inlined (one-shot)
// ---------------------------------------------------------------------------

const actMap = (gates) => {
  const out = {};
  for (const [planet, g] of Object.entries(gates)) {
    if (g) out[planet] = `${g.gate}.${g.line}`;
  }
  return out;
};

function hdSummary(chart, detail = 'summary') {
  const base = {
    type: chart.type.name,
    strategy: chart.type.strategy,
    signature: chart.type.signature,
    notSelfTheme: chart.type.notSelf,
    typeMeaning: chart.type.description,
    authority: chart.authority.name,
    authorityPractice: chart.authority.description,
    profile: `${chart.profile.numbers} ${chart.profile.name}`,
    profileTheme: chart.profile.theme,
    definition: chart.definition,
    incarnationCross: chart.incarnationCross?.fullName,
    variable: {
      notation: chart.variable?.notation,
      determination: chart.variable?.determination?.name,
      environment: chart.variable?.environment?.name,
      motivation: chart.variable?.motivation?.name,
      perspective: chart.variable?.perspective?.name,
      cognition: chart.variable?.determination?.cognition?.name
    },
    centers: {
      defined: chart.centers.definedNames,
      undefined: chart.centers.undefinedNames,
      open: chart.centers.openNames
    },
    channels: chart.channels.map(ch => ({
      channel: `${ch.gates[0]}-${ch.gates[1]}`,
      name: ch.name,
      circuit: ch.circuit,
      keynote: CHANNEL_DESCRIPTIONS[`${ch.gates[0]}-${ch.gates[1]}`]?.whenDefined || ch.theme
    })),
    activations: {
      personality: actMap(chart.gates.personality),
      design: actMap(chart.gates.design)
    },
    designDate: chart.positions?.design?.date
  };

  if (detail === 'full') {
    const sub = (g) => ({ gate: g.gate, line: g.line, lineKeynote: LINE_DESCRIPTIONS[g.gate]?.[g.line]?.keynote, color: g.color, tone: g.tone, base: g.base });
    base.substructure = {
      personality: Object.fromEntries(Object.entries(chart.gates.personality)
        .filter(([, g]) => g)
        .map(([p, g]) => [p, sub(g)])),
      design: Object.fromEntries(Object.entries(chart.gates.design)
        .filter(([, g]) => g)
        .map(([p, g]) => [p, sub(g)]))
    };
    base.gateKeynotes = Object.fromEntries(chart.gates.all.map(g =>
      [g, GATE_DESCRIPTIONS[g]?.keynote || GATES[g]?.name]));
  }
  return base;
}

function gkSummary(gk) {
  const sphere = (s) => s ? { key: s.keyLine || s.key, shadow: s.shadow, gift: s.gift, siddhi: s.siddhi } : null;
  return {
    activationSequence: {
      lifeWork: sphere(gk.activationSequence.lifeWork),
      evolution: sphere(gk.activationSequence.evolution),
      radiance: sphere(gk.activationSequence.radiance),
      purpose: sphere(gk.activationSequence.purpose)
    },
    venusSequence: {
      attraction: sphere(gk.venusSequence.attraction),
      iq: sphere(gk.venusSequence.iq),
      eq: sphere(gk.venusSequence.eq),
      sq: sphere(gk.venusSequence.sq)
    },
    pearlSequence: {
      vocation: sphere(gk.pearlSequence.vocation),
      culture: sphere(gk.pearlSequence.culture),
      pearl: sphere(gk.pearlSequence.pearl)
    }
  };
}

function astroSummary(a) {
  return {
    sun: a.sun?.sign?.name || a.sun?.sign,
    moon: a.moon?.sign?.name || a.moon?.sign,
    rising: a.rising?.sign?.name || a.rising?.sign || 'needs lat/lon',
    planets: Object.fromEntries(Object.entries(a.planets || {}).map(([p, v]) =>
      [p, `${v.sign?.name || v.sign} ${v.degree || ''}`.trim()]))
  };
}

const json = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 1) }] });
const errText = (msg) => ({ content: [{ type: 'text', text: `Error: ${msg}` }], isError: true });

// Canonical public origin for the SVG chart link (the deployed domain).
const PUBLIC_ORIGIN = 'https://openhumandesign.com';

function chartLinks(b) {
  const p = new URLSearchParams();
  p.set('d', b.birthDate);
  if (!b.timeUnknown) p.set('t', b.birthTime);
  p.set('tz', String(b.utcOffset));
  if (b._savedName) p.set('n', b._savedName);
  const qs = p.toString();
  return { app: `${PUBLIC_ORIGIN}/?${qs}`, svg: `${PUBLIC_ORIGIN}/chart.svg?${qs}` };
}

// ---------------------------------------------------------------------------
// Inline chart panel — MCP Apps extension (SEP-1865, GA on claude.ai).
//
// compute_chart's tool definition carries _meta.ui.resourceUri → this ui://
// resource. claude.ai renders it as a sandboxed iframe panel below the reply.
// The HTML is STATIC (cacheable); the per-call chart URL arrives via the tool
// result's `structuredContent.svgUrl`, delivered out-of-band to the iframe —
// so the chart image costs ~zero model tokens (no SVG typed, no base64 read).
// The external <img> loads because _meta.ui.csp.resourceDomains maps to the
// sandbox CSP img-src (confirmed working for HTTPS origins on claude.ai).
// ---------------------------------------------------------------------------

const CHART_WIDGET_URI = 'ui://open-human-design/chart';
const APP_MIME = 'text/html;profile=mcp-app'; // exact string the host requires

// Light, renderer-safe SVG trim for the panel payload: strip the interactive
// app's data-* hooks, drop redundant opacity, round coordinates. No <style>
// and no markup restructuring, so it renders identically in any engine (and
// needs no CSP style-src). ~17% smaller; correctness over maximal squeeze.
function minifyChartSvg(src) {
  return src
    .replace(/ data-(?:gate|center|layer)="[^"]*"/g, '')
    .replace(/ role="img"/g, '')
    .replace(/ opacity="1"(?=[ />])/g, '')
    .replace(/ (cx|cy|x|y|r)="(-?\d+\.\d+)"/g, (_, a, n) => ` ${a}="${Math.round(parseFloat(n))}"`)
    .replace(/-?\d+\.\d{2,}/g, m => String(Math.round(parseFloat(m) * 10) / 10));
}

// Defensive postMessage client. Registers its listener first, deep-scans every
// host message for the chart payload, then announces readiness so the host
// delivers the tool result. PRIMARY render path is inline-SVG injection
// (structuredContent.svg) — inline SVG is part of the iframe DOM, so it is NOT
// subject to the sandbox img-src CSP that blocks external images. Falls back to
// an external <img> from svgUrl if only the URL is present.
//
// Auto-height: claude.ai ignores the spec size-changed notification and instead
// reads the iframe's documentElement height straight from the DOM (claude-ai-mcp
// #69). So after the (tall) SVG lays out we write documentElement/body height
// ourselves — fired via rAF so it lands AFTER render (writing before render lets
// claude.ai snapshot the iframe at the tiny default and lock it). We also emit
// the spec ui/notifications/size-changed for compliant hosts (Claude Desktop),
// and re-measure on reflow. min-height (not 100vh) avoids pre-render collapse.
const CHART_WIDGET_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
:root{color-scheme:light dark}html,body{margin:0;padding:0;background:transparent;min-height:420px}
#w{padding:8px;box-sizing:border-box}
#w svg{width:100%;height:auto;display:block;border-radius:12px;background:#fff}
#w img{max-width:100%;height:auto;display:block;margin:0 auto;border-radius:12px;background:#fff}
.ph{font:14px/1.5 system-ui,-apple-system,sans-serif;color:#8a8a8a;padding:28px;text-align:center}
a{color:#b8763e}
</style></head><body>
<div id="w"><div id="ph" class="ph">Loading bodygraph…</div></div>
<script>(function(){
var w=document.getElementById('w'),done=false,aspect=1.134,lastH=0;
// Height is COMPUTED from the chart aspect ratio x panel width (correct on the
// first frame, no layout-timing race), floored so it can never collapse, and
// written only to documentElement (claude.ai reads that from the DOM —
// claude-ai-mcp#69). Never touch body height (that clipped content before).
function applyHeight(){try{
var cw=w.clientWidth||document.documentElement.clientWidth||0;
var h=cw>0?Math.ceil((cw-16)*aspect)+16+16:0;
h=Math.max(h,420);
if(h===lastH)return;lastH=h;
document.documentElement.style.height=h+'px';
var wd=Math.ceil(window.innerWidth)||cw||0;
try{parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/size-changed',params:{width:wd,height:h}},'*');}catch(_){}
try{parent.postMessage({jsonrpc:'2.0',method:'ui/resize',params:{width:wd,height:h}},'*');}catch(_){}
}catch(_){}}
function pick(o,d){if(!o||d>8||typeof o!=='object')return null;
if(typeof o.svg==='string'&&o.svg.indexOf('<svg')>=0)return{svg:o.svg,alt:o.alt};
if(typeof o.svgUrl==='string')return{url:o.svgUrl,alt:o.alt};
for(var k in o){var r=pick(o[k],d+1);if(r)return r;}return null;}
function render(f){if(done||!f)return;done=true;
if(f.svg){w.innerHTML=f.svg;
var s=w.querySelector('svg');
if(s){var vb=(s.getAttribute('viewBox')||'').split(' ').filter(function(x){return x;});
if(vb.length>=4){var vw=parseFloat(vb[2]),vh=parseFloat(vb[3]);if(vw>0&&vh>0)aspect=vh/vw;}
s.removeAttribute('width');s.removeAttribute('height');s.setAttribute('preserveAspectRatio','xMidYMid meet');}
requestAnimationFrame(function(){requestAnimationFrame(applyHeight);});
setTimeout(applyHeight,120);setTimeout(applyHeight,400);setTimeout(applyHeight,900);}
else if(f.url){var img=new Image();img.alt=f.alt||'Human Design bodygraph';
img.onload=function(){w.innerHTML='';w.appendChild(img);requestAnimationFrame(applyHeight);};
img.onerror=function(){w.innerHTML='Open the <a href="'+f.url+'" target="_blank" rel="noopener">bodygraph</a>.';};
img.src=f.url;}}
window.addEventListener('message',function(e){try{render(pick(e.data,0));}catch(_){}});
window.addEventListener('resize',function(){if(done)applyHeight();});
try{parent.postMessage({jsonrpc:'2.0',id:1,method:'ui/initialize',params:{protocolVersion:'2026-01-26',capabilities:{},clientInfo:{name:'open-human-design',version:'0.4.0'}}},'*');
parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*');}catch(_){}
})();</script></body></html>`;

/**
 * Build the chart-image content for a tool result.
 *
 * claude.ai does NOT render tool-result image blocks inline (they hide in
 * the collapsed tool accordion — anthropics/claude-ai-mcp#238), and it
 * CSP-blocks external markdown images. The one thing that DOES render
 * inline is an SVG *artifact*. So:
 * - "svg" (default): hand the model the SVG markup + an instruction to
 *   render it as an artifact → the chart actually appears in the chat.
 * - "png": rasterized image block (for clients that do render tool images).
 * - "both": both. An interactive-chart link is always included.
 */
async function chartImageContent(chart, b, mode) {
  if (mode === 'none') return [];
  const links = chartLinks(b);
  const svg = renderBodygraphSVG(chart, { theme: 'light', planetColumns: true, fontFamily: 'Inter' });
  const items = [];

  if (mode === 'svg' || mode === 'both') {
    items.push({
      type: 'text',
      text: 'DISPLAY THE CHART: create an artifact of type "image/svg+xml" containing exactly the SVG below, reproduced verbatim. ' +
        '(claude.ai does not render tool-result images or external image links inline — an inline-SVG artifact is the way to show it.)\n\n' + svg
    });
  }
  if (mode === 'png' || mode === 'both') {
    try {
      // Rasterizer is Worker-only (static .wasm/.ttf imports) — load it
      // lazily so the MCP module still imports under plain Node tests.
      const { svgToPng, toBase64 } = await import('./render.js');
      const png = await svgToPng(svg, 1000);
      items.push({ type: 'image', data: toBase64(png), mimeType: 'image/png' });
    } catch (e) {
      items.push({ type: 'text', text: `(inline PNG unavailable: ${e.message})` });
    }
  }
  items.push({
    type: 'text',
    text: `Interactive chart (open in a browser — beautiful, tappable): ${links.app}\nRaw SVG file: ${links.svg}`
  });
  return items;
}

function birthMeta(b) {
  return {
    ...(b._savedName ? { person: b._savedName } : {}),
    input: { birthDate: b.birthDate, birthTime: b.timeUnknown ? 'unknown (noon used — line-level details may be unreliable)' : b.birthTime, utcOffset: b.utcOffset },
    ...(b.placeNote ? { place: b.placeNote } : {})
  };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'compute_chart',
    _meta: { ui: { resourceUri: CHART_WIDGET_URI }, 'ui/resourceUri': CHART_WIDGET_URI },
    description: 'Compute a chart and show the bodygraph. Human Design by default; add "gene_keys"/"astrology" to systems for those views. The bodygraph renders automatically as an inline visual panel (no action needed from you — do NOT also paste an image or SVG). The data comes back as JSON for you to interpret, plus an interactive-chart link you can offer. image defaults to "auto" (panel + link, ~zero extra tokens). Override only for non-visual clients: "svg" adds an SVG-artifact you must render verbatim, "png" adds a raster image block, "both" adds both, "none" is data + link only. Batches are cheap now — every chart gets its own free panel.',
    inputSchema: {
      type: 'object',
      properties: {
        birth: BIRTH_INPUT_SCHEMA,
        systems: {
          type: 'array',
          items: { type: 'string', enum: ['human_design', 'gene_keys', 'astrology'] },
          description: 'Default ["human_design"]'
        },
        detail: { type: 'string', enum: ['summary', 'full'], description: 'full adds per-planet color/tone/base substructure and gate keynotes' },
        image: { type: 'string', enum: ['auto', 'none', 'svg', 'png', 'both'], description: 'How to surface the bodygraph. "auto" (default): rely on the inline visual panel (MCP App) + a text link — ~zero tokens, nothing for you to render. "svg"/"png"/"both": ALSO embed image bytes in the result for clients that lack panel support (svg = artifact markup you render verbatim; png = raster block). "none": data + link only. The panel renders regardless; these modes just add a fallback image.' }
      },
      required: ['birth']
    },
    async handler({ birth, systems = ['human_design'], detail = 'summary', image = 'auto' }, ctx) {
      const b = await resolveBirth(birth, 'birth', ctx);
      const hd = calculateHumanDesign(b.birthDate, b.birthHour, b.utcOffset);
      const out = { ...birthMeta(b) };
      if (systems.includes('human_design')) out.humanDesign = hdSummary(hd, detail);
      if (systems.includes('gene_keys')) out.geneKeys = gkSummary(calculateGeneKeys(hd));
      if (systems.includes('astrology')) {
        const lat = birth.lat ?? b.placeNote?.lat ?? null;
        const lon = birth.lon ?? b.placeNote?.lon ?? null;
        out.astrology = astroSummary(calculateAstrology(b.birthDate, b.birthHour, b.utcOffset, lat, lon));
      }
      const base = json(out);
      const links = chartLinks(b);

      // 'auto' = rely on the inline panel (zero-token); svg/png/both still
      // embed bytes for clients without MCP-Apps support. The panel data
      // (structuredContent) + _meta linkage are attached either way, so the
      // visual renders on claude.ai regardless of the fallback mode.
      const extra = image === 'auto'
        ? [{ type: 'text', text: `Bodygraph rendered in the panel below. Interactive (tappable): ${links.app} · raw image: ${links.svg}` }]
        : await chartImageContent(hd, b, image);

      // The SVG markup rides in structuredContent (delivered out-of-band to the
      // panel iframe — NOT into model context). The iframe injects it inline so
      // it bypasses the sandbox img-src CSP entirely. svgUrl is the fallback.
      const panelSvg = minifyChartSvg(renderBodygraphSVG(hd, { theme: 'light', planetColumns: true, fontFamily: 'Inter' }));

      return {
        content: [...base.content, ...extra],
        structuredContent: {
          svg: panelSvg,
          svgUrl: links.svg,
          appUrl: links.app,
          name: b._savedName || null,
          alt: `Human Design bodygraph${b._savedName ? ' for ' + b._savedName : ''}`
        },
        _meta: { ui: { resourceUri: CHART_WIDGET_URI } }
      };
    }
  },
  {
    name: 'compare_charts',
    description: 'Full Human Design connection analysis between two people: the type dynamic (gifts/challenge/how to make it work), how their authorities decide together, profile harmony, the four channel connections each tagged with its circuit — electromagnetic (attraction, each has half), companionship (both whole, common ground), compromise (one full/one half), dominance (one full/one empty) — the center-conditioning map (who steadily shapes whom), what they bridge into being together, composite type, and a summary.',
    inputSchema: {
      type: 'object',
      properties: {
        personA: BIRTH_INPUT_SCHEMA,
        personB: BIRTH_INPUT_SCHEMA
      },
      required: ['personA', 'personB']
    },
    async handler({ personA, personB }, ctx) {
      const [a, b] = await Promise.all([resolveBirth(personA, 'personA', ctx), resolveBirth(personB, 'personB', ctx)]);
      const chartA = calculateHumanDesign(a.birthDate, a.birthHour, a.utcOffset);
      const chartB = calculateHumanDesign(b.birthDate, b.birthHour, b.utcOffset);
      const cmp = compareHumanDesign(chartA, chartB);
      const cc = cmp.connectionChart;
      const connList = (items) => items.map(c => ({ channel: `${c.channel} (${c.gates.join('-')})`, circuit: c.circuit, meaning: c.description }));
      const ti = cmp.typeInteraction || {}, ad = cmp.authorityDynamic || {}, ph = cmp.profileHarmony || {};
      const conditioning = (cmp.centerDynamics || [])
        .filter(c => /Conditions/.test(c.dynamic))
        .map(c => ({
          center: c.centerName,
          direction: c.dynamic === 'A Conditions B' ? 'personA conditions personB'
            : c.dynamic === 'B Conditions A' ? 'personB conditions personA' : c.dynamic,
          note: c.description
        }));
      return json({
        personA: { ...birthMeta(a), type: chartA.type.name, profile: chartA.profile.numbers, authority: chartA.authority.name },
        personB: { ...birthMeta(b), type: chartB.type.name, profile: chartB.profile.numbers, authority: chartB.authority.name },
        compositeType: cc.compositeType,
        typeDynamic: ti.dynamic,
        dynamic: { gifts: ti.gifts, challenge: ti.challenges, makeItWork: ti.tips },
        decisionMaking: { authorities: `${ad.authorityA} + ${ad.authorityB}`, timing: ad.timing, note: ad.description },
        profiles: { combo: `${ph.profileA} ${ph.nameA} + ${ph.profileB} ${ph.nameB}`, harmony: ph.harmony, note: ph.description },
        electromagnetic: connList(cc.connections.electromagnetic),
        companionship: connList(cc.connections.companionship),
        compromise: connList(cc.connections.compromise),
        dominance: connList(cc.connections.dominance),
        centerConditioning: conditioning,
        createTogether: cmp.bridging ? { note: cmp.bridging.description, channels: (cmp.bridging.bridgedChannels || []).map(x => `${x.channel} (${x.theme})`) } : undefined,
        summary: cmp.summary
      });
    }
  },
  {
    name: 'get_transits',
    description: 'How current (or any date\'s) planetary transits interact with a person\'s Human Design chart: channel completions (temporary definition), temporarily defined centers, reinforced gates.',
    inputSchema: {
      type: 'object',
      properties: {
        birth: BIRTH_INPUT_SCHEMA,
        date: { type: 'string', description: 'YYYY-MM-DD, default today (UTC)' }
      },
      required: ['birth']
    },
    async handler({ birth, date }, ctx) {
      const b = await resolveBirth(birth, 'birth', ctx);
      const chart = calculateHumanDesign(b.birthDate, b.birthHour, b.utcOffset);
      const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().split('T')[0];
      const t = calculateHDTransits(chart, d);
      return json({
        ...birthMeta(b),
        natalType: chart.type.name,
        transitDate: d,
        transitSun: `Gate ${t.highlights.sun.gate}.${t.highlights.sun.line} — ${t.highlights.sun.gateName}`,
        transitMoon: `Gate ${t.highlights.moon.gate}.${t.highlights.moon.line} — ${t.highlights.moon.gateName}`,
        channelCompletions: t.channelCompletions.map(c => ({
          channel: `${c.channel} (${c.gates.join('-')})`,
          how: c.natalGate
            ? `natal Gate ${c.natalGate} completed by transit Gate ${c.transitGate} (${c.transitPlanet})`
            : 'pure transit channel',
          significance: c.significance
        })),
        temporarilyDefinedCenters: t.temporarilyDefinedCenters.map(c => ({ center: c.centerName, theme: c.theme })),
        reinforcedGates: t.reinforcedGates.slice(0, 8).map(g => `Gate ${g.gate} — ${g.gateName}`)
      });
    }
  },
  {
    name: 'analyze_team',
    description: 'Human Design group/Penta analysis for 2-9 people: group type, filled and missing team roles, electromagnetic connections between members, recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        members: {
          type: 'array',
          minItems: 2,
          maxItems: 9,
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, ...BIRTH_INPUT_SCHEMA.properties },
            required: ['birthDate']
          }
        }
      },
      required: ['members']
    },
    async handler({ members }, ctx) {
      if (!Array.isArray(members) || members.length < 2) throw new Error('members: need at least 2 people');
      const resolved = await Promise.all(members.map((m, i) => resolveBirth(m, (typeof m === 'string' ? m : m.name) || `member ${i + 1}`, ctx)));
      const charts = resolved.map(b => calculateHumanDesign(b.birthDate, b.birthHour, b.utcOffset));
      const names = members.map((m, i) => (typeof m === 'string' ? m : m.name) || resolved[i]._savedName || `Person ${i + 1}`);
      const r = analyzePenta(charts, names);
      return json({
        members: names.map((n, i) => ({ name: n, type: charts[i].type.name, profile: charts[i].profile.numbers })),
        groupType: r.groupType,
        isPenta: r.isPenta,
        filledRoles: r.filledRoles.map(x => ({ role: x.role, by: x.contributors, meaning: x.description })),
        missingRoles: r.missingRoles.map(x => ({ role: x.role, suggestion: x.suggestion })),
        electromagnetics: r.electromagnetics.slice(0, 10).map(e => ({ channel: e.channel, between: [e.personA, e.personB], theme: e.theme })),
        recommendations: r.recommendations.map(x => x.insight)
      });
    }
  },
  {
    name: 'get_descriptions',
    description: 'Interpretive reference text for Human Design elements — use for follow-up depth questions ("what does Gate 34 mean?", "what does my 34.5 line mean?") without recomputing a chart. Each requested gate returns its meaning through THREE traditions: Human Design (keynote, description, all 6 lines), the I Ching hexagram it is built on (judgment/image + 6 line meanings), and the Gene Keys (Shadow→Gift→Siddhi). Free (not metered).',
    inputSchema: {
      type: 'object',
      properties: {
        gates: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 64 }, description: 'Gate numbers' },
        channels: { type: 'array', items: { type: 'string' }, description: 'Channel keys like "20-34"' },
        centers: { type: 'array', items: { type: 'string', enum: Object.keys(CENTERS) }, description: 'Center keys' }
      }
    },
    async handler({ gates = [], channels = [], centers = [] }) {
      const out = {};
      if (gates.length) {
        out.gates = Object.fromEntries(gates.filter(g => GATE_DESCRIPTIONS[g]).map(g => [g, {
          name: GATES[g]?.name,
          keynote: GATE_DESCRIPTIONS[g].keynote,
          description: GATE_DESCRIPTIONS[g].description,
          harmonicGate: GATE_DESCRIPTIONS[g].harmonic,
          center: GATES[g]?.center,
          lines: LINE_DESCRIPTIONS[g] || undefined,
          iching: HEXAGRAM_DESCRIPTIONS[g] || undefined,
          geneKey: GENE_KEY_DESCRIPTIONS[g] || undefined
        }]));
      }
      if (channels.length) {
        out.channels = Object.fromEntries(channels
          .map(k => [k, CHANNEL_DESCRIPTIONS[k] || CHANNEL_DESCRIPTIONS[k.split('-').reverse().join('-')]])
          .filter(([, v]) => v)
          .map(([k, v]) => [k, { description: v.description, whenDefined: v.whenDefined }]));
      }
      if (centers.length) {
        out.centers = Object.fromEntries(centers.filter(c => CENTERS[c]).map(c => [c, {
          name: CENTERS[c].name,
          theme: CENTERS[c].theme,
          defined: CENTERS[c].definedMeaning,
          undefined: CENTERS[c].undefinedMeaning,
          notSelfQuestion: CENTERS[c].notSelfQuestion
        }]));
      }
      if (!Object.keys(out).length) throw new Error('pass at least one of gates, channels, centers');
      return json(out);
    }
  }
];

// ---------------------------------------------------------------------------
// Personal tools (only on the OAuth-protected /mcp/my endpoint)
// ---------------------------------------------------------------------------

function wirePerson(r) {
  return {
    id: r.id,
    name: r.name,
    birthDate: r.birth_date,
    birthTime: r.time_unknown ? 'unknown' : r.birth_time,
    place: r.loc_name || null
  };
}

const PERSONAL_TOOLS = [
  {
    name: 'list_people',
    scope: 'charts:read',
    description: 'List the user\'s saved people that have AI access enabled, with their id (use the id to delete a specific one). Use their names directly as the birth input of compute_chart / compare_charts / get_transits / analyze_team. Free (not metered).',
    inputSchema: { type: 'object', properties: {} },
    async handler(_args, ctx) {
      const { results } = await ctx.env.DB.prepare(
        'SELECT * FROM people WHERE user_id = ?1 AND deleted_at IS NULL AND ai_access = 1 ORDER BY name'
      ).bind(ctx.userId).all();
      const { hidden } = await ctx.env.DB.prepare(
        'SELECT COUNT(*) AS hidden FROM people WHERE user_id = ?1 AND deleted_at IS NULL AND ai_access = 0'
      ).bind(ctx.userId).first();
      return json({
        people: results.map(wirePerson),
        ...(hidden ? { note: `${hidden} more saved ${hidden === 1 ? 'person has' : 'people have'} AI access turned off — they can be enabled in the app.` } : {})
      });
    }
  },
  {
    name: 'save_person',
    scope: 'charts:write',
    description: 'Save a person to the user\'s library so future conversations can reference them by name. Saving through the AI grants AI access automatically (the user is granting it by asking). Confirm with the user before saving someone new.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name to save them under, e.g. "Mom"' },
        birth: BIRTH_INPUT_SCHEMA.oneOf[0]
      },
      required: ['name', 'birth']
    },
    async handler({ name, birth }, ctx) {
      if (!name || name.length > 200) throw new Error('name required (max 200 chars)');
      const b = await resolveBirth(birth, 'birth', ctx);
      const now = new Date().toISOString();
      const loc = {
        lat: b.placeNote?.lat ?? birth.lat ?? null,
        lon: b.placeNote?.lon ?? birth.lon ?? null,
        tz: b.utcOffset,
        iana: b.placeNote?.ianaTimezone ?? null,
        place: b.placeNote?.resolved ?? null
      };
      const birthTime = b.timeUnknown ? '12:00' : b.birthTime;

      // Upsert by (name, birthDate): re-saving the same person (e.g. to
      // correct a geocode) updates in place instead of creating a duplicate.
      const existing = await ctx.env.DB.prepare(
        'SELECT id FROM people WHERE user_id = ?1 AND name = ?2 COLLATE NOCASE AND birth_date = ?3 AND deleted_at IS NULL'
      ).bind(ctx.userId, name, b.birthDate).first();

      let updated = false;
      if (existing) {
        await ctx.env.DB.prepare(`
          UPDATE people SET birth_time = ?1, time_unknown = ?2, loc_lat = ?3, loc_lon = ?4,
            loc_timezone = ?5, loc_iana = ?6, loc_name = ?7, ai_access = 1, updated_at = ?8
          WHERE user_id = ?9 AND id = ?10
        `).bind(birthTime, b.timeUnknown ? 1 : 0, loc.lat, loc.lon, loc.tz, loc.iana, loc.place, now, ctx.userId, existing.id).run();
        updated = true;
      } else {
        await ctx.env.DB.prepare(`
          INSERT INTO people (user_id, id, name, birth_date, birth_time, time_unknown,
                              loc_lat, loc_lon, loc_timezone, loc_iana, loc_name,
                              ai_access, created_at, updated_at, deleted_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, ?12, NULL)
        `).bind(ctx.userId, crypto.randomUUID(), name, b.birthDate, birthTime, b.timeUnknown ? 1 : 0,
          loc.lat, loc.lon, loc.tz, loc.iana, loc.place, now).run();
      }
      return json({ saved: name, ...birthMeta(b), note: `AI access enabled; syncs to the user's devices.${updated ? ' (Updated the existing entry — same name and birth date.)' : ''}` });
    }
  },
  {
    name: 'delete_person',
    scope: 'charts:write',
    description: 'Remove a saved person. Pass the id (from list_people) to delete an exact entry — preferred when names repeat. Or pass a name; if it is unique it deletes, otherwise the matching entries are returned so you can re-call with the right id. Always confirm with the user first; this syncs to all their devices.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Exact person id from list_people (preferred)' },
        name: { type: 'string', description: 'Name, used only if id is not given' }
      }
    },
    async handler({ id, name }, ctx) {
      const now = new Date().toISOString();

      if (id) {
        // Hidden people (AI access off) are invisible here too.
        const row = await ctx.env.DB.prepare(
          'SELECT name FROM people WHERE user_id = ?1 AND id = ?2 AND deleted_at IS NULL AND ai_access = 1'
        ).bind(ctx.userId, id).first();
        if (!row) throw new Error(`No saved person with id "${id}". Use list_people to get current ids.`);
        await tombstone(ctx.env.DB, ctx.userId, id, now);
        return json({ deleted: row.name, id });
      }

      if (!name) throw new Error('Pass an id (preferred) or a name.');
      const { results } = await ctx.env.DB.prepare(
        'SELECT id, name, birth_date, loc_name FROM people WHERE user_id = ?1 AND name = ?2 COLLATE NOCASE AND deleted_at IS NULL AND ai_access = 1'
      ).bind(ctx.userId, name).all();

      if (!results.length) throw new Error(`No saved person named "${name}".`);
      if (results.length > 1) {
        return json({
          ambiguous: `${results.length} saved people are named "${name}". Re-call delete_person with the id of the one to remove.`,
          candidates: results.map(r => ({ id: r.id, name: r.name, birthDate: r.birth_date, place: r.loc_name || null }))
        });
      }
      await tombstone(ctx.env.DB, ctx.userId, results[0].id, now);
      return json({ deleted: results[0].name, id: results[0].id });
    }
  }
];

// ---------------------------------------------------------------------------
// Metering — chart-units, free tier 50/month (docs/PLATFORM.md §pricing)
// ---------------------------------------------------------------------------

const METERED = new Set(['compute_chart', 'compare_charts', 'get_transits', 'analyze_team']);
// Counting from day one (the usage data shapes future pricing), but the
// ceiling is deliberately high while we grow — gating comes with payments.
const FREE_UNITS_PER_MONTH = 1000;

async function meterOrThrow(ctx) {
  const month = new Date().toISOString().slice(0, 7);
  const ent = await ctx.env.DB.prepare('SELECT plan FROM entitlements WHERE user_id = ?1')
    .bind(ctx.userId).first();
  if (ent?.plan === 'supporter') return; // unlimited (fair use)

  const row = await ctx.env.DB.prepare('SELECT units FROM usage WHERE user_id = ?1 AND month = ?2')
    .bind(ctx.userId, month).first();
  if ((row?.units || 0) >= FREE_UNITS_PER_MONTH) {
    throw new Error(`Monthly limit reached (${FREE_UNITS_PER_MONTH} chart computations). It resets at the start of next month. list_people and get_descriptions remain available.`);
  }
  await ctx.env.DB.prepare(`
    INSERT INTO usage (user_id, month, units) VALUES (?1, ?2, 1)
    ON CONFLICT (user_id, month) DO UPDATE SET units = units + 1
  `).bind(ctx.userId, month).run();
}

// ---------------------------------------------------------------------------
// Server factory + request handler (stateless)
// ---------------------------------------------------------------------------

function buildServer(ctx) {
  const personal = !!ctx?.userId;
  const allTools = personal ? [...TOOLS, ...PERSONAL_TOOLS] : TOOLS;
  const tools = allTools.filter(t => !t.scope || hasScope(ctx, t.scope));

  const server = new Server(
    { name: personal ? 'open-human-design-personal' : 'open-human-design', version: '0.4.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema, _meta }) => ({
      name, description, inputSchema, ...(_meta ? { _meta } : {})
    }))
  }));

  // MCP Apps: advertise + serve the static bodygraph panel resource so the
  // host can prefetch it. The per-chart URL is delivered per-call via the
  // tool result's structuredContent (see compute_chart), not baked in here.
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [{
      uri: CHART_WIDGET_URI,
      name: 'Bodygraph chart',
      mimeType: APP_MIME,
      _meta: { ui: { csp: { resourceDomains: ['https://openhumandesign.com'] } } }
    }]
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri !== CHART_WIDGET_URI) {
      throw new Error(`Unknown resource: ${request.params.uri}`);
    }
    return {
      contents: [{
        uri: CHART_WIDGET_URI,
        mimeType: APP_MIME,
        text: CHART_WIDGET_HTML,
        // resourceDomains → sandbox CSP img-src, so the external chart loads.
        _meta: { ui: { csp: { resourceDomains: ['https://openhumandesign.com'] } } }
      }]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find(t => t.name === request.params.name);
    if (!tool) {
      const held = allTools.find(t => t.name === request.params.name);
      if (held) return errText(scopeError(`${held.name} calls`, held.scope).message);
      return errText(`Unknown tool: ${request.params.name}`);
    }
    try {
      if (personal && METERED.has(tool.name)) await meterOrThrow(ctx);
      return await tool.handler(request.params.arguments || {}, ctx);
    } catch (err) {
      return errText(err.message || String(err));
    }
  });

  return server;
}

/**
 * @param {Request} request
 * @param {object} [env] - Worker env (DB needed for personal tools)
 * @param {object} [props] - OAuth props ({ userId, email, scope }) on /mcp/my
 */
export async function handleMcpRequest(request, env = null, props = null) {
  const ctx = props?.userId
    ? { userId: props.userId, email: props.email, scopes: Array.isArray(props.scope) ? props.scope : ['charts:read'], env }
    : { env };
  const server = buildServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — fresh instance per request
    enableJsonResponse: true
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
