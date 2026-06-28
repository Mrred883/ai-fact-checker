# AI Fact Checker (Chrome Extension)

Real-time, web-grounded fact-checking in your browser. Highlight text, scan an article, or
listen to live audio - AI Fact Checker extracts the factual claims, verifies each one with **Claude +
live web search**, and shows a verdict with citations.

Inspired by [intruth-factcheck](https://github.com/rpanigrahi222/intruth-factcheck), rebuilt on a
modern stack (React + TypeScript + Tailwind + Vite, Manifest V3) with grounded web search and a
polished UI.

## Features

- **Selected text** - highlight anything → click the floating *Fact-check* pill, or right-click →
  *Fact-check with AI Fact Checker*.
- **Whole-page scan** - one click in the popup checks the article you're reading.
- **Live audio** - transcribes speech via the Web Speech API and fact-checks claims as they're said.
- **Grounded verdicts** - every non-trivial claim is checked against live web sources via Claude's
  server-side `web_search` tool; cards link the sources used.
- **5 verdict levels** - True · Mostly True · Misleading · False · Unverifiable, each with a
  confidence score.
- **Private** - your Claude API key lives in local browser storage and calls Anthropic directly.
  No backend, no telemetry.
- Beautiful glassy overlay (isolated Shadow DOM), light/dark themes, tunable sensitivity & search depth.

## Verdict levels

| Verdict | Meaning |
|---|---|
| **TRUE** | Accurate and well supported. |
| **SUBSTANTIALLY_TRUE** | Core point correct; minor imprecision. |
| **MISLEADING** | Technically defensible but creates a false impression. |
| **FALSE** | Contradicted by the evidence. |
| **UNVERIFIABLE** | Opinion/prediction or no reliable data. |

## Prerequisites

- **Node.js 18+** (for the build) - https://nodejs.org
- **A Claude API key** - https://console.anthropic.com/settings/keys
- Google Chrome / Edge (Manifest V3)

## Build & install

```bash
npm install
npm run build      # outputs ./dist
```

Then load it:

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. **Load unpacked** → select the `dist/` folder
4. Open the AI Fact Checker popup → ⚙ settings → paste your Claude API key → **Test**

Dev mode with hot reload: `npm run dev` (then Load unpacked the generated `dist/`).

## Usage

- **Highlight** text on any page → click the *Fact-check* pill that appears.
- **Right-click** a selection → *Fact-check "…" with AI Fact Checker*.
- **Scan page** button in the popup → checks the main article text.
- **Listen** button → live mic transcription + fact-check. First grant mic access in settings.

## Architecture

```
popup        control panel - listen / scan / recent verdicts
options      API key, model, sensitivity, search depth, theme, mic grant
background   service worker - owns ALL Claude calls, context menu, offscreen lifecycle,
             transcript buffering, verdict broadcast  (extension origin → no page CSP/CORS issues)
content      Shadow-DOM overlay + selection toolbar + auto-scan (CSS fully isolated)
offscreen    Web Speech recognizer (mic) for live audio
lib          anthropic (web_search client) · factcheck (prompts + JSON parse) · storage · messaging
```

The `web_search` tool is **server-side** - Anthropic runs the searches and returns the grounded
answer with citations in a single request, so there's no client-side tool loop.

## Live-audio note

The Web Speech API transcribes the **microphone**, not raw tab audio. To fact-check audio playing in
a tab, play it through your speakers so the mic can hear it. True silent tab-audio capture requires a
cloud transcription service (Deepgram/Whisper) - the recognizer is written behind a pluggable
interface so that can be added later.

## Disclaimer

Automated fact-checking is imperfect. Verdicts can be wrong or based on outdated sources. Always
verify anything important yourself.
