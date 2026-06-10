/* ==========================================================================
   FrameExtractor — core frame-grabbing engine.
   Re-implements ExtractionWorker.kt in the browser using <video> + <canvas>:
     - Interval-based extraction (every N seconds/minutes within a range)
     - Scene-change detection (16x16 downscale color-diff, same threshold math)
     - Resolution capping & JPEG quality, same as the Android worker
     - {title} / {timestamp} / {index} filename pattern placeholders
   ========================================================================== */

class CancelledError extends Error {
  constructor() {
    super("Extraction cancelled by user.");
    this.name = "CancelledError";
  }
}

function pad2(n) {
  return String(Math.floor(n)).padStart(2, "0");
}

/** "H:MM:SS" or "MM:SS" — for on-screen display */
function formatSeconds(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

/** "HH_MM_SS" — for filenames */
function formatSecondsToFileName(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad2(h)}_${pad2(m)}_${pad2(s)}`;
}

/** "Mm Ss" / "Ss" — for ETA display */
function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function getTargetHeight(maxResolution, originalHeight) {
  if (maxResolution === "Original") return originalHeight;
  const clean = parseInt(String(maxResolution).replace("p", ""), 10);
  return Number.isFinite(clean) && clean > 0 ? clean : originalHeight;
}

function generateFilename(pattern, title, index, timestampSeconds) {
  const cleanTitle = (title || "video").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30) || "video";
  const timeFormatted = formatSecondsToFileName(timestampSeconds);
  const safePattern = pattern && pattern.trim() ? pattern : "{title}_frame_{timestamp}";
  return safePattern
    .replace(/\{title\}/g, cleanTitle)
    .replace(/\{timestamp\}/g, timeFormatted)
    .replace(/\{index\}/g, String(index).padStart(4, "0")) + ".jpg";
}

class FrameExtractor {
  /**
   * @param {HTMLVideoElement} video - video element already loaded with metadata
   * @param {object} config - extraction configuration (see main.js for shape)
   * @param {(progress: object) => void} onProgress
   */
  constructor(video, config, onProgress) {
    this.video = video;
    this.config = config;
    this.onProgress = onProgress || (() => {});
    this.cancelled = false;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  cancel() {
    this.cancelled = true;
  }

  computeDims() {
    const originalWidth = this.video.videoWidth || 1280;
    const originalHeight = this.video.videoHeight || 720;
    const cappedHeight = getTargetHeight(this.config.maxResolution, originalHeight);

    let targetWidth, targetHeight;
    if (cappedHeight < originalHeight) {
      const ratio = originalWidth / originalHeight;
      targetHeight = cappedHeight;
      targetWidth = Math.round(targetHeight * ratio);
    } else {
      targetWidth = originalWidth;
      targetHeight = originalHeight;
    }
    this.dims = { targetWidth, targetHeight, originalWidth, originalHeight };
  }

  /** Seek the source video to `time` seconds and wait for the frame to be ready. */
  seekTo(time) {
    const video = this.video;
    const clamped = Math.min(Math.max(time, 0), Math.max(video.duration - 0.05, 0));
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener("seeked", onSeeked);
        clearTimeout(timer);
        // Two rAFs to make sure the new frame has actually been painted/decoded.
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      };
      const onSeeked = () => finish();
      // Safety net in case 'seeked' doesn't fire (e.g. seeking to current position).
      const timer = setTimeout(finish, 1500);

      video.addEventListener("seeked", onSeeked);
      try {
        video.currentTime = clamped;
      } catch (e) {
        finish();
      }
    });
  }

  /** Draw the current video frame to the canvas and return a JPEG blob. */
  captureFrame() {
    const { targetWidth, targetHeight } = this.dims;
    this.canvas.width = targetWidth;
    this.canvas.height = targetHeight;
    this.ctx.drawImage(this.video, 0, 0, targetWidth, targetHeight);

    const quality = Math.min(Math.max(this.config.qualityPercentage, 1), 100) / 100;
    return new Promise((resolve, reject) => {
      try {
        this.canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to encode frame as JPEG."));
              return;
            }
            resolve(blob);
          },
          "image/jpeg",
          quality
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  /** Run extraction according to config.isSceneChangeMode. Returns array of {blob, name, timestamp}. */
  async run() {
    this.computeDims();
    if (this.config.isSceneChangeMode) {
      return this.runSceneChange();
    }
    return this.runInterval();
  }

  async runInterval() {
    const duration = this.config.durationSeconds;
    const start = Math.max(0, this.config.timeRangeStartSeconds || 0);
    const end = this.config.timeRangeEndSeconds > 0 ? this.config.timeRangeEndSeconds : duration;
    const interval = this.config.interval > 0 ? this.config.interval : 10;
    const intervalSeconds = this.config.unit === "Minutes" ? interval * 60 : interval;

    const timestamps = [];
    for (let t = start; t <= end; t += intervalSeconds) timestamps.push(t);

    if (timestamps.length === 0) {
      throw new Error("No timestamps to extract in the selected range.");
    }

    const totalFrames = timestamps.length;
    const startTimeMs = Date.now();
    const results = [];

    for (let index = 0; index < timestamps.length; index++) {
      if (this.cancelled) throw new CancelledError();

      const timestamp = timestamps[index];
      this.onProgress({
        status: `Extracting frame at ${formatSeconds(timestamp)}...`,
        completedFrames: index,
        totalFrames,
        currentTimestamp: formatSeconds(timestamp)
      });

      await this.seekTo(timestamp);
      if (this.cancelled) throw new CancelledError();

      const blob = await this.captureFrame();
      const name = generateFilename(this.config.filenamePattern, this.config.videoTitle, index + 1, timestamp);
      results.push({ blob, name, timestamp });

      const elapsedMs = Date.now() - startTimeMs;
      const avgPerFrame = elapsedMs / (index + 1);
      const remainingFrames = totalFrames - (index + 1);
      const estimatedRemainingSeconds = Math.round((avgPerFrame * remainingFrames) / 1000);

      this.onProgress({
        status: "Extracting frames...",
        completedFrames: index + 1,
        totalFrames,
        estimatedRemainingSeconds,
        currentTimestamp: formatSeconds(timestamp)
      });
    }

    return results;
  }

  async runSceneChange() {
    const duration = this.config.durationSeconds;
    const start = Math.max(0, this.config.timeRangeStartSeconds || 0);
    const end = this.config.timeRangeEndSeconds > 0 ? this.config.timeRangeEndSeconds : duration;
    const threshold = this.config.sceneChangeThreshold;

    const small = document.createElement("canvas");
    small.width = 16;
    small.height = 16;
    const smallCtx = small.getContext("2d", { willReadFrequently: true });

    let prevData = null;
    let frameIndex = 1;
    const results = [];

    for (let timestamp = start; timestamp <= end; timestamp += 1) {
      if (this.cancelled) throw new CancelledError();

      this.onProgress({
        status: `Scanning scene cuts at ${formatSeconds(timestamp)}...`,
        completedFrames: frameIndex - 1,
        totalFrames: -1,
        currentTimestamp: formatSeconds(timestamp)
      });

      await this.seekTo(timestamp);
      if (this.cancelled) throw new CancelledError();

      smallCtx.drawImage(this.video, 0, 0, 16, 16);
      const currentData = smallCtx.getImageData(0, 0, 16, 16).data;

      let saveFrame = false;
      if (prevData) {
        let diff = 0;
        for (let i = 0; i < currentData.length; i += 4) {
          diff += Math.abs(prevData[i] - currentData[i]);
          diff += Math.abs(prevData[i + 1] - currentData[i + 1]);
          diff += Math.abs(prevData[i + 2] - currentData[i + 2]);
        }
        const averageDiff = diff / (16 * 16 * 3 * 255);
        if (averageDiff > threshold) saveFrame = true;
      } else {
        // First frame in the range is always captured.
        saveFrame = true;
      }

      if (saveFrame) {
        const blob = await this.captureFrame();
        const name = generateFilename(this.config.filenamePattern, this.config.videoTitle, frameIndex, timestamp);
        results.push({ blob, name, timestamp });
        frameIndex++;
      }

      prevData = currentData;

      this.onProgress({
        status: "Extracting frames...",
        completedFrames: frameIndex - 1,
        totalFrames: -1,
        currentTimestamp: formatSeconds(timestamp)
      });
    }

    return results;
  }
}
