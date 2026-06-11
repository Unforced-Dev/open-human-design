# Contributing to Open Human Design

Welcome! This is a calm, local-first, dependency-light app — vanilla JS + Vite on the front end, a
Cloudflare Worker for hosting and the MCP server. Most contribution (especially to start) is pure
front end and needs **no Cloudflare access at all**.

## Prerequisites

- **Node 20+** and npm (`node -v` should be ≥ 20)
- **git**, with access to the repo (ask Aaron to add you as a collaborator on
  `Unforced-Dev/open-human-design`)
- **Google Chrome** — only for the end-to-end smoke test (`npm run e2e` drives system Chrome)

## Get the app running

```bash
git clone https://github.com/Unforced-Dev/open-human-design
cd open-human-design
npm install        # natalengine (the calc engine) comes from npm — nothing else to set up
npm run dev        # → http://localhost:5174
```

That's the whole front-end setup. The chart math, SVG geometry, and all interpretive content come
from the `natalengine` npm package, so you don't need any keys, secrets, or services to build UI.

Read **`CLAUDE.md`** for the architecture map (where each view, the bodygraph renderer, and the
shared state live) and the key conventions (color semantics, timezone handling, the
original-phrasing IP rule). It's the single best orientation doc.

## Workflow: feature branches + pull requests

We work on branches and merge via PRs — never commit straight to `main`.

```bash
git checkout -b feat/short-description      # or fix/…, docs/…
# …make changes, commit as you go…
git push -u origin feat/short-description
# open a Pull Request on GitHub → review → merge to main
```

Merging to `main` auto-deploys the **GitHub Pages mirror**
(<https://unforced-dev.github.io/open-human-design/>) — that's your live preview. The production
Cloudflare deploy to <https://openhumandesign.com> is run by Aaron for now (see below).

### Before you push

```bash
npm test           # unit tests (MCP server + chart data; hits Open-Meteo, so needs network)
npm run e2e        # browser smoke test — start `npm run dev` first, in another terminal
npm run build      # make sure the production build is clean
```

`npm run dev` and `npm run e2e` share port **5174**, so the e2e suite needs the dev server running
and finds it with no extra config. Keep both green before opening a PR.

## Front end vs. Cloudflare — what needs what

| Working on… | Cloudflare needed? | How |
|---|---|---|
| Views, bodygraph, styles, share links, anything in `src/` | **No** | `npm run dev`; preview merged work on the GitHub Pages mirror |
| The Worker, the MCP server (`worker/`), SEO pages, OG cards | Yes | see below |

**You almost certainly don't need this to start.** When you do need to run or deploy the Worker:

- **Run the Worker locally:** `npm run build` then `npx wrangler dev`. This needs a local
  `.dev.vars` file (auth secret, etc.) that isn't in git — ask Aaron for it.
- **Deploy the Worker:** production (`npx wrangler deploy`) pushes straight to the live
  `openhumandesign.com` domain, so for now Aaron runs production deploys. If you need to deploy
  yourself, Aaron can issue a **scoped Cloudflare API token** (the "Edit Cloudflare Workers" token
  template **plus D1: Edit**, since the app uses a D1 database). Then:

  ```bash
  export CLOUDFLARE_API_TOKEN=…        # the scoped token
  export CLOUDFLARE_ACCOUNT_ID=…       # Aaron will share this (it's not in the repo)
  npx wrangler deploy
  ```

  This lets you deploy without any other access to the account. (Ask Aaron about a separate staging
  Worker if you want to deploy freely without touching production.)

## Conventions that matter

- **Original phrasing only** for interpretive text — Ra Uru Hu's prose is Jovian Archive IP; the
  system's structure, names, and numbers are free. See `CLAUDE.md` and `docs/RESEARCH.md §3.1`.
- **Calm, recognizable design** — match the warm-neutral palette, Inter/Crimson Pro, and the
  canonical bodygraph grammar (shapes, red=Design/black=Personality, white=undefined). Change
  finish, not grammar.
- **Local-first, no heavy deps** — vanilla JS and SVG/CSS; don't reach for a framework or a big
  library without discussing it first.

Questions? Ask Aaron. Thanks for building this with us. 🌱
