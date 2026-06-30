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
  // No static content script and no broad host access. The selection toolbar is
  // injected on demand into the active tab only when the user enables it, via
  // activeTab + scripting (see background `armTab`). The extension never touches
  // a page unprompted, so it needs no <all_urls> host permission.
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
  // Block injected/remote code and eval in our own pages — defends the API key
  // against script-injection theft and satisfies Web Store review.
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; base-uri 'self'",
  },
  // Only the offscreen doc needs to be web-accessible. The content script is
  // injected via scripting.executeScript({ files }) on user action, so it does
  // NOT need to be web-accessible — keeping the page's reach to our files minimal.
  web_accessible_resources: [
    {
      resources: ['src/offscreen/offscreen.html'],
      matches: ['<all_urls>'],
    },
  ],
})
