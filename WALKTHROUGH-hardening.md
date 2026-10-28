# Walkthrough — hardening (audit items 1, 2 and 5)

Video: `~/.local/share/uni/videos/ohd-hardening.mp4` (narrated, signed as Uni).
Screenshots: `walkthrough/hardening/` — all from local `wrangler dev` builds of this branch ("after") and of
origin/main ("before"). Narration text: `walkthrough/hardening/narration.md`.

## How to run it

```bash
npm ci --ignore-scripts            # Node 26: sharp's install script fails; it isn't used
npm run build
npx wrangler d1 migrations apply open-human-design --local
echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" > .dev.vars   # any value, local only
npx wrangler dev > /tmp/wr.log 2>&1 &                          # http://localhost:8787
node tests/security-probe.mjs  http://localhost:8787 /tmp/wr.log   # exploit replay: expect "0 step(s) OPEN"
node tests/mcp-connect-e2e.mjs http://localhost:8787 /tmp/wr.log   # AI connect flow, signed out first
E2E_URL=http://localhost:8787/ CHROME_PATH=/usr/bin/chromium npm run e2e
```

Magic links go to the local `send_email` binding; wrangler prints each email's file path to its log, which
is why the scripts take the log path.

## Steps

1. **Consent phishing — before** (`01-consent-phish-before.png`).
   *"Anyone could register an app called Claude. The consent page showed only that name, so one click sent a
   code — and a 30-day refresh token — to a stranger's site."*

2. **Consent — after** (`02-consent-phish-after.png`, `03-consent-claude-after.png`).
   *"Now the page shows where access really goes, warns when it isn't an app we know, and lists only the
   permissions being granted. Requests without PKCE S256 never reach this page."*

3. **The replay** (`tests/security-probe.mjs`, output below).
   *"The audit's attack, step by step: nineteen steps worked on origin/main; none work on this branch."*

4. **Connect your AI, signed out** (`08-connect-after-magic-link-before.png` → `04-connect-signin-after.png`
   → `09-connect-after-magic-link-after.png`).
   *"Before, the email link ended on a raw 403. Now the request waits on the server under a short id and the
   link lands on consent. The official MCP client then saves and charts a person by name."*

5. **Invite to compare, blank name** (`06-invite-blank-name-before.png` → `07-invite-blank-name-after.png`).
   *"Leave the optional name blank and the comparison used to vanish. Now it appears."*

6. **Privacy copy and fonts** (`05-invite-entry-after.png`).
   *"Fonts come from our own site, share previews drop place and coordinates and aren't indexed, and the copy
   says 'stays on your device unless you share it'."*

## Before / after numbers

| Check | origin/main | hardening |
|---|---|---|
| `tests/security-probe.mjs` (local wrangler dev) | 19 steps OPEN | 0 OPEN |
| audit `tools/invite-bug.mjs`, Name blank | 0 chars, no guest | guest selected, 3,537 chars |
| `tests/mcp-connect-e2e.mjs`, signed out first | 403 INVALID_CALLBACK_URL | passes (16 checks, incl. 2 on real D1) |
| `npm run e2e` via the Worker (CSP live) | blank-name case fails | 25/25 pass, no CSP violations |
| Font requests | fonts.gstatic.com | same origin only |

Raw outputs: `walkthrough/hardening/probe-*.txt` and `connect-*.txt`.
