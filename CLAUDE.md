# CLAUDE.md — Bodygraph App

## Overview

Bodygraph is a standalone Human Design chart application powered by NatalEngine.
It provides an interactive, beautiful experience for exploring your Human Design chart
with progressive disclosure from basics to advanced features.

## Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # Build for production
npm run preview  # Preview production build
```

## Architecture

```
src/
├── main.js         # App entry — state, navigation, all view renderers
├── styles.css      # Full design system with dark mode
└── bodygraph.js    # SVG bodygraph renderer
```

Single-page app with 4 views:
- **My Chart**: Bodygraph + foundation panel + tabbed detail panels
- **Transits**: Transit overlay on natal chart
- **Connection**: Two-person chart comparison
- **Team**: Penta/group analysis

## Dependencies

- `natalengine` (local link to ../natal-engine) — all calculations
- `vite` — build tool

## Design System

- Warm neutral palette (light) / dark mode via `data-theme="dark"`
- Fonts: Inter (UI), Crimson Pro (headings)
- Color tokens: `--accent` (warm amber), `--personality` (black), `--design` (red), `--both` (brown)
- Circuit colors: `--individual` (purple), `--tribal` (red), `--collective` (blue), `--integration` (green)
