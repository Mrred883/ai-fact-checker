import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { fileURLToPath, URL } from 'node:url'
import manifest from './src/manifest.config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [react(), crx({ manifest })],
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      // Offscreen docs are created at runtime, so crxjs doesn't scan them.
      // Register the page as a build input so Vite compiles offscreen.ts and
      // rewrites the <script> to the bundled JS (otherwise dist ships raw .ts).
      input: {
        offscreen: fileURLToPath(new URL('./src/offscreen/offscreen.html', import.meta.url)),
      },
    },
  },
})
