# Screenshots — how to make them

You need 1–5 PNGs at **exactly 1280×800**. Here's how to get clean, populated,
convincing shots.

## Tools in this folder
- `screenshot-framer.html` — open in a browser, drop in a raw popup/panel
  screenshot, and it frames it on a branded 1280×800 canvas with a headline you
  edit per shot. Download the PNG. (If the in-browser export is blocked by canvas
  tainting, just OS-screenshot the framed preview — it's already the exact size.)

## Seed content — paste these to populate the UI before capturing

The goal is a visible mix of TRUE / MISLEADING / FALSE so the verdict scale
shows its full range. Load `dist/` unpacked, add your key, then:

### For the Feed (text checks) — paste this into a page and check it
Open any blank editable page (or a Google Doc / notepad site), paste the block,
highlight it, and use "Fact-check selection" — or use Scan page on an article.
These claims reliably produce a spread:

```
The Great Wall of China is visible from the Moon with the naked eye.
Water boils at 100 degrees Celsius at sea level.
Humans use only 10 percent of their brains.
The Eiffel Tower was completed in 1889.
Mount Everest is the tallest mountain on Earth measured from sea level.
```

Expected spread: "visible from the Moon" → FALSE, "10 percent of brains" →
FALSE, "boils at 100°C" → TRUE, "Eiffel Tower 1889" → TRUE, "Everest tallest
from sea level" → SUBSTANTIALLY_TRUE (nuance vs. base-to-peak). Good range of
colors on the scale, plus a "the accurate fact" block on the false ones.

### For the "accurate fact" + Ask shot
After the false "visible from the Moon" card appears, expand it and type a
follow-up like:
```
So what can actually be seen from space?
```
Screenshot the card with the correction block + the answer.

### For Sentiment tab — paste as the comments
Subject field: `New phone launch`
Comments:
```
Battery life is incredible, easily lasts two days.
Camera is a huge upgrade, low-light shots are stunning.
Way too expensive for what you get.
Mine overheats while charging, kind of worried.
Honestly the best phone I've owned in years.
Screen is gorgeous but it's so slippery without a case.
Customer support was useless when I had an issue.
```
Gives a clear mixed read with positive + negative themes.

### For Assets / AI-origin shot
Upload an image and click **Origin**. For the strongest shot, use an image that
carries C2PA Content Credentials (e.g. an export from Adobe Firefly or a DALL·E
download) so the "Content Credentials found" banner shows. Otherwise any image
works and shows the heuristic likelihood meter.

### For Live audio shot
Open a YouTube clip with spoken factual claims (a news or explainer clip), hit
**Listen**, let the side panel dock, play the video, and capture once a
transcript line + an audio verdict are visible.

## The 5 shots to produce (with suggested headlines for the framer)

1. **Feed with the verdict spread** — headline: `Know what's true, as you read.`
2. **False card + "the accurate fact" + a follow-up answer** — headline:
   `Wrong claims come with the correct one.`
3. **Side panel over a video, live transcript + audio verdict** — headline:
   `Fact-check any video while it plays.`
4. **Assets tab, AI-origin meter / Content Credentials** — headline:
   `Is it real, or AI-made?`
5. **Sentiment result card** — headline: `Read the room in seconds.`

## Capturing the raw popup

- The popup is ~380px wide. Open it, get the state you want, then screenshot just
  the popup (on Windows: `Win+Shift+S`, drag around the popup).
- Or use the **side panel** for taller shots — it shows more at once and frames
  nicely.
- Drop each raw shot into `screenshot-framer.html`, set the headline, download.

Upload the 5 PNGs in the Store listing's Screenshots section.
```
