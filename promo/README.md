# Promo video

`etude-ad.mp4` — 20 s vertical (1080×1920, 30 fps) ad for Reels / TikTok / Shorts.

The app footage is the real app, captured frame by frame:

1. `python3 -m http.server 8000` from the repo root (the app), and
   `python3 -m http.server 8001` from this folder after copying
   `marble-background.png` and `favico.png` next to `compose.html`.
2. `node capture-app.mjs` — drives the app with a fake MIDI keyboard, a faked
   clock and seeked CSS animations → `appframes/*.png` + `chords.json`.
3. `python3 audio.py` — synthesizes the soundtrack from `chords.json` → `audio.wav`.
4. `node render.mjs` — renders `compose.html` (titles, phone mockup, CTA) → `frames/*.jpg`.
5. `ffmpeg -framerate 30 -i frames/%04d.jpg -i audio.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart -shortest etude-ad.mp4`

`fontroute.mjs` serves Google Fonts from a local `fonts/` folder (download
`fonts.css` and its woff2 files first) because headless Chromium can't reach
them reliably through the proxy. Needs Playwright, numpy and ffmpeg.
