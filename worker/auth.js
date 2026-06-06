/**
 * better-auth on Workers + D1.
 *
 * IMPORTANT: the auth instance is built PER REQUEST via createAuth(env) —
 * the documented module-singleton pattern silently breaks on Workers
 * because the D1 binding differs per invocation (see docs/PLATFORM.md
 * "Known sharp edges").
 *
 * Sign-in method: magic link (no passwords to hold). The link is emailed
 * via the EMAIL_SENDER hook — Cloudflare Email Service when bound, and a
 * console fallback in local dev so the flow is testable without email
 * infrastructure (wrangler dev prints the link).
 */

import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { D1Dialect } from 'kysely-d1';

async function sendMagicLinkEmail(env, { email, url }) {
  try {
    await trySendEmail(env, { email, url });
  } catch (err) {
    // Domain not onboarded yet / transient send failure — never 500 the
    // sign-in flow; surface the link in logs so wrangler tail can rescue.
    console.warn(`[magic-link] email send failed (${err.message}); link for ${email} → ${url}`);
  }
}

async function trySendEmail(env, { email, url }) {
  if (env.SEND_EMAIL) {
    // Cloudflare Email Service binding — domain onboarded via
    // `wrangler email sending enable openhumandesign.com`.
    await env.SEND_EMAIL.send({
      to: email,
      from: { email: 'hello@openhumandesign.com', name: 'Open Human Design' },
      subject: 'Your sign-in link',
      text: [
        'Sign in to Open Human Design:',
        '',
        url,
        '',
        "This link expires in 5 minutes. If you didn't request it, you can ignore this email."
      ].join('\n'),
      html: [
        '<div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px">',
        '<h2 style="font-weight:500">Sign in to Open Human Design</h2>',
        `<p><a href="${url}" style="display:inline-block;background:#c47a2a;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px">Sign in</a></p>`,
        '<p style="color:#777;font-size:13px">This link expires in 5 minutes. If you didn’t request it, you can ignore this email.</p>',
        '</div>'
      ].join('')
    });
    return;
  }
  // Local dev / email not configured yet: surface the link in logs.
  console.log(`[magic-link] ${email} → ${url}`);
}

export function createAuth(env, baseURL) {
  return betterAuth({
    baseURL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [
      'https://openhumandesign.com',
      'https://www.openhumandesign.com',
      'http://localhost:5174',
      'http://localhost:8788'
    ],
    database: {
      dialect: new D1Dialect({ database: env.DB }),
      type: 'sqlite'
    },
    session: {
      expiresIn: 60 * 60 * 24 * 90, // 90 days — low-stakes data, low friction
      updateAge: 60 * 60 * 24
    },
    plugins: [
      magicLink({
        // 15 min — interstitial adds a human step, so give comfortable slack
        expiresIn: 900,
        sendMagicLink: async ({ email, url }) => {
          // Email the styled interstitial (/auth/verify), not the raw
          // endpoint: mail scanners prefetch links and would consume the
          // single-use token before the human clicks.
          const interstitial = url.replace('/api/auth/magic-link/verify', '/auth/verify');
          return sendMagicLinkEmail(env, { email, url: interstitial });
        }
      })
    ]
  });
}

/** Session for an incoming request, or null. */
export async function getSession(env, request) {
  const auth = createAuth(env, new URL(request.url).origin);
  return auth.api.getSession({ headers: request.headers });
}
