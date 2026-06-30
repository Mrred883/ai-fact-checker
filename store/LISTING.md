# Chrome Web Store Listing — AI Fact Checker

Copy/paste these into the Web Store Developer Dashboard fields.

---

## Name (≤45 chars)
```
AI Fact Checker
```
> If "AI Fact Checker" is taken or flagged as too generic, use:
> `Litmus — AI Fact Checker`

## Summary / short description (≤132 chars)
```
Fact-check text, live video audio, and uploaded files in real time using Claude with web search. Bring your own API key.
```

## Category
```
Productivity
```

## Language
```
English
```

---

## Detailed description

```
AI Fact Checker verifies claims in real time using Claude with grounded web
search — and runs entirely from your browser with your own API key. Nothing is
routed through a third-party server we control.

WHAT IT CHECKS
• Selected text — highlight any passage and check it from the toolbar or the
  right-click menu.
• Whole pages — scan an article and verify its claims, with an on-page scanning
  animation while it works.
• Live audio — capture the audio of a YouTube or any video tab, transcribe it,
  and fact-check spoken claims as they happen.
• Uploaded files — drop in PDFs, images, or text to verify the claims they make
  or ask questions grounded in them.

HOW IT SHOWS RESULTS
• Every verdict sits on a false-to-true "litmus" scale, with a confidence
  reading and cited sources.
• False or misleading claims come with "the accurate fact" so you leave with the
  correct information.
• Ask follow-up questions about any verdict, right on the card.
• Verdicts stream in one at a time as each claim resolves.

MORE TOOLS
• Sentiment analysis — paste comments, tweets, or reviews and read the crowd's
  mood, the positive/negative/neutral split, and what's driving it.
• AI-origin detection — check whether an image or document is AI-generated,
  using verifiable C2PA Content Credentials and metadata where present, with an
  honest "likelihood, not proof" read otherwise.
• Docked side panel — keep the UI open beside the page while you watch a video.

BRING YOUR OWN KEY
You connect your own Anthropic Claude API key (and an optional Deepgram key for
live audio). Keys and history are stored only in your browser. You control what
gets checked and when.

PRIVACY
Content you choose to check is sent directly from your browser to the AI
providers you configure (Anthropic, and Deepgram for audio) — never to us. See
the privacy policy for full details.
```

---

## Privacy practices (Dashboard → Privacy tab)

**Single purpose (required):**
```
AI Fact Checker verifies the factual accuracy of text, audio, and files the user
chooses to check, using the user's own AI API key.
```

**Permission justifications:**

- `storage` —
  ```
  Stores the user's API keys, settings, and fact-check history locally on their device.
  ```
- `activeTab` & `scripting` —
  ```
  Injects the fact-check selection toolbar and reads page or selected text only into the current tab, and only when the user clicks to scan, enable highlight-to-check, or use the right-click action. The extension has no standing access to any site and never runs on a page unprompted.
  ```
- `tabCapture` & `offscreen` —
  ```
  Captures audio from a tab the user explicitly chooses, so spoken claims can be transcribed and fact-checked. No audio is captured without the user starting it.
  ```
- `contextMenus` —
  ```
  Adds a right-click "Fact-check selection" action.
  ```
- `sidePanel` —
  ```
  Shows the extension UI in a docked side panel so it stays open while the user interacts with the page.
  ```
- Host permission `https://api.anthropic.com/*` —
  ```
  Calls the Claude API to perform fact-checking. This is the only host the extension is granted; it has no broad host access.
  ```

**Remote code:** No — all code is bundled in the package.

**Data usage disclosures (check these):**
- Collects "Website content" — YES (text/audio/files the user checks).
- Purpose: "App functionality" only.
- Is the data sold to third parties? NO.
- Is the data used for purposes unrelated to the core function? NO.
- Is the data used for creditworthiness / lending? NO.

**Disclosure to add in the data-use notes:**
```
Content the user chooses to check (selected text, page text, tab audio,
uploaded files, pasted comments) is transmitted directly from the user's browser
to third-party AI providers — Anthropic (api.anthropic.com) and, only for live
audio, Deepgram (api.deepgram.com) — using the user's own API keys, solely to
return fact-check, sentiment, or origin results. No user content is sent to the
developer.
```

**Privacy policy URL:** host `store/PRIVACY.md` (see DEPLOY.md) and paste the URL here.
```

---

## Screenshots to capture (1280×800 PNG, 1–5)

1. Popup feed with a few verdict cards (mix of TRUE / FALSE / MISLEADING).
2. A FALSE card expanded showing "the accurate fact" + a follow-up question.
3. Live audio: side panel open over a video, transcript + audio verdicts.
4. Assets tab: an uploaded image with the AI-origin meter / Content Credentials.
5. Sentiment tab: a result card.

> A 440×280 small promo tile is optional but helps. Use the litmus mark on the
> paper background.
