/**
 * Security logic that runs before any handler: transport, base URL, PKCE,
 * and /api/sync input validation (audit 2026-10-28, notes/security.md).
 * The end-to-end exploit run is tests/security-probe.mjs (local wrangler dev).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authBaseURL, httpsRedirect, rejectTokenWithoutVerifier, withSecurityHeaders } from '../worker/security.js';
import { classifyChange } from '../worker/sync.js';

test('better-auth baseURL is never an http production origin', () => {
  assert.equal(authBaseURL(new URL('http://openhumandesign.com/api/auth/x')), 'https://openhumandesign.com');
  assert.equal(authBaseURL(new URL('https://www.openhumandesign.com/')), 'https://www.openhumandesign.com');
  assert.equal(authBaseURL(new URL('https://open-human-design.someone.workers.dev/')), 'https://openhumandesign.com');
  assert.equal(authBaseURL(new URL('http://127.0.0.1:8796/')), 'http://127.0.0.1:8796');
});

test('http on the production hosts redirects to https; local dev does not', () => {
  const r = httpsRedirect(new URL('http://openhumandesign.com/authorize?x=1'));
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://openhumandesign.com/authorize?x=1');
  assert.equal(httpsRedirect(new URL('https://openhumandesign.com/')), null);
  assert.equal(httpsRedirect(new URL('http://localhost:8787/')), null);
});

test('security headers land on immutable responses too', () => {
  const r = withSecurityHeaders(Response.redirect('https://openhumandesign.com/', 302));
  assert.equal(r.status, 302);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  // A page's own (stricter) CSP is kept
  const own = withSecurityHeaders(new Response('x', { headers: { 'content-security-policy': "default-src 'none'" } }));
  assert.equal(own.headers.get('content-security-policy'), "default-src 'none'");
});

const tokenReq = (body) => new Request('https://openhumandesign.com/oauth/token', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body)
});

test('authorization_code exchange without code_verifier is refused', async () => {
  const r = await rejectTokenWithoutVerifier(tokenReq({ grant_type: 'authorization_code', code: 'c', client_id: 'x' }));
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'invalid_request');
  assert.equal(await rejectTokenWithoutVerifier(tokenReq({ grant_type: 'authorization_code', code: 'c', code_verifier: 'v' })), null);
  assert.equal(await rejectTokenWithoutVerifier(tokenReq({ grant_type: 'refresh_token', refresh_token: 'r' })), null);
});

test('sync: tombstones need only an id + time, junk is rejected', () => {
  const now = new Date().toISOString();
  assert.equal(classifyChange({ id: 'a1', deletedAt: now, updatedAt: now }), 'tombstone');
  assert.equal(classifyChange({ id: 'a1', deletedAt: 'x' }), null, 'deletedAt must be a timestamp');
  assert.equal(classifyChange({ id: 'x'.repeat(65), deletedAt: now }), null);
  assert.equal(classifyChange({ id: '<svg>', deletedAt: now }), null);
});

test('sync: live records validate date, time and every location field', () => {
  const ok = { id: 'p1', name: 'Mom', birthDate: '1962-04-11', birthTime: '08:15',
    location: { lat: 39.7, lon: -105, timezone: -6.5, iana: 'America/Argentina/Buenos_Aires', name: 'Denver' } };
  assert.equal(classifyChange(ok), 'live');
  assert.equal(classifyChange({ ...ok, location: null }), 'live');
  const bad = [
    { birthDate: '1990-13-45' },
    { birthDate: 'not-a-date' },
    { birthTime: '25:00' },
    { name: 'n'.repeat(201) },
    { location: { ...ok.location, lat: '<svg onload=alert(1)>' } },
    { location: { ...ok.location, lon: 200 } },
    { location: { ...ok.location, timezone: Number.NaN } },
    { location: { ...ok.location, iana: 'I'.repeat(1000) } },
    { location: { ...ok.location, iana: '../../etc' } },
    { location: { ...ok.location, name: 'L'.repeat(100_000) } },
    { location: 'Denver' },
    { createdAt: 'yesterday' }
  ];
  for (const b of bad) assert.equal(classifyChange({ ...ok, ...b }), null, JSON.stringify(b).slice(0, 80));
});
