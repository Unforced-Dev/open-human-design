/**
 * Open Human Design — Cloudflare Worker entry.
 *
 * The whole Worker is wrapped by workers-oauth-provider:
 *   /mcp          → the MCP connector (OAuth-protected; props.userId scopes
 *                   every tool — saved names, metering, the works). Decision
 *                   2026-06-06: no anonymous MCP — it would undercut the
 *                   metering model, and the zero-auth path for power users
 *                   is the engine's own stdio MCP (npx natalengine-mcp).
 *   /oauth/token, /oauth/register, /.well-known/* → handled by the provider
 *   everything else → defaultHandler below:
 *     /authorize    → sign-in + consent pages (worker/oauth-ui.js)
 *     /api/auth/*   → better-auth (magic-link sessions for app + consent)
 *     /api/sync     → people sync (LWW deltas; session required)
 *     /*            → static SPA assets (Vite dist/, SPA fallback)
 *
 * See docs/PLATFORM.md.
 */

import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { handleMcpRequest } from './mcp.js';
import { createAuth, getSession } from './auth.js';
import { handleSync } from './sync.js';
import { handleAuthorize, verifyInterstitial } from './oauth-ui.js';
import { handleOgImage, handleChartSvg, rewriteShareMeta } from './og.js';
import { handleSeoPage, handleSitemap, handleRobots } from './seo.js';
import { authBaseURL, httpsRedirect, rejectTokenWithoutVerifier, scopeTokenProps, withSecurityHeaders, SCOPES } from './security.js';

const MCP_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id'
};

// /api CORS: credentialed, allowlisted origins only (Vite dev against
// wrangler dev; production is same-origin and never needs these).
const API_ORIGINS = new Set([
  'http://localhost:5174',
  'http://localhost:8788',
  'https://openhumandesign.com',
  'https://www.openhumandesign.com'
]);

function apiCors(request) {
  const origin = request.headers.get('Origin');
  if (!origin || !API_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };
}

function withHeaders(response, extra) {
  if (!Object.keys(extra).length) return response;
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

const defaultHandler = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/og/card.png') {
      return handleOgImage(request);
    }

    if (pathname === '/chart.svg') {
      return handleChartSvg(request);
    }

    if (pathname === '/authorize') {
      return handleAuthorize(request, env);
    }

    if (pathname === '/auth/verify') {
      return verifyInterstitial(request);
    }

    if (pathname.startsWith('/api/')) {
      const cors = apiCors(request);
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: cors });
      }

      if (pathname.startsWith('/api/auth/')) {
        const auth = createAuth(env, authBaseURL(url));
        return withHeaders(await auth.handler(request), cors);
      }

      if (pathname === '/api/sync' && request.method === 'POST') {
        // CSRF: JSON only (a cross-site form can't send it without a
        // preflight) and no foreign Origin, on top of SameSite=Lax.
        const origin = request.headers.get('Origin');
        if (origin && origin !== url.origin && !API_ORIGINS.has(origin)) {
          return Response.json({ error: 'bad origin' }, { status: 403 });
        }
        if ((request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
          return withHeaders(Response.json({ error: 'expected application/json' }, { status: 415 }), cors);
        }
        const session = await getSession(env, request);
        if (!session) {
          return withHeaders(Response.json({ error: 'unauthorized' }, { status: 401 }), cors);
        }
        return withHeaders(await handleSync(env, session, request), cors);
      }

      return withHeaders(Response.json({ error: 'not found' }, { status: 404 }), cors);
    }

    // SEO: server-rendered reference pages (crawlable HTML the SPA can't give).
    if (pathname === '/sitemap.xml') return handleSitemap();
    if (pathname === '/robots.txt') return handleRobots();
    const seoPage = await handleSeoPage(request);
    if (seoPage) return seoPage;

    // Static assets (SPA) — wrangler serves env.ASSETS with SPA fallback.
    // Share links (/?d=…) get their OpenGraph tags rewritten per-chart so
    // unfurls show the person, not the generic site card.
    const assetResponse = await env.ASSETS.fetch(request);
    if (url.searchParams.has('d') && (assetResponse.headers.get('content-type') || '').includes('text/html')) {
      return rewriteShareMeta(assetResponse, url);
    }
    return assetResponse;
  }
};

const mcpHandler = {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: MCP_CORS });
    }
    return withHeaders(await handleMcpRequest(request, env, ctx.props), MCP_CORS);
  }
};

const oauthProvider = new OAuthProvider({
  apiRoute: '/mcp',
  apiHandler: mcpHandler,
  defaultHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',
  scopesSupported: SCOPES,
  // OAuth 2.1: S256 only. Without a code_challenge the method defaults to
  // "plain", so this also rejects authorize requests that skip PKCE.
  allowPlainPKCE: false,
  // Each access token carries the scopes it was issued with, so the MCP
  // tools can enforce them (worker/security.js).
  tokenExchangeCallback: scopeTokenProps
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const upgrade = httpsRedirect(url);
    if (upgrade) return withSecurityHeaders(upgrade);
    const noVerifier = await rejectTokenWithoutVerifier(request);
    if (noVerifier) return withSecurityHeaders(noVerifier);
    return withSecurityHeaders(await oauthProvider.fetch(request, env, ctx));
  }
};
