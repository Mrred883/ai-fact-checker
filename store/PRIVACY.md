# Privacy Policy — AI Fact Checker

_Last updated: 2026-06-25_

AI Fact Checker ("the extension") is a browser extension that fact-checks text,
audio, and uploaded files using AI services you connect with your own API keys.
This policy explains exactly what data the extension handles and where it goes.

## Summary

- The extension has **no backend server of its own**. Nothing is sent to the
  developer.
- Your API keys and your check history are stored **locally in your browser**
  and never leave your device except to call the AI providers you configured.
- Content you choose to check (selected text, page text, tab audio, uploaded
  files, pasted comments) is sent **directly from your browser** to the
  third-party AI providers listed below, only when you trigger a check.

## What the extension stores locally

Stored with `chrome.storage.local` on your device only:

- **Your API keys** (Anthropic Claude key, and optionally a Deepgram key).
- **Settings** (model choice, sensitivity, language, theme, etc.).
- **Check history** — the claims, verdicts, and uploaded assets you have
  checked, so you can review them in the popup.

You can clear history and remove assets from within the extension at any time.
Uninstalling the extension removes all of this local data.

## What the extension sends to third parties

The extension transmits data **only when you actively start a check**, and only
to the providers below, using the keys you supply:

### Anthropic (Claude API) — required

- **What is sent:** the text you select or scan, transcripts of tab audio you
  choose to check, the contents of files you upload (PDFs, images, text), and
  comments you paste for sentiment analysis.
- **Why:** to extract claims, verify them with web search, analyze sentiment,
  and assess AI origin.
- **Endpoint:** `https://api.anthropic.com`
- Governed by Anthropic's privacy policy: https://www.anthropic.com/legal/privacy

### Deepgram (speech-to-text) — optional, only if you enable live audio

- **What is sent:** audio captured from the browser tab you choose to listen to.
- **Why:** to transcribe spoken audio so it can be fact-checked.
- **Endpoint:** `wss://api.deepgram.com`
- Governed by Deepgram's privacy policy: https://deepgram.com/privacy

The extension does not send your content to any other party, and the developer
never receives it.

## Web search

When Claude verifies a claim it may perform web searches on Anthropic's
infrastructure (server-side tool). The extension itself does not run searches or
contact search engines directly.

## Permissions and why they are needed

- **storage** — save your keys, settings, and history locally.
- **activeTab / scripting** — read the current page's text when you ask to scan
  or check a selection.
- **tabCapture / offscreen** — capture the audio of a tab you choose, for live
  fact-checking.
- **contextMenus** — add the right-click "Fact-check selection" action.
- **sidePanel** — show the UI in a docked side panel.
- **activeTab + scripting** — inject the selection toolbar and read page or
  selected text into the current tab only, and only when you click to scan,
  enable highlight-to-check, or use the right-click action. The extension has no
  standing access to any website.
- **Host access to `api.anthropic.com`** — to call the Claude API. This is the
  only host the extension can reach.

## Data retention

The developer retains nothing. Local data persists on your device until you
clear it or uninstall. Data sent to Anthropic and Deepgram is handled per their
respective policies.

## Children

The extension is not directed to children under 13.

## Changes

This policy may be updated; the date at the top reflects the latest version.

## Contact

For questions about this policy, open an issue at:
https://github.com/Mrred883/ai-fact-checker
