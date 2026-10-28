/**
 * MCP server tests — drive the actual request handler with web-standard
 * Requests (no wrangler needed; the handler is pure web-platform code).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMcpRequest } from '../worker/mcp.js';

let id = 0;
async function rpc(method, params = {}) {
  const res = await handleMcpRequest(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })
  }));
  assert.equal(res.status, 200, `${method} → HTTP ${res.status}`);
  const body = await res.json();
  assert.ok(!body.error, `${method} → ${JSON.stringify(body.error)}`);
  return body.result;
}

async function callTool(name, args) {
  const result = await rpc('tools/call', { name, arguments: args });
  const text = result.content?.[0]?.text || '';
  assert.ok(!result.isError, `${name} errored: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

test('initialize handshake', async () => {
  const result = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' }
  });
  assert.equal(result.serverInfo.name, 'open-human-design');
});

test('tools/list exposes the five compute tools without auth props', async () => {
  const { tools } = await rpc('tools/list');
  const names = tools.map(t => t.name).sort();
  assert.deepEqual(names, ['analyze_team', 'compare_charts', 'compute_chart', 'get_descriptions', 'get_transits']);
  for (const t of tools) {
    assert.ok(t.description.length > 40, `${t.name} needs a real description`);
    assert.ok(t.inputSchema.type === 'object');
  }
});

// --- Personal toolset (with OAuth props + stub D1) -------------------------

function stubDb(rows = []) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            all: async () => ({ results: rows }),
            first: async () => (sql.includes('COUNT') ? { hidden: 0, cnt: rows.length, units: 0 } : rows[0] || null),
            run: async () => ({})
          };
        }
      };
    }
  };
}

const ALL_SCOPES = ['charts:read', 'charts:write'];

async function rpcPersonal(method, params, db, scope = ALL_SCOPES) {
  const res = await handleMcpRequest(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })
  }), { DB: db || stubDb() }, { userId: 'user-1', email: 't@example.com', ...(scope ? { scope } : {}) });
  const body = await res.json();
  assert.ok(!body.error, JSON.stringify(body.error));
  return body.result;
}

test('personal props expose all eight tools', async () => {
  const { tools } = await rpcPersonal('tools/list');
  const names = tools.map(t => t.name).sort();
  assert.deepEqual(names, ['analyze_team', 'compare_charts', 'compute_chart', 'delete_person',
    'get_descriptions', 'get_transits', 'list_people', 'save_person']);
});

test('saved-name birth input resolves through ai_access-gated lookup', async () => {
  const db = stubDb([{
    id: 'p1', user_id: 'user-1', name: 'Mom', birth_date: '1962-04-11',
    birth_time: '08:15', time_unknown: 0, loc_lat: 39.7, loc_lon: -105,
    loc_timezone: -7, loc_iana: 'America/Denver', loc_name: 'Denver',
    ai_access: 1, deleted_at: null
  }]);
  const result = await rpcPersonal('tools/call', { name: 'compute_chart', arguments: { birth: 'Mom' } }, db);
  const out = JSON.parse(result.content[0].text);
  assert.equal(out.person, 'Mom');
  assert.ok(out.humanDesign.type);
});

test('ai_access off → same refusal as a missing name (no probing hidden people)', async () => {
  const db = stubDb([{
    id: 'p1', user_id: 'user-1', name: 'Mom', birth_date: '1962-04-11',
    birth_time: '08:15', time_unknown: 0, loc_timezone: -7,
    ai_access: 0, deleted_at: null
  }]);
  const hidden = await rpcPersonal('tools/call', { name: 'compute_chart', arguments: { birth: 'Mom' } }, db);
  const missing = await rpcPersonal('tools/call', { name: 'compute_chart', arguments: { birth: 'Mom' } }, stubDb([]));
  assert.ok(hidden.isError);
  assert.match(hidden.content[0].text, /No saved person named "Mom" that your AI can see/);
  assert.equal(hidden.content[0].text, missing.content[0].text);
});

// --- OAuth scopes (audit M5: a charts:read token deleted people) ----------

test('charts:read token lists no write tools and cannot delete or save', async () => {
  const mom = [{ id: 'p1', name: 'Mom', birth_date: '1962-04-11', loc_name: null, ai_access: 1, deleted_at: null }];
  const { tools } = await rpcPersonal('tools/list', {}, null, ['charts:read']);
  const names = tools.map(t => t.name);
  assert.ok(names.includes('list_people'));
  assert.ok(!names.includes('delete_person') && !names.includes('save_person'), names.join(','));
  for (const [name, args] of [['delete_person', { id: 'p1' }], ['save_person', { name: 'X', birth: { birthDate: '1990-01-01', utcOffset: 0 } }]]) {
    const r = await rpcPersonal('tools/call', { name, arguments: args }, stubDb(mom), ['charts:read']);
    assert.ok(r.isError, `${name} ran with a read-only token`);
    assert.match(r.content[0].text, /charts:write/);
  }
});

test('token without charts:read cannot list or resolve saved people', async () => {
  const mom = [{ id: 'p1', name: 'Mom', birth_date: '1962-04-11', birth_time: '08:15', loc_timezone: -7, ai_access: 1, deleted_at: null }];
  const { tools } = await rpcPersonal('tools/list', {}, null, []);
  assert.ok(!tools.some(t => t.name === 'list_people'));
  const r = await rpcPersonal('tools/call', { name: 'compute_chart', arguments: { birth: 'Mom' } }, stubDb(mom), []);
  assert.ok(r.isError);
  assert.match(r.content[0].text, /charts:read/);
});

test('tokens minted before scopes were enforced (no props.scope) are read-only', async () => {
  const { tools } = await rpcPersonal('tools/list', {}, null, null);
  const names = tools.map(t => t.name);
  assert.ok(names.includes('list_people') && !names.includes('delete_person'), names.join(','));
});

test('saved names rejected without auth props', async () => {
  const result = await rpc('tools/call', { name: 'compute_chart', arguments: { birth: 'Mom' } });
  assert.ok(result.isError);
  assert.match(result.content[0].text, /personal connector|sign in/i);
});

test('compute_chart default renders the inline panel (structuredContent + _meta, zero-token)', async () => {
  const result = await rpc('tools/call', {
    name: 'compute_chart',
    arguments: { birth: { birthDate: '1990-06-15', birthTime: '14:30', utcOffset: -6 } }
  });
  assert.equal(result.content[0].type, 'text'); // JSON data still first
  // Panel data delivered out-of-band via structuredContent (not model context).
  const sc = result.structuredContent;
  assert.ok(sc?.svg?.startsWith('<svg'), 'inline SVG markup in structuredContent');
  assert.ok(sc.svg.includes('<path'), 'svg is the real bodygraph');
  assert.ok(!sc.svg.includes('data-gate'), 'svg is trimmed (interactive hooks stripped)');
  assert.ok(sc.svgUrl?.includes('/chart.svg?'), 'svgUrl fallback present');
  assert.equal(result._meta?.ui?.resourceUri, 'ui://open-human-design/chart');
  // No heavy SVG markup dumped into MODEL context — that's the zero-token win.
  assert.ok(!result.content.some(c => c.text?.includes('<svg')), 'no inline SVG in model content');
  const link = result.content.find(c => c.text?.includes('openhumandesign.com/?'));
  assert.ok(link, 'interactive link fallback present');
});

test('compute_chart image:"svg" embeds the artifact for non-panel clients', async () => {
  const result = await rpc('tools/call', {
    name: 'compute_chart',
    arguments: { birth: { birthDate: '1990-06-15', birthTime: '14:30', utcOffset: -6 }, image: 'svg' }
  });
  const svgBlock = result.content.find(c => c.type === 'text' && c.text.includes('<svg') && /artifact/i.test(c.text));
  assert.ok(svgBlock, 'SVG-for-artifact block present');
  assert.ok(svgBlock.text.includes('data-gate'));
  assert.ok(result.structuredContent?.svgUrl, 'panel data still attached alongside the fallback');
});

test('compute_chart image:"none" omits the fallback image but keeps the panel', async () => {
  const result = await rpc('tools/call', {
    name: 'compute_chart',
    arguments: { birth: { birthDate: '1990-06-15', birthTime: '14:30', utcOffset: -6 }, image: 'none' }
  });
  assert.equal(result.content.length, 1); // JSON only
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent?.svgUrl, 'panel still renders'); // tool-scoped
});

test('MCP Apps: compute_chart tool definition links the ui:// panel resource', async () => {
  const { tools } = await rpc('tools/list');
  const cc = tools.find(t => t.name === 'compute_chart');
  assert.equal(cc._meta?.ui?.resourceUri, 'ui://open-human-design/chart');
  assert.equal(cc._meta?.['ui/resourceUri'], 'ui://open-human-design/chart'); // legacy alias too
});

test('MCP Apps: resources/list + resources/read expose the panel with the resourceDomains CSP', async () => {
  const { resources } = await rpc('resources/list');
  const r = resources.find(x => x.uri === 'ui://open-human-design/chart');
  assert.ok(r, 'widget resource listed');
  assert.equal(r.mimeType, 'text/html;profile=mcp-app');

  const read = await rpc('resources/read', { uri: 'ui://open-human-design/chart' });
  const c0 = read.contents[0];
  assert.equal(c0.mimeType, 'text/html;profile=mcp-app');
  assert.deepEqual(c0._meta?.ui?.csp?.resourceDomains, ['https://openhumandesign.com']);
  assert.ok(c0.text.startsWith('<!doctype html'), 'serves the panel HTML');
  assert.ok(!c0.text.includes('1990'), 'panel HTML is static (no baked-in birth data)');
});

test('resources/read rejects an unknown uri', async () => {
  await assert.rejects(() => rpc('resources/read', { uri: 'ui://open-human-design/nope' }));
});

test('delete_person disambiguates duplicate names; deletes by id', async () => {
  const dup = [
    { id: 'a', name: 'Kurt Cobain', birth_date: '1967-02-20', loc_name: 'Aberdeen, Scotland' },
    { id: 'b', name: 'Kurt Cobain', birth_date: '1967-02-20', loc_name: 'Aberdeen, Washington' }
  ];
  const ambiguous = await rpcPersonal('tools/call', { name: 'delete_person', arguments: { name: 'Kurt Cobain' } }, stubDb(dup));
  const out = JSON.parse(ambiguous.content[0].text);
  assert.ok(out.ambiguous, 'returns an ambiguity note');
  assert.equal(out.candidates.length, 2);
  assert.ok(out.candidates.every(c => c.id && c.place));

  const byId = await rpcPersonal('tools/call', { name: 'delete_person', arguments: { id: 'a' } }, stubDb([dup[0]]));
  assert.equal(JSON.parse(byId.content[0].text).deleted, 'Kurt Cobain');
});

test('list_people exposes ids for precise deletion', async () => {
  const db = stubDb([{ id: 'p1', name: 'Mom', birth_date: '1962-04-11', time_unknown: 0, birth_time: '08:15', loc_name: 'Denver', ai_access: 1, deleted_at: null }]);
  const out = JSON.parse((await rpcPersonal('tools/call', { name: 'list_people', arguments: {} }, db)).content[0].text);
  assert.equal(out.people[0].id, 'p1');
});

test('compute_chart with explicit offset', async () => {
  const out = await callTool('compute_chart', {
    birth: { birthDate: '1990-06-15', birthTime: '14:30', utcOffset: -6 }
  });
  assert.equal(out.humanDesign.type, 'Manifestor');
  assert.equal(out.humanDesign.profile.startsWith('2/5'), true);
  assert.ok(out.humanDesign.channels.length >= 1);
  assert.ok(out.humanDesign.channels[0].keynote.length > 10, 'keynotes inlined (one-shot)');
  assert.ok(out.humanDesign.variable.notation);
});

test('compute_chart geocodes place and resolves historical offset', async () => {
  const out = await callTool('compute_chart', {
    birth: { birthDate: '1990-06-15', birthTime: '14:30', place: 'Boulder, Colorado' }
  });
  assert.equal(out.place.utcOffsetAtBirth, -6); // MDT June 1990
  assert.equal(out.place.ianaTimezone, 'America/Denver');
  assert.equal(out.humanDesign.type, 'Manifestor');
});

test('compute_chart multi-system: gene keys + astrology', async () => {
  const out = await callTool('compute_chart', {
    birth: { birthDate: '1990-06-15', birthTime: '14:30', utcOffset: -6, lat: 40.0, lon: -105.3 },
    systems: ['human_design', 'gene_keys', 'astrology'],
    detail: 'full'
  });
  assert.ok(out.geneKeys.activationSequence.lifeWork.gift);
  assert.ok(out.astrology.sun);
  assert.ok(out.humanDesign.substructure.personality.sun.tone >= 1);
});

test('compute_chart without birth time flags unknown', async () => {
  const out = await callTool('compute_chart', {
    birth: { birthDate: '1990-06-15', utcOffset: -6 }
  });
  assert.match(out.input.birthTime, /unknown/);
});

test('compare_charts returns typed connections', async () => {
  const out = await callTool('compare_charts', {
    personA: { birthDate: '1990-06-15', birthTime: '14:30', utcOffset: -6 },
    personB: { birthDate: '1985-03-20', birthTime: '08:00', utcOffset: 1 }
  });
  assert.ok(out.compositeType);
  assert.ok(Array.isArray(out.electromagnetic));
  assert.ok(out.summary.length > 20);
});

test('get_transits', async () => {
  const out = await callTool('get_transits', {
    birth: { birthDate: '1990-06-15', birthTime: '14:30', utcOffset: -6 },
    date: '2026-06-04'
  });
  assert.match(out.transitSun, /^Gate \d+\.\d/);
  assert.ok(Array.isArray(out.channelCompletions));
});

test('analyze_team', async () => {
  const out = await callTool('analyze_team', {
    members: [
      { name: 'A', birthDate: '1990-06-15', birthTime: '14:30', utcOffset: -6 },
      { name: 'B', birthDate: '1985-03-20', birthTime: '08:00', utcOffset: 1 },
      { name: 'C', birthDate: '1992-11-02', birthTime: '22:00', utcOffset: -7 }
    ]
  });
  assert.equal(out.members.length, 3);
  assert.ok(out.groupType);
  assert.ok(out.filledRoles.length + out.missingRoles.length > 0);
});

test('get_descriptions', async () => {
  const out = await callTool('get_descriptions', {
    gates: [34, 20],
    channels: ['20-34'],
    centers: ['sacral']
  });
  assert.ok(out.gates[34].keynote);
  assert.ok(out.channels['20-34'].whenDefined);
  assert.ok(out.centers.sacral.notSelfQuestion);
});

test('helpful errors: bad date, missing tz, unknown place', async () => {
  const r1 = await rpc('tools/call', { name: 'compute_chart', arguments: { birth: { birthDate: 'junk' } } });
  assert.ok(r1.isError && /YYYY-MM-DD/.test(r1.content[0].text));
  const r2 = await rpc('tools/call', { name: 'compute_chart', arguments: { birth: { birthDate: '1990-06-15' } } });
  assert.ok(r2.isError && /place.*or.*utcOffset/i.test(r2.content[0].text));
  const r3 = await rpc('tools/call', { name: 'compute_chart', arguments: { birth: { birthDate: '1990-06-15', place: 'Xyzzyqwobble' } } });
  assert.ok(r3.isError && /no match/i.test(r3.content[0].text));
});
