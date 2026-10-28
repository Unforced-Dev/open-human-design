# CLAUDE.md — Open Human Design

## Overview

Open Human Design (Open HD) is an open-source Human Design chart application powered by NatalEngine.
Strategy (see `docs/RESEARCH.md`): give away the depth competitors paywall (Variable/PHS, line-level
detail, connection, transits, penta), with calm modern design, accurate calculation, and no
account/tracking — local-first.

## Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # Build for production
npm run preview  # Preview production build
npm test         # Unit tests incl. MCP server (node --test; hits Open-Meteo)
npm run e2e      # Browser smoke test (needs dev server running + Chrome)
npx wrangler dev # Worker locally: SPA + /mcp (build first; migrate local D1 once:
                 #   npx wrangler d1 migrations apply open-human-design --local)
node tests/mcp-connect-e2e.mjs http://localhost:8787 <wrangler.log>  # AI connect flow, SDK + Chrome
node tests/security-probe.mjs http://localhost:8787 <wrangler.log>   # audit exploit replay (local only)
npx wrangler deploy  # Deploy to Cloudflare (needs wrangler login)
```

## Setup & hosting

`natalengine` comes from npm (`^1.3.0`). For engine development, clone
[Unforced-Dev/natal-engine](https://github.com/Unforced-Dev/natalengine) as a sibling and
`npm link`/`file:` it temporarily — but published versions are the default.

**Primary hosting**: Cloudflare Worker → https://openhumandesign.com (SPA + `/mcp`), deployed
manually with `npx wrangler deploy`. GitHub Pages mirror auto-deploys on push to main
(https://unforced-dev.github.io/open-human-design/).

## Architecture

```
src/
├── main.js            # Slim entry: theme, nav, boot (URL → last person → entry), people switcher
├── styles.css         # Full design system with dark mode
├── bodygraph.js       # SVG bodygraph: planet columns, striped dual activations, hover/click,
│                      #   transit rings, reveal animation, traditional center colors
├── detail-panel.js    # the one detail panel: data-detail="kind:id" in a [data-detail-scope]
│                      #   opens in place (sheet <1024px, side panel ≥1024px), Back trail
├── features/transit-timeline/  # the Timeline view (worker-backed activation windows)
├── lib/
│   ├── chartdata.js   # computeChart + birth-time sensitivityCheck (±15min diff)
│   ├── location.js    # re-exports natalengine timezone module (Open-Meteo + Intl IANA history)
│   ├── people.js      # saved people, backed by natalengine profile storage (interop)
│   ├── share.js       # birth data ↔ URL params (shareable chart links, ?view= deep links)
│   ├── details.js     # pure panel renderers per scope (chart, pair, team); transit-aware
│   ├── glossary.js    # original interpretive text used by the panel
│   ├── pair.js        # two-chart model shared by the combined bodygraph and the panel
│   ├── transit-graph.js # transit graph model (sources, channels, centers) for graph + panel
│   └── format.js      # esc(), formatBirth()
└── views/
    ├── entry.js       # birth form: place autocomplete, tz chip, manual-offset fallback
    ├── chart.js       # bodygraph + foundation + tabs (Centers/Channels/Gates/Planets/Variable/Cross)
    ├── transits.js    # transit overlay graph + completions
    ├── timeline.js    # bridge from the Timeline feature to the app (chart, graph, panel)
    ├── connection.js  # two-person comparison (saved people or manual)
    └── team.js        # penta/group analysis

worker/
├── index.js           # Cloudflare Worker entry: /mcp → MCP server, /* → static assets
└── mcp.js             # remote MCP: 5 one-shot tools (compute_chart, compare_charts,
                       #   get_transits, analyze_team, get_descriptions), stateless
                       #   streamable HTTP — see docs/PLATFORM.md for the design
```

Single-page app, 5 views (chart, transits, timeline, connection, team). State lives in main.js
(`currentData`); views read it via `chart.js#getCurrentChart()`.

## Key conventions

- Personality = black, right column; Design = red, left column; both = candy stripe.
- Transits use teal (`--transit-source`), coloured by source: birth, transit, both, completed by
  transit (from PR #6; replaces the amber dashed rings — awaiting Aaron's sign-off).
- Traditional center colors when defined (Head/G yellow, Ajna green, Heart/Sacral red, rest tan);
  undefined = white.
- Timezone is always resolved from IANA history at the birth moment (never longitude estimates,
  never current-year DST). Manual UTC offset stays available as a fallback.
- All interpretive text is original phrasing (Ra Uru Hu's prose is Jovian Archive IP; structure,
  names and numbers are free — see docs/RESEARCH.md §3.1).
- `docs/RESEARCH.md` is the requirements doc: competitive landscape, accuracy spec, content
  inventory, UI direction, P0/P1/P2 roadmap.

## Dependencies

- `natalengine` (npm `^1.3.0`) — all calculation (incl. pure SVG renderers); audited against 5 reference charts
- `vite` — build; `playwright-core` — e2e (drives system Chrome)

## Design System

- Warm neutral palette (light) / dark mode via `data-theme="dark"`
- Fonts: Inter (UI), Crimson Pro (headings)
- Color tokens: `--accent` (warm amber), `--personality` (black), `--design` (red)
- Circuit colors: `--individual` (purple), `--tribal` (red), `--collective` (blue), `--integration` (green)
- Type colors: `--generator`, `--manifesting-generator`, `--manifestor`, `--projector`, `--reflector`
