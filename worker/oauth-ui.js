/**
 * OAuth authorize flow for the personal MCP connector (/mcp).
 *
 * GET /authorize  → no session: the OAuth request is parked server-side under
 *                   a short id; magic-link sign-in page returns to
 *                   /authorize?pending=<id>
 *                 → session: consent page for the requesting MCP client
 * GET /authorize?pending=<id> → back to the parked request
 * POST /authorize → completeAuthorization → redirect back to the client
 *
 * The full OAuth query never rides through the magic link: better-auth
 * decodes callbackURL a second time and rejected every real request
 * (encoded redirect_uri) with 403 INVALID_CALLBACK_URL.
 *
 * Identity comes from better-auth (the same session as the web app), so
 * "sign in once at openhumandesign.com, connect Claude with two clicks."
 */

import { getSession } from './auth.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const SCOPES = ['charts:read', 'charts:write'];
const SCOPE_TEXT = {
  'charts:read': "See saved people you've given <em>AI access</em>",
  'charts:write': 'Save new people, and remove saved people, when you ask it to'
};
const PENDING_TTL = 900; // 15 min, the magic link's lifetime
const pendingKey = (id) => `ohd:pending-authorize:${id}`;
// Hosts we know are the AI apps people connect; anything else gets a warning.
const KNOWN_CLIENT_HOSTS = new Set(['claude.ai', 'claude.com', 'chatgpt.com', 'chat.openai.com']);

