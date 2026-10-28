/**
 * Transport + header hardening for every Worker response (audit 2026-10-28,
 * notes/security.md M1, H1).
 *
 *   - http:// on the production hosts → 301 to https:// (before any auth code
 *     runs, so session cookies and magic links are only ever issued on https)
 *   - security headers on every route: CSP, HSTS, frame-ancestors / XFO,
 *     nosniff, Referrer-Policy, Permissions-Policy
 *   - /oauth/token: an authorization_code exchange must carry a PKCE
 *     code_verifier (with allowPlainPKCE:false, /authorize only accepts S256)
 */

export const PROD_HOSTS = new Set(['openhumandesign.com', 'www.openhumandesign.com']);
export const SCOPES = ['charts:read', 'charts:write'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * better-auth baseURL, pinned to https: never taken from an http request, so
 * session cookies are always Secure and magic links always https. The host
 * stays the one the request arrived on (Cloudflare only routes our own
 * domains and workers.dev here), so www and workers.dev keep working.
 * Local dev keeps its own origin.
 */
export function authBaseURL(url) {
  if (LOCAL_HOSTS.has(url.hostname)) return url.origin;
  return `https://${url.host}`;
}

export function httpsRedirect(url) {
  if (url.protocol !== 'http:' || !PROD_HOSTS.has(url.hostname)) return null;
  const to = new URL(url);
  to.protocol = 'https:';
  return Response.redirect(to.toString(), 301);
}

// The app's own needs: same-origin scripts/styles/fonts, Open-Meteo for place
// search, data:/blob: images for "Save image". Inline styles stay allowed (the
// views set style="" in templates). The one hashed inline handler is the
// channel-row toggle in src/views/chart.js; drop the hash once it is gone.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-hashes' 'sha256-gtGrHqRVO8Sn5eXmUbqxXnrmgXIGawbqAeOXnKCVdQs='",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://geocoding-api.open-meteo.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'"
].join('; ');

const HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
};

/** Copy of `response` with the security headers set (a page's own CSP wins). */
export function withSecurityHeaders(response) {
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(HEADERS)) out.headers.set(k, v);
  if (!out.headers.has('Content-Security-Policy')) out.headers.set('Content-Security-Policy', CSP);
  return out;
}

/**
 * OAuthProvider tokenExchangeCallback: copy the token's scopes (a client may
 * downscope at /oauth/token) into its props for the MCP tools. Grants made
 * since enforcement always hold a scope; an empty one predates it: read-only.
 */
export function scopeTokenProps({ props, requestedScope }) {
  const scope = (requestedScope || []).filter(s => SCOPES.includes(s));
  return { accessTokenProps: { ...props, scope: scope.length ? scope : ['charts:read'] } };
}

/** 400 for an authorization_code exchange with no code_verifier, else null. */
export async function rejectTokenWithoutVerifier(request) {
  const url = new URL(request.url);
  if (url.pathname !== '/oauth/token' || request.method !== 'POST') return null;
  let body;
  try {
    body = new URLSearchParams(await request.clone().text());
  } catch {
    return null; // let the provider produce its own error
  }
  if (body.get('grant_type') !== 'authorization_code' || body.get('code_verifier')) return null;
  return Response.json(
    { error: 'invalid_request', error_description: 'code_verifier is required (PKCE S256)' },
    { status: 400 }
  );
}
