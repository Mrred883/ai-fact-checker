import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * Dedicated build for the on-demand content script.
 *
 * It is injected via chrome.scripting.executeScript({ files: ['content-main.js'] }),
 * which requires a single, self-contained CLASSIC script (no ESM imports, no
 * shared chunks). Because it runs in the isolated content world via the
 * scripting API — not as page script — it is immune to the target page's CSP.
 * That removes the only runtime risk of the dynamic-import approach.
 *
 * Output is written into dist/ AFTER the main crx build (see package.json), so it
 * sits alongside the rest of the bundle without clobbering it (emptyOutDir off).
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: false, // keep the crx build that ran first
    cssCodeSplit: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/content/index.tsx', import.meta.url)),
      output: {
        format: 'iife',
        entryFileNames: 'content-main.js',
        inlineDynamicImports: true, // single self-contained file
      },
    },
  },
})
