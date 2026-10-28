#!/usr/bin/env node
/**
 * "Connect your AI" end to end, in the order a newcomer follows: add the
 * connector in the AI app first, then sign in when the browser asks.
 *
 * The official MCP SDK client does the OAuth side (discovery, dynamic
 * registration, PKCE S256, token exchange); a fresh, signed-out Chrome plays
 * the person (sign-in page → magic link from the local send_email binding →
 * interstitial → consent → Connect). Then the SDK client calls tools.
 *
 *   npm run build && npx wrangler d1 migrations apply open-human-design --local
 *   npx wrangler dev --local --port 8796 --local-upstream 127.0.0.1:8796 > /tmp/wr.log
 *   CHROME_PATH=/usr/bin/chromium node tests/mcp-connect-e2e.mjs http://127.0.0.1:8796 /tmp/wr.log
 *
 * Local only (it signs up a test address and writes to the local D1).
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';

const BASE = process.argv[2] || 'http://127.0.0.1:8796';
const WLOG = process.argv[3];
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(BASE + '/')) throw new Error('local only');
if (!WLOG) throw new Error('usage: mcp-connect-e2e.mjs BASE WRANGLER_LOG');
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';
const REDIRECT = 'http://127.0.0.1:9/oauth/callback'; // never reached: the browser route captures it
const EMAIL = `connect-${Date.now()}@example.test`;

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`✔ ${name}`);
  else { failures++; console.error(`✖ ${name}${detail ? `\n  ${detail}` : ''}`); }
};

// --- the AI app's side: an in-memory OAuth client provider ------------------
const store = {};
let authorizationUrl = null;
const provider = {
  get redirectUrl() { return REDIRECT; },
  get clientMetadata() {
    return { client_name: 'Connect E2E', redirect_uris: [REDIRECT], grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'], token_endpoint_auth_method: 'none', scope: 'charts:read charts:write' };
  },
  clientInformation: () => store.client,
  saveClientInformation: (c) => { store.client = c; },
  tokens: () => store.tokens,
  saveTokens: (t) => { store.tokens = t; },
  redirectToAuthorization: (url) => { authorizationUrl = url; },
  saveCodeVerifier: (v) => { store.verifier = v; },
  codeVerifier: () => store.verifier
};

const mcpUrl = new URL(BASE + '/mcp');
let transport = new StreamableHTTPClientTransport(mcpUrl, { authProvider: provider });
let client = new Client({ name: 'connect-e2e', version: '0' });
try {
  await client.connect(transport);
  check('first connect asks for authorization', false, 'connected without auth');
} catch (err) {
  check('first connect asks for authorization (401 → OAuth)', err instanceof UnauthorizedError && !!authorizationUrl, String(err));
}
check('SDK registered a client and sent PKCE S256', !!store.client?.client_id &&
  authorizationUrl?.searchParams.get('code_challenge_method') === 'S256' && !!authorizationUrl?.searchParams.get('code_challenge'),
  authorizationUrl?.toString());

// --- the person's side: a signed-out browser --------------------------------
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => { if (/Content Security Policy/i.test(m.text())) pageErrors.push(m.text()); });
let code = null;
await ctx.route('http://127.0.0.1:9/**', (route) => {
  code = new URL(route.request().url()).searchParams.get('code');
  route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>back in the AI app</h1>' });
});

await page.goto(authorizationUrl.toString());
check('signed out: /authorize shows the sign-in page', /Sign in to connect your AI/.test(await page.textContent('h1')));

const logStart = readFileSync(WLOG, 'utf8').length;
await page.fill('#email', EMAIL);
await page.click('button[type=submit]');
await page.waitForSelector('#ok', { state: 'visible', timeout: 5000 }).catch(() => {});
check('sign-in page confirms the email was sent', await page.isVisible('#ok'), await page.textContent('#err').catch(() => ''));

let mailPath = null;
for (let i = 0; i < 40 && !mailPath; i++) {
  await new Promise(r => setTimeout(r, 200));
  mailPath = (readFileSync(WLOG, 'utf8').slice(logStart).match(/Text: (\S+\.txt)/) || [])[1];
}
const link = readFileSync(mailPath, 'utf8').match(/https?:\/\/\S+\/auth\/verify\?\S+/)?.[0];
const callbackURL = new URL(link).searchParams.get('callbackURL');
check('magic link carries only a short pending id, not the OAuth query', /^\/authorize\?pending=[A-Za-z0-9_-]+$/.test(callbackURL), callbackURL);

await page.goto(link);
await page.click('a:has-text("Sign in")');
await page.waitForLoadState('domcontentloaded');
const h1 = await page.textContent('h1', { timeout: 3000 }).catch(() => null);
if (!h1) {
  check('after the magic link: consent page (not a 403)', false, `${page.url().slice(0, 80)}… → ${(await page.textContent('body')).slice(0, 160)}`);
  await browser.close();
  console.log(`\n${failures} FAILED`);
  process.exit(1);
}
check('after the magic link: consent page (not a 403)', /Connect “Connect E2E”\?/.test(h1), h1);
check('consent shows the redirect host', (await page.textContent('#redirect-host'))?.trim() === '127.0.0.1:9');

await page.click('button:has-text("Connect")');
for (let i = 0; i < 50 && !code; i++) await new Promise(r => setTimeout(r, 100));
check('Connect redirects back to the AI app with a code', !!code);
check('no page errors or CSP violations in the browser', !pageErrors.length, pageErrors.join(' | '));
// The person's app session (same browser) — used below to add a hidden person and read back sync.
const syncApi = (changes) => ctx.request.post(`${BASE}/api/sync`, { headers: { origin: BASE }, data: { since: '', changes } }).then(r => r.json());
const now = new Date().toISOString();
await syncApi([{ id: 'hidden-1', name: 'Hidden Ex', birthDate: '1980-02-02', birthTime: '10:00', aiAccess: false, updatedAt: now }]);

// --- back in the AI app: finish OAuth, then use the tools -------------------
await transport.finishAuth(code);
check('token exchange (PKCE verifier) gives an access + refresh token', !!store.tokens?.access_token && !!store.tokens?.refresh_token,
  JSON.stringify({ scope: store.tokens?.scope }));
check('granted scope is read + write', store.tokens?.scope === 'charts:read charts:write', store.tokens?.scope);

transport = new StreamableHTTPClientTransport(mcpUrl, { authProvider: provider });
client = new Client({ name: 'connect-e2e', version: '0' });
await client.connect(transport);
const { tools } = await client.listTools();
check('tools/list: 8 tools incl. the personal ones', tools.length === 8 && ['list_people', 'save_person', 'delete_person'].every(n => tools.some(t => t.name === n)),
  tools.map(t => t.name).join(','));
const save = await client.callTool({ name: 'save_person', arguments: { name: 'E2E Mom', birth: { birthDate: '1962-04-11', birthTime: '08:15', utcOffset: -7 } } });
check('save_person works with the write scope', !save.isError, save.content?.[0]?.text?.slice(0, 160));
const chart = await client.callTool({ name: 'compute_chart', arguments: { birth: 'E2E Mom', image: 'none' } });
const out = JSON.parse(chart.content?.[0]?.text || '{}');
check('compute_chart by saved name', !chart.isError && out.person === 'E2E Mom' && !!out.humanDesign?.type, chart.content?.[0]?.text?.slice(0, 160));

// Hidden people (AI access off) stay invisible, even to delete_person.
const hiddenDel = await client.callTool({ name: 'delete_person', arguments: { name: 'Hidden Ex' } });
const hiddenById = await client.callTool({ name: 'delete_person', arguments: { id: 'hidden-1' } });
check('delete_person cannot see or delete a hidden person', hiddenDel.isError && hiddenById.isError,
  `${hiddenDel.content?.[0]?.text?.slice(0, 100)} / ${hiddenById.content?.[0]?.text?.slice(0, 100)}`);
const del = await client.callTool({ name: 'delete_person', arguments: { name: 'E2E Mom' } });
const pulled = (await syncApi([])).changes || [];
const momRow = pulled.find(c => c.deletedAt && !pulled.some(o => o.id === c.id && !o.deletedAt));
const hiddenRow = pulled.find(c => c.id === 'hidden-1');
check('an AI delete leaves a bare tombstone (no birth data) and spares the hidden person',
  !del.isError && momRow && !momRow.name && !momRow.birthDate && hiddenRow && !hiddenRow.deletedAt,
  JSON.stringify({ del: del.content?.[0]?.text?.slice(0, 80), momRow, hidden: hiddenRow?.name }));
await client.close();
await browser.close();

console.log(failures ? `\n${failures} FAILED` : '\nConnect flow passed end to end');
process.exit(failures ? 1 : 0);
