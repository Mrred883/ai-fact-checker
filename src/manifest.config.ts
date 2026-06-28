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
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
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
  host_permissions: ['https://api.anthropic.com/*'],
  web_accessible_resources: [
    {
      resources: ['icons/*', 'assets/*', 'src/offscreen/offscreen.html'],
      matches: ['<all_urls>'],
    },
  ],
})
