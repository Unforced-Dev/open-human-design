/**
 * Worker-only SVG rasterizer (OG cards + MCP chart images).
 *
 * The engine renders charts as pure SVG strings (the universal, scalable
 * format). resvg-wasm turns those into PNGs for the two places that need
 * pixels: social-card unfurls (crawlers require raster) and inline MCP
 * images (Anthropic/OpenAI image blocks accept raster only, not SVG).
 *
 * This module statically imports .wasm and .ttf assets, so it only loads
 * in the Worker bundle — never import it from code that runs under plain
 * Node (the MCP handler dynamic-imports it so its Node tests still run).
 */

import { Resvg, initWasm } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';

import interRegular from './fonts/inter-regular.ttf';
import interBold from './fonts/inter-bold.ttf';

let wasmReady = null;
export function ensureWasm() {
  if (!wasmReady) wasmReady = initWasm(resvgWasm).catch(err => {
    wasmReady = null; // allow retry on transient failure
    throw err;
  });
  return wasmReady;
}

/** Rasterize an SVG string to a PNG (Uint8Array) at the given width. */
export async function svgToPng(svg, width = 900) {
  await ensureWasm();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: {
      fontBuffers: [new Uint8Array(interRegular), new Uint8Array(interBold)],
      defaultFontFamily: 'Inter',
      loadSystemFonts: false
    }
  });
  return resvg.render().asPng();
}

/** Base64 of a Uint8Array, chunked to avoid call-stack limits on large buffers. */
export function toBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
