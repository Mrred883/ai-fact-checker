# Deploying AI Fact Checker to the Chrome Web Store

A step-by-step checklist to publish publicly.

## 0. One-time account setup

1. Go to the **Chrome Web Store Developer Dashboard**:
   https://chrome.google.com/webstore/devconsole
2. Sign in with the Google account you want to own the listing.
3. Pay the **one-time $5 registration fee** (required before you can publish).
4. Fill the developer account details (a public contact email is required).

## 1. Host the privacy policy

A privacy policy URL is **mandatory** for this extension (it handles user content
and keys). Easiest free option — GitHub Pages:

1. The policy lives at `store/PRIVACY.md` in the repo.
2. Enable Pages: repo → Settings → Pages → Build from `main` branch.
   The file will be served at:
   `https://Mrred883.github.io/ai-fact-checker/store/PRIVACY.html`
   (or use a Markdown-rendering Pages theme; any public URL that shows the policy
   text is acceptable). Alternatively paste the policy into a public Gist and use
   its URL.
3. Keep that URL — you paste it into the listing's Privacy tab.

## 2. Build and package

From the project root:

```
npm run release
```

This runs the production build and zips `dist/` contents into
`web-store/ai-fact-checker-v<version>.zip`. That zip is what you upload.

> Bump `version` in `package.json` before each new submission — the Web Store
> rejects re-uploads with a version that already exists.

## 3. Capture screenshots

Load the unpacked `dist/` in Chrome (`chrome://extensions` → Developer mode →
Load unpacked → pick `dist/`) and capture 1–5 screenshots at **1280×800** PNG.
Suggested shots are listed in `store/LISTING.md`.

## 4. Create the store listing

In the dashboard: **Add new item** → upload the zip → fill these tabs using
`store/LISTING.md`:

- **Store listing:** name, summary, detailed description, category (Productivity),
  language, screenshots, the 128×128 icon (already in the package).
- **Privacy:** single-purpose statement, every permission justification, the
  data-use disclosures, and the **privacy policy URL** from step 1.
- **Distribution:** Public, all regions (or restrict if you prefer).

## 5. Submit for review

Submit. Review typically takes a few days but can run longer for extensions with
broad host permissions and AI features (this one has both). Watch the developer
email for approval or change requests.

## Likely review friction (prepare for it)

- **Broad `<all_urls>` host access** gets extra scrutiny. The justification in
  `store/LISTING.md` explains it (selection toolbar + page scan, on user action
  only). If reviewers push back, the strongest fix is to switch from a static
  `<all_urls>` content script to **`activeTab` + on-demand injection** so the
  extension only touches a page when the user clicks the action. That is a code
  change, not just a listing edit — do it only if required.
- **Data handling:** be fully honest in the data-use form — the extension sends
  user-chosen content to Anthropic and Deepgram. This is disclosed in the policy
  and listing; matching answers in the form avoids rejection.
- **Name collisions / trademark:** "AI Fact Checker" is generic; if flagged, use
  the "Litmus — AI Fact Checker" fallback name.

## 6. After approval

- The extension goes live at a public URL you can share.
- To ship updates: bump `version`, `npm run release`, upload the new zip, submit
  again (updates re-review, usually faster).