const PAGE = (title, body, nonce = '') => new Response(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Open Human Design</title>
<style>
  body{font-family:Inter,system-ui,sans-serif;background:#faf8f5;color:#1a1714;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{background:#fff;border:1px solid #e5e0da;border-radius:14px;padding:36px;max-width:400px;width:90%;box-shadow:0 8px 24px rgba(0,0,0,.08)}
  h1{font-size:20px;font-weight:600;margin:0 0 6px} p{color:#6b6560;font-size:14px;line-height:1.55}
  input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #e5e0da;border-radius:8px;font-size:14px;margin:10px 0}
  button{width:100%;padding:11px;background:#c47a2a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
  button:hover{background:#a86520}
  .scopes{background:#faf8f5;border-radius:8px;padding:12px 16px;margin:14px 0;font-size:13.5px}
  .scopes li{margin:4px 0}
  .muted{font-size:12px;color:#9e9790;margin-top:14px}
  .ok{color:#27ae60;font-size:13.5px;display:none}
  .host{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;font-weight:600;color:#1a1714;background:#faf8f5;border:1px solid #e5e0da;border-radius:8px;padding:8px 12px;margin:8px 0;word-break:break-all}
  .warn{background:#fdf3e4;border:1px solid #f0d3a8;color:#7a4b12;border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.5}
  .err{color:#b3261e;font-size:13.5px;display:none}
</style></head><body><div class="card">${body}</div></body></html>`,
  { headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': `default-src 'none'; script-src ${nonce ? `'nonce-${nonce}'` : "'none'"}; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`
  } });

const newNonce = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
// JSON inside <script>: never let a value close the tag.
const scriptJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

function signInPage(returnUrl) {
  const nonce = newNonce();
  return PAGE('Sign in', `
    <h1>Sign in to connect your AI</h1>
    <p>An AI assistant is asking to connect to your Open Human Design charts. Sign in to continue.</p>
    <form id="f">
      <input type="email" id="email" placeholder="you@example.com" required autofocus>
      <button type="submit">Email me a sign-in link</button>
    </form>
    <p class="ok" id="ok">Check your email — the link brings you back here. ✓</p>
    <p class="err" id="err"></p>
    <p class="muted">We store only birth data, never charts. You'll choose what your AI can see next.</p>
    <script nonce="${nonce}">
      document.getElementById('f').addEventListener('submit', async (e) => {
        e.preventDefault();
        const ok = document.getElementById('ok'), err = document.getElementById('err');
        ok.style.display = err.style.display = 'none';
        let res;
        try {
          res = await fetch('/api/auth/sign-in/magic-link', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: document.getElementById('email').value, callbackURL: ${scriptJson(returnUrl)} })
          });
        } catch {}
        if (res && res.ok) { ok.style.display = 'block'; return; }
        err.textContent = res && res.status === 429
          ? 'Too many sign-in emails from your network. Wait a minute, then try again.'
          : 'Could not send the sign-in email. Please try again.';
        err.style.display = 'block';
      });
    </script>
  `, nonce);
}

/** "claude.ai", or "cursor://anysphere…" for non-web redirect URIs. */
function redirectLabel(redirectUri) {
  try {
    const u = new URL(redirectUri);
    return /^https?:$/.test(u.protocol) ? u.host : `${u.protocol}//${u.host}`;
  } catch {
    return redirectUri;
  }
}

/** Scopes to grant: the supported ones asked for; none asked → all (listed on consent). */
function grantedScopes(requested) {
  const ok = (requested || []).filter(s => SCOPES.includes(s));
  return ok.length ? ok : SCOPES;
}

/** Only S256 PKCE (the provider already refuses plain/missing methods). */
function pkceProblem(oauthReqInfo) {
  if (!oauthReqInfo.codeChallenge || oauthReqInfo.codeChallengeMethod !== 'S256') {
    return 'This request has no PKCE (S256) code challenge, which Open Human Design requires.';
  }
  return null;
}

const nothingToConnect = (detail = '') => PAGE('Connect', `<h1>Nothing to connect</h1>
        <p>This page is the consent step of connecting an AI assistant — it only works when an
        assistant sends you here. To connect yours, copy the connector URL from the app's
        Sync panel into your AI's connector settings.</p>${detail ? `<p class="muted">${esc(detail)}</p>` : ''}`);

// Loopback redirects (desktop / CLI clients) can't hand a code to anyone remote.
function isLoopback(redirectUri) {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(redirectUri).hostname);
  } catch {
    return false;
  }
}

function consentPage(clientName, email, qs, redirectUri, scopes) {
  const host = redirectLabel(redirectUri);
  const local = isLoopback(redirectUri);
  const known = local || KNOWN_CLIENT_HOSTS.has(host);
  return PAGE('Connect', `
    <h1>Connect “${esc(clientName)}”?</h1>
    <p>Signed in as <strong>${esc(email)}</strong>. Connecting sends access to:</p>
    <div class="host" id="redirect-host">${esc(host)}</div>${local ? '<p class="muted">An app on this computer.</p>' : ''}
    ${known ? '' : `<p class="warn"><strong>Check this address.</strong> The name above is chosen by the app itself and is not verified. Only connect if you started this from your AI assistant and recognise <strong>${esc(host)}</strong>.</p>`}
    <p>It will be able to:</p>
    <div class="scopes"><ul>
      ${scopes.map(s => `<li>${SCOPE_TEXT[s]}</li>`).join('')}
      <li>Compute charts, comparisons, and transits</li>
    </ul></div>
    <form method="post" action="/authorize">
      <input type="hidden" name="qs" value="${esc(qs)}">
      <button type="submit">Connect</button>
    </form>
    <p class="muted">You can disconnect anytime from your AI's connector settings. Nothing is shared beyond what's listed.</p>
  `);
}

/**
 * Magic-link interstitial — emails link HERE instead of the raw verify
 * endpoint. Mail scanners prefetch GETs and would consume the single-use
 * token before the human clicks; a deliberate button press spends it.
 */
export function verifyInterstitial(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const callbackURL = url.searchParams.get('callbackURL') || '/';
  if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return PAGE('Sign in', `<h1>Link incomplete</h1><p>This sign-in link is missing its token — request a fresh one from the app.</p>`);
  }
  const verifyHref = `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(callbackURL)}`;
  return PAGE('Sign in', `
    <h1>Finish signing in</h1>
    <p>One tap and you're in — this link works once.</p>
    <a href="${esc(verifyHref)}" style="display:block;text-align:center;text-decoration:none;padding:11px;background:#c47a2a;color:#fff;border-radius:8px;font-size:14px;font-weight:600">Sign in to Open Human Design</a>
    <p class="muted">Didn't request this? You can safely close this page.</p>
  `);
}

export async function handleAuthorize(request, env) {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    // Back from the magic link: resume the parked OAuth request.
    const pending = url.searchParams.get('pending');
    if (pending) {
      const qs = /^[A-Za-z0-9_-]{16,64}$/.test(pending) ? await env.OAUTH_KV.get(pendingKey(pending)) : null;
      if (!qs) {
        return PAGE('Connect', `<h1>This connect link has expired</h1>
          <p>Go back to your AI app and start connecting Open Human Design again. You're signed in now, so it takes one click.</p>`);
      }
      return Response.redirect(`${url.origin}/authorize${qs}`, 302);
    }

    // Validate the OAuth request early so broken clients fail clearly
    let oauthReqInfo, client;
    try {
      oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);
      client = await env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
    } catch (err) {
      return nothingToConnect(err?.message);
    }
    if (!client) return nothingToConnect('Unknown client.');
    const pkce = pkceProblem(oauthReqInfo);
    if (pkce) return nothingToConnect(pkce);

    const session = await getSession(env, request);
    if (!session) {
      // Park the request; only its id travels through the email link.
      const id = crypto.randomUUID().replace(/-/g, '');
      await env.OAUTH_KV.put(pendingKey(id), url.search, { expirationTtl: PENDING_TTL });
      return signInPage(`/authorize?pending=${id}`);
    }
    return consentPage(client.clientName || 'AI assistant', session.user.email, url.search,
      oauthReqInfo.redirectUri, grantedScopes(oauthReqInfo.scope));
  }

  if (request.method === 'POST') {
    // Same-origin guard for the consent form. Browsers always send Origin on
    // a form POST, so a missing one is a script, not a person.
    if (request.headers.get('Origin') !== url.origin) return new Response('Bad origin', { status: 403 });

    const session = await getSession(env, request);
    if (!session) return new Response('Session expired — reopen the connect link.', { status: 401 });

    const form = await request.formData();
    const qs = form.get('qs') || '';
    let oauthReqInfo;
    try {
      oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(new Request(`${url.origin}/authorize${qs}`, { method: 'GET' }));
    } catch (err) {
      return nothingToConnect(err?.message);
    }
    const pkce = pkceProblem(oauthReqInfo);
    if (pkce) return nothingToConnect(pkce);

    const scope = grantedScopes(oauthReqInfo.scope);
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReqInfo,
      userId: session.user.id,
      metadata: { email: session.user.email },
      scope,
      props: { userId: session.user.id, email: session.user.email, scope }
    });
    return Response.redirect(redirectTo, 302);
  }

  return new Response('Method not allowed', { status: 405 });
}
