/**
 * OAuth authorize flow for the personal MCP connector (/mcp/my).
 *
 * GET /authorize  → no session: magic-link sign-in page (returns here)
 *                 → session: consent page for the requesting MCP client
 * POST /authorize → completeAuthorization → redirect back to the client
 *
 * Identity comes from better-auth (the same session as the web app), so
 * "sign in once at openhumandesign.com, connect Claude with two clicks."
 */

import { getSession } from './auth.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PAGE = (title, body) => new Response(`<!doctype html>
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
</style></head><body><div class="card">${body}</div></body></html>`,
  { headers: { 'content-type': 'text/html; charset=utf-8' } });

function signInPage(returnUrl) {
  return PAGE('Sign in', `
    <h1>Sign in to connect your AI</h1>
    <p>An AI assistant is asking to connect to your Open Human Design charts. Sign in to continue.</p>
    <form id="f">
      <input type="email" id="email" placeholder="you@example.com" required autofocus>
      <button type="submit">Email me a sign-in link</button>
    </form>
    <p class="ok" id="ok">Check your email — the link brings you back here. ✓</p>
    <p class="muted">We store only birth data, never charts. You'll choose what your AI can see next.</p>
    <script>
      document.getElementById('f').addEventListener('submit', async (e) => {
        e.preventDefault();
        await fetch('/api/auth/sign-in/magic-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: document.getElementById('email').value, callbackURL: ${JSON.stringify(returnUrl)} })
        });
        document.getElementById('ok').style.display = 'block';
      });
    </script>
  `);
}

function consentPage(clientName, email, qs) {
  return PAGE('Connect', `
    <h1>Connect “${esc(clientName)}”?</h1>
    <p>Signed in as <strong>${esc(email)}</strong>. This will let the assistant:</p>
    <div class="scopes"><ul>
      <li>See saved people you've given <em>AI access</em></li>
      <li>Compute charts, comparisons, and transits (50/month free)</li>
      <li>Save new people when you ask it to</li>
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
    // Validate the OAuth request early so broken clients fail loudly
    const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    const client = await env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
    const session = await getSession(env, request);
    if (!session) return signInPage(url.pathname + url.search);
    return consentPage(client?.clientName || 'AI assistant', session.user.email, url.search);
  }

  if (request.method === 'POST') {
    const session = await getSession(env, request);
    if (!session) return new Response('Session expired — reopen the connect link.', { status: 401 });

    // Same-origin guard for the consent form
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return new Response('Bad origin', { status: 403 });

    const form = await request.formData();
    const qs = form.get('qs') || '';
    const authorizeRequest = new Request(`${url.origin}/authorize${qs}`, { method: 'GET' });
    const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(authorizeRequest);

    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReqInfo,
      userId: session.user.id,
      metadata: { email: session.user.email },
      scope: oauthReqInfo.scope,
      props: { userId: session.user.id, email: session.user.email }
    });
    return Response.redirect(redirectTo, 302);
  }

  return new Response('Method not allowed', { status: 405 });
}
