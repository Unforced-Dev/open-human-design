# PROGRESS — hardening (BRIEF-ohd-hardening.md)

Branch `hardening`, rebased onto origin/main 2951216 (after integrate-prs merged as PR #10).
Worktree ~/Code/wt/ohd-hardening. Not pushed, not deployed.

## Done
1. **OAuth + Worker** — S256-only PKCE (`allowPlainPKCE:false`, S256 check on /authorize, token
   requests without `code_verifier` refused); consent shows the redirect host + warning for unknown
   non-loopback hosts; scopes granted per consent, carried in token props, enforced in MCP; exact-name
   lookups, hidden people invisible to every MCP tool incl. delete_person; security headers on every
   Worker response (`worker/security.js`) and on static assets (`public/_headers`); http→https 301 on
   prod hosts; better-auth baseURL always https; magic-link rate limit on `cf-connecting-ip`, stored in
   D1 (`migrations/0004_rate_limit.sql`, additive); `/api/sync` validates everything, tombstones are bare
   and only for known ids, rows bounded, body capped, JSON + same origin only.
2. **Invite with blank name** — `src/views/connection.js` (`isSamePerson`), e2e with and without a name,
   plus "shared chart not offered against itself".
3. **Connect your AI signed out** — OAuth query parked in KV when the sign-in email goes out; magic link
   carries `/authorize?pending=<id>`. `tests/mcp-connect-e2e.mjs` (SDK client + Chrome).
4. **Privacy** — self-hosted fonts, bare og:url + noindex on share pages, "unless you share it" copy.
5. **Verification** — probe 19 OPEN → 0; e2e 25/25 via the Worker with CSP; connect flow passes; 122 unit
   tests; /code-review run and its findings fixed; video + WALKTHROUGH.md.

## Open
- Deploy needs Aaron's go-ahead; apply migration 0004 to remote D1 first.
- ux-tablet-pass conflicts with origin/main already (8 files, from PR #10); hardening adds none of its own.
