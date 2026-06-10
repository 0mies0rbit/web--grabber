# FrameGrabber Web

A static, browser-based port of the **FrameGrabber** Android app. Paste a YouTube
link or pick a local video file, configure an extraction interval (or scene-change
detection), and grab JPEG screenshots straight to an in-browser gallery you can
preview, share, delete, or download as a ZIP.

Everything runs client-side — no build step, no server, no uploads. It can be
hosted directly on **GitHub Pages**.

## Features (matching the Android app)

- **Single video or batch mode** — one YouTube URL / video file, or several local
  files processed back-to-back.
- **Interval extraction** — grab a frame every N seconds or minutes.
- **Scene-change detection** — same 16×16 color-diff algorithm as the app; grabs
  a frame whenever the picture changes by more than a configurable threshold.
- **Time range selection** — drag a dual-handle slider to limit extraction to part
  of the video.
- **Custom filename pattern** — `{title}`, `{timestamp}`, `{index}` placeholders.
- **Quality & resolution caps** — JPEG quality % and max output resolution
  (Original / 1080p / 720p / 480p / 360p), set in Settings.
- **Gallery** — extracted frames are stored in IndexedDB, grouped by "Output
  Folder", with full-screen preview, share/save, delete, and "Download ZIP".
- **Dark mode** — same indigo/violet (light) and obsidian/slate (dark) theme as
  the app, persisted in `localStorage`.

## Hosting on GitHub Pages

1. Push this folder to a GitHub repository (the `index.html` must be at the
   repo root, or in `/docs` if you configure Pages that way).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick your
   branch (e.g. `main`) and the `/ (root)` folder.
4. Save — GitHub will publish the site at
   `https://<your-username>.github.io/<repo-name>/`.

No build tools, npm install, or secrets are required.

## How frame extraction works

- **Local Video File mode** is fully reliable: the chosen file is loaded into a
  hidden `<video>` element and frames are captured with `<canvas>` — entirely
  on-device, with no network access at all.

- **YouTube URL mode** first fetches title/channel/thumbnail via YouTube's public
  oEmbed endpoint, then tries to resolve a direct, playable stream + duration
  through public [Piped](https://github.com/TeamPiped/Piped) API instances (an
  open-source YouTube front-end whose proxies serve CORS-friendly stream URLs —
  this is the closest browser equivalent of the NewPipe extractor used by the
  Android app).

  Because this depends on free, community-run proxy instances, it can
  occasionally be slow, rate-limited, or briefly offline. If it fails, the app
  still shows the video's title/thumbnail and suggests downloading the video and
  switching to **Local Video File** mode, which always works.

## Project structure

```
index.html        Single-page app shell (Home / Processing / Gallery / Settings)
css/styles.css     Theme + layout (light & dark)
js/db.js           IndexedDB-backed gallery storage
js/extractor.js    Frame extraction engine (interval & scene-change)
js/youtube.js      oEmbed metadata + Piped stream resolution
js/main.js         App state, UI wiring, navigation
```

## Browser support

Requires a modern browser with support for `<canvas>.toBlob`, IndexedDB, and
ES2020+ JavaScript (recent Chrome, Edge, Firefox, Safari).
