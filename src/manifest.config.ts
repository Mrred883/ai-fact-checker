import { defineManifest } from '@crxjs/vite-plugin'
import pkg from '../package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'AI Fact Checker',
  version: pkg.version,
  description:
    'Real-time AI fact-checking for live audio and selected text, grounded in live web search via Claude.',
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'AI Fact Checker',
    default_icon: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  },
  options_page: 'src/options/index.html',
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  // A standing content script on every page powers the highlight-to-check
  // selection toolbar consistently across all sites, with no per-tab enable step
  // and no difference between the popup and the side panel.
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
      all_frames: true,
    },
  ],
  permissions: [
    'storage',
    'activeTab',
    'scripting',
    'tabCapture',
    'offscreen',
    'contextMenus',
    'sidePanel',
  ],
  // Read selected/page text on any site the user checks, plus call the Claude API.
  host_permissions: ['<all_urls>'],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; base-uri 'self'",
  },
  web_accessible_resources: [
    {
      resources: ['src/offscreen/offscreen.html'],
      matches: ['<all_urls>'],
    },
  ],
})
