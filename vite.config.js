import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works at any mount path (GitHub Pages
  // serves at /open-human-design/, local preview at /).
  base: './',
  // 5174 is the project's canonical dev port — the e2e default and the
  // worker's allowed auth origins both assume it, so `npm run dev` +
  // `npm run e2e` work together with no env vars.
  server: { port: 5174, strictPort: true },
  build: {
    outDir: 'dist'
  }
});
