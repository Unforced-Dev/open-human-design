/**
 * Dynamic OpenGraph + share images — /og/card.png?d=…&t=…&tz=…&n=…&theme=…
 *
 * Pipeline: birth params → calculateHumanDesign (~1ms) → engine's pure card
 * renderer → resvg-wasm → PNG. Deterministic per params, edge-cached forever.
 *   default            → 1200×630 OpenGraph card (unfurls)
 *   ?format=story      → 1080×1920 vertical card (Reels / Stories / TikTok)
 *   ?format=square     → 1080×1080 square card (posts)
 */

import { calculateHumanDesign, renderChartCardSVG, renderStoryCardSVG, renderBodygraphSVG } from 'natalengine';
import { svgToPng } from './render.js';

export function parseChartParams(searchParams) {
  const d = searchParams.get('d');
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = searchParams.get('t');
  const birthTime = t && /^\d{1,2}:\d{2}$/.test(t) ? t : '12:00';
  const tz = parseFloat(searchParams.get('tz'));
  return {
    birthDate: d,
    birthTime,
    timezone: Number.isNaN(tz) ? 0 : Math.max(-12, Math.min(14, tz)),
    name: (searchParams.get('n') || '').slice(0, 60) || null
  };
}

export function computeForParams(p) {
  const [h, m] = p.birthTime.split(':').map(Number);
  return calculateHumanDesign(p.birthDate, h + (m || 0) / 60, p.timezone);
}

export async function handleOgImage(request) {
  const url = new URL(request.url);
  const params = parseChartParams(url.searchParams);
  if (!params) {
    return new Response('missing or invalid chart params (need ?d=YYYY-MM-DD)', { status: 400 });
  }

  // Edge cache: same params → same pixels, forever
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const chart = computeForParams(params);
  const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const format = url.searchParams.get('format');
  let svg, width;
  if (format === 'story' || format === 'square') {
    svg = renderStoryCardSVG(chart, { name: params.name, format, theme, fontFamily: 'Inter' });
    width = 1080;
  } else {
    svg = renderChartCardSVG(chart, { name: params.name, theme, fontFamily: 'Inter' });
    width = 1200;
  }
  const png = await svgToPng(svg, width);

  const response = new Response(png, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=31536000, immutable'
    }
  });
  await cache.put(cacheKey, response.clone());
  return response;
}

/**
 * Public bodygraph as SVG — /chart.svg?d=&t=&tz=&n=&theme=&columns=
 * Pure string render (no rasterization), edge-cached. The scalable,
 * crisp chart image; linked from MCP results and usable as an <img src>.
 */
export async function handleChartSvg(request) {
  const url = new URL(request.url);
  const params = parseChartParams(url.searchParams);
  if (!params) {
    return new Response('missing or invalid chart params (need ?d=YYYY-MM-DD)', { status: 400 });
  }

  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const chart = computeForParams(params);
  const svg = renderBodygraphSVG(chart, {
    theme: url.searchParams.get('theme') === 'dark' ? 'dark' : 'light',
    planetColumns: url.searchParams.get('columns') !== 'false',
    fontFamily: 'Inter'
  });

  const response = new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable'
    }
  });
  await cache.put(cacheKey, response.clone());
  return response;
}

/**
 * Share-link unfurls: when the SPA shell is requested with chart params,
 * rewrite the OpenGraph tags so messengers/crawlers see "Jordan is a
 * Manifesting Generator…" + the per-chart card instead of the generic
 * site tags. Runs for everyone (harmless for humans — meta tags only).
 */
function withNoindex(response) {
  const out = new Response(response.body, response);
  out.headers.set('X-Robots-Tag', 'noindex');
  return out;
}

export function rewriteShareMeta(htmlResponse, url) {
  const params = parseChartParams(url.searchParams);
  if (!params) return withNoindex(htmlResponse);

  let title, description;
  try {
    const chart = computeForParams(params);
    const who = params.name || 'This chart';
    title = `${who} — ${chart.type.name} ${chart.profile.numbers}`;
    description = `${chart.authority.name} · ${chart.definition} · ${chart.incarnationCross?.name ? 'Cross of ' + chart.incarnationCross.name.replace(/^The /, '') : 'Human Design'} — see the full chart, free.`;
  } catch {
    return withNoindex(htmlResponse);
  }

  const imgParams = new URLSearchParams();
  imgParams.set('d', params.birthDate);
  imgParams.set('t', params.birthTime);
  imgParams.set('tz', String(params.timezone));
  if (params.name) imgParams.set('n', params.name);
  const image = `${url.origin}/og/card.png?${imgParams}`;
  // Bare link (date, time, offset, name): place and coordinates stay out of
  // unfurls, and crawlers are told not to index anyone's chart.
  const bareUrl = `${url.origin}/?${imgParams}`;

  const swap = {
    'og:title': title,
    'og:description': description,
    'og:image': image,
    'og:url': bareUrl,
    'twitter:title': title,
    'twitter:description': description,
    'twitter:image': image
  };

  return new HTMLRewriter()
    .on('meta', {
      element(el) {
        const key = el.getAttribute('property') || el.getAttribute('name');
        if (key && swap[key] !== undefined) el.setAttribute('content', swap[key]);
      }
    })
    .on('title', {
      element(el) {
        el.setInnerContent(`${title} — Open Human Design`);
      }
    })
    .on('head', {
      element(el) {
        el.append('<meta name="robots" content="noindex">', { html: true });
      }
    })
    .transform(withNoindex(htmlResponse));
}
