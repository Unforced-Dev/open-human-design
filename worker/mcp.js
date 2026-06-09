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
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

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
  CHANNEL_DESCRIPTIONS,
  CENTERS,
  GATES,
  renderBodygraphSVG
} from 'natalengine';

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

/** Resolve "Saved Name" → stored birth data (ai_access-gated, SQL-enforced). */
async function lookupPerson(ctx, name) {
  if (!ctx?.userId || !ctx?.env?.DB) {
    throw new Error(`"${name}": saved names only work on the personal connector (sign in at openhumandesign.com and connect /mcp/my)`);
  }
  const { results } = await ctx.env.DB.prepare(
    `SELECT * FROM people WHERE user_id = ?1 AND deleted_at IS NULL AND name LIKE ?2 COLLATE NOCASE`
  ).bind(ctx.userId, name).all();

  if (!results.length) {
    // Distinguish "doesn't exist" from "exists but AI access is off"
    throw new Error(`No saved person named "${name}". Use list_people to see who is available, or save_person to add them.`);
  }
  const allowed = results.filter(r => r.ai_access);
  if (!allowed.length) {
    throw new Error(`"${name}" is saved, but AI access is off for them. Enable it in the app (or re-save via save_person) to let your AI read their chart.`);
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
    base.substructure = {
      personality: Object.fromEntries(Object.entries(chart.gates.personality)
        .filter(([, g]) => g)
        .map(([p, g]) => [p, { gate: g.gate, line: g.line, color: g.color, tone: g.tone, base: g.base }])),
      design: Object.fromEntries(Object.entries(chart.gates.design)
        .filter(([, g]) => g)
        .map(([p, g]) => [p, { gate: g.gate, line: g.line, color: g.color, tone: g.tone, base: g.base }]))
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

function chartLinkUrl(b) {
  const p = new URLSearchParams();
  p.set('d', b.birthDate);
  if (!b.timeUnknown) p.set('t', b.birthTime);
  p.set('tz', String(b.utcOffset));
  if (b._savedName) p.set('n', b._savedName);
  return `${PUBLIC_ORIGIN}/chart.svg?${p}`;
}

/**
 * Build the chart-image content for a tool result.
 * - "png": rasterized bodygraph (renders inline in Claude/ChatGPT — their
 *   image blocks accept raster only). Default.
 * - "svg": the scalable vector as an embedded resource (the requested
 *   format; clients that render SVG show it crisp, others keep the data).
 * - "both": both. A link to the public SVG is always appended.
 */
async function chartImageContent(chart, b, mode) {
  if (mode === 'none') return [];
  const svg = renderBodygraphSVG(chart, { theme: 'light', planetColumns: true, fontFamily: 'Inter' });
  const link = chartLinkUrl(b);
  const items = [];

  if (mode === 'png' || mode === 'both') {
    try {
      // Rasterizer is Worker-only (static .wasm/.ttf imports) — load it
      // lazily so the MCP module still imports under plain Node tests.
      const { svgToPng, toBase64 } = await import('./render.js');
      const png = await svgToPng(svg, 1000);
      items.push({ type: 'image', data: toBase64(png), mimeType: 'image/png' });
    } catch (e) {
      items.push({ type: 'text', text: `(inline image unavailable: ${e.message})` });
    }
  }
  if (mode === 'svg' || mode === 'both') {
    items.push({ type: 'resource', resource: { uri: link, mimeType: 'image/svg+xml', text: svg } });
  }
  items.push({ type: 'text', text: `Bodygraph (scalable SVG): ${link}` });
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
    description: 'Compute a chart from birth data and show the bodygraph image. Human Design by default; add "gene_keys" and/or "astrology" to systems for those views of the same birth moment. Returns the complete picture including interpretive keynotes plus the bodygraph image. The image renders inline as a raster (image:"png", default); set image:"svg" to embed the scalable vector instead, or "both". A link to the SVG is always included.',
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
        image: { type: 'string', enum: ['none', 'png', 'svg', 'both'], description: 'Bodygraph image to include. "png" (default) renders inline; "svg" embeds the scalable vector; "both" includes each; "none" omits it. A link to the SVG is always added unless "none".' }
      },
      required: ['birth']
    },
    async handler({ birth, systems = ['human_design'], detail = 'summary', image = 'png' }, ctx) {
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
      const img = await chartImageContent(hd, b, image);
      return { content: [...base.content, ...img] };
    }
  },
  {
    name: 'compare_charts',
    description: 'Human Design connection analysis between two people: electromagnetic (attraction — each has half a channel), companionship (both whole), compromise and dominance channels, composite type, and a relationship summary.',
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
      const connList = (items) => items.map(c => ({ channel: `${c.channel} (${c.gates.join('-')})`, meaning: c.description }));
      return json({
        personA: { ...birthMeta(a), type: chartA.type.name, profile: chartA.profile.numbers, authority: chartA.authority.name },
        personB: { ...birthMeta(b), type: chartB.type.name, profile: chartB.profile.numbers, authority: chartB.authority.name },
        compositeType: cc.compositeType,
        typeDynamic: cmp.typeInteraction?.dynamic,
        electromagnetic: connList(cc.connections.electromagnetic),
        companionship: connList(cc.connections.companionship),
        compromise: connList(cc.connections.compromise),
        dominance: connList(cc.connections.dominance),
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
    description: 'Interpretive reference text for Human Design elements — use for follow-up depth questions ("what does Gate 34 mean?") without recomputing a chart. Free (not metered).',
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
          center: GATES[g]?.center
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
    name: r.name,
    birthDate: r.birth_date,
    birthTime: r.time_unknown ? 'unknown' : r.birth_time,
    place: r.loc_name || null
  };
}

const PERSONAL_TOOLS = [
  {
    name: 'list_people',
    description: 'List the user\'s saved people that have AI access enabled. Use their names directly as the birth input of compute_chart / compare_charts / get_transits / analyze_team. Free (not metered).',
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
      const id = crypto.randomUUID();
      await ctx.env.DB.prepare(`
        INSERT INTO people (user_id, id, name, birth_date, birth_time, time_unknown,
                            loc_lat, loc_lon, loc_timezone, loc_iana, loc_name,
                            ai_access, created_at, updated_at, deleted_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, ?12, NULL)
      `).bind(
        ctx.userId, id, name,
        b.birthDate, b.timeUnknown ? '12:00' : b.birthTime, b.timeUnknown ? 1 : 0,
        b.placeNote?.lat ?? birth.lat ?? null,
        b.placeNote?.lon ?? birth.lon ?? null,
        b.utcOffset,
        b.placeNote?.ianaTimezone ?? null,
        b.placeNote?.resolved ?? null,
        now
      ).run();
      return json({ saved: name, ...birthMeta(b), note: 'AI access enabled. They will sync to the user\'s devices.' });
    }
  },
  {
    name: 'delete_person',
    description: 'Remove a saved person from the user\'s library. Always confirm with the user first — this syncs to all their devices.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    },
    async handler({ name }, ctx) {
      const person = await lookupPerson(ctx, name);
      const now = new Date().toISOString();
      await ctx.env.DB.prepare(
        'UPDATE people SET deleted_at = ?1, updated_at = ?1 WHERE user_id = ?2 AND name = ?3 COLLATE NOCASE AND deleted_at IS NULL'
      ).bind(now, ctx.userId, person._savedName).run();
      return json({ deleted: person._savedName });
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
  const tools = personal ? [...TOOLS, ...PERSONAL_TOOLS] : TOOLS;

  const server = new Server(
    { name: personal ? 'open-human-design-personal' : 'open-human-design', version: '0.4.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find(t => t.name === request.params.name);
    if (!tool) return errText(`Unknown tool: ${request.params.name}`);
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
 * @param {object} [props] - OAuth props ({ userId, email }) on /mcp/my
 */
export async function handleMcpRequest(request, env = null, props = null) {
  const ctx = props?.userId ? { userId: props.userId, email: props.email, env } : { env };
  const server = buildServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — fresh instance per request
    enableJsonResponse: true
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
