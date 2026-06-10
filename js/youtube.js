/* ==========================================================================
   YouTube helpers — metadata + direct stream resolution.

   Browsers can't talk to youtube.com's internal player APIs directly (no CORS),
   so this mirrors what the Android app does with NewPipeExtractor by using:
     1. YouTube's public oEmbed endpoint for title/author/thumbnail (CORS-open).
     2. Public Piped API instances (open-source YouTube front-end, CORS-open
        proxies) to resolve a direct, playable video stream + duration.

   Piped instances are community-run and can be slow/offline, so several
   fallbacks are tried in order. If all of them fail, the caller should fall
   back to "Local Video File" mode.
   ========================================================================== */

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://piped-api.lunar.icu",
  "https://api.piped.private.coffee",
  "https://pipedapi.r4fo.com"
];

/** Pull the 11-character video ID out of any common YouTube URL shape. */
function extractVideoId(url) {
  const trimmed = (url || "").trim();
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtube\.com\/live\/|youtu\.be\/)([\w-]{11})/,
    /^([\w-]{11})$/
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Title / uploader / thumbnail via YouTube's public oEmbed endpoint (CORS-enabled). */
async function fetchOEmbedMetadata(url) {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error("Could not load video info. Check the URL or try again.");
  }
  const data = await res.json();
  return {
    title: data.title || "Unknown Video",
    uploader: data.author_name || "Unknown Uploader",
    thumbnailUrl: data.thumbnail_url || ""
  };
}

/** Try each Piped instance until one returns stream info for the given video ID. */
async function fetchPipedStreams(videoId) {
  let lastError = null;
  for (const base of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${base}/streams/${videoId}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("All Piped instances are unreachable.");
}

function streamHeight(stream) {
  const q = stream.quality || stream.resolution || "";
  const m = String(q).match(/(\d+)p/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Mirrors ExtractionRepository.selectBestStream() from the Android app. */
function selectBestStream(streams, maxResolution) {
  const candidates = streams.filter((s) => !!s.url);
  if (candidates.length === 0) return null;

  // Prefer mp4 streams for broad <video>/canvas compatibility.
  const mp4 = candidates.filter((s) => (s.mimeType || s.format || "").toLowerCase().includes("mp4"));
  const pool = mp4.length > 0 ? mp4 : candidates;

  if (maxResolution === "Original") {
    return pool.reduce((best, s) => (streamHeight(s) > streamHeight(best) ? s : best), pool[0]);
  }

  const targetHeight = parseInt(String(maxResolution).replace("p", ""), 10) || 720;
  const filtered = pool.filter((s) => streamHeight(s) > 0 && streamHeight(s) <= targetHeight);

  if (filtered.length > 0) {
    return filtered.reduce((best, s) => (streamHeight(s) > streamHeight(best) ? s : best), filtered[0]);
  }

  // Nothing small enough — fall back to the lowest available.
  return pool.reduce((best, s) => (streamHeight(s) < streamHeight(best) ? s : best), pool[0]);
}

/**
 * Resolve a YouTube URL to metadata + a direct playable stream URL.
 * Returns { videoId, title, uploader, thumbnailUrl, duration, streamUrl }.
 * Throws if the video ID can't be parsed or no instance/stream is available.
 */
async function resolveYouTubeVideo(url, maxResolution) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("That doesn't look like a valid YouTube URL.");
  }

  const data = await fetchPipedStreams(videoId);

  const allStreams = [...(data.videoStreams || [])];
  const stream = selectBestStream(allStreams, maxResolution);
  if (!stream) {
    throw new Error("No playable video stream was found for this video.");
  }

  return {
    videoId,
    title: data.title || "Unknown Video",
    uploader: data.uploader || "Unknown Uploader",
    thumbnailUrl: data.thumbnailUrl || (data.thumbnails && data.thumbnails[0] && data.thumbnails[0].url) || "",
    duration: data.duration || 0,
    streamUrl: stream.url
  };
}
