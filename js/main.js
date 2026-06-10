/* ==========================================================================
   FrameGrabber Web — main application logic
   ========================================================================== */

const SETTINGS_KEY = "framegrabber_settings";

const DEFAULT_SETTINGS = {
  defaultInterval: 10,
  defaultQuality: 85,
  defaultResolution: "720p",
  darkMode: true
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

const settings = loadSettings();

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
const state = {
  mode: "youtube", // "youtube" | "file"
  youtube: null,   // { videoId, title, uploader, thumbnailUrl, duration, streamUrl, sourceUrl }
  files: [],       // [{ file, title, duration, objectUrl }]
  rangeStart: 0,
  rangeEnd: 0,
  duration: 0,
  galleryFolder: null,
  galleryItems: [],
  previewItem: null
};

// ---------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const el = {
  navItems: document.querySelectorAll(".nav-item"),
  bottomNav: $("bottom-nav"),
  views: {
    home: $("view-home"),
    processing: $("view-processing"),
    gallery: $("view-gallery"),
    settings: $("view-settings")
  },

  modeYoutubeBtn: $("mode-youtube-btn"),
  modeFileBtn: $("mode-file-btn"),
  youtubeCard: $("youtube-input-card"),
  fileCard: $("file-input-card"),

  youtubeUrl: $("youtube-url"),
  loadVideoBtn: $("load-video-btn"),
  loadBtnIcon: $("load-btn-icon"),
  loadBtnSpinner: $("load-btn-spinner"),
  youtubeError: $("youtube-error"),
  youtubeWarning: $("youtube-warning"),
  metadataCard: $("metadata-card"),
  metaThumb: $("meta-thumb"),
  metaTitle: $("meta-title"),
  metaChannel: $("meta-channel"),
  metaDuration: $("meta-duration"),

  fileDropZone: $("file-drop-zone"),
  fileInput: $("video-file-input"),
  fileDropLabel: $("file-drop-label"),
  fileMetadataList: $("file-metadata-list"),

  rangeCard: $("range-card"),
  rangeStartLabel: $("range-start-label"),
  rangeEndLabel: $("range-end-label"),
  rangeStartInput: $("range-start"),
  rangeEndInput: $("range-end"),
  dualRangeFill: $("dual-range-fill"),
  rangeMultiHint: $("range-multi-hint"),

  intervalRow: $("interval-row"),
  intervalInput: $("interval-input"),
  unitSelect: $("unit-select"),
  outputFolder: $("output-folder"),

  advancedToggle: $("advanced-toggle"),
  advancedArrow: $("advanced-arrow"),
  advancedContent: $("advanced-content"),
  filenamePattern: $("filename-pattern"),
  sceneChangeToggle: $("scene-change-toggle"),
  sceneThresholdField: $("scene-threshold-field"),
  sceneThreshold: $("scene-threshold"),
  sceneThresholdValue: $("scene-threshold-value"),

  startError: $("start-error"),
  startBtn: $("start-btn"),
  startBtnLabel: $("start-btn-label"),

  processingProgressCard: $("processing-progress-card"),
  procThumb: $("proc-thumb"),
  procVideoLabel: $("proc-video-label"),
  procProgressFill: $("proc-progress-fill"),
  procPercent: $("proc-percent"),
  procFrames: $("proc-frames"),
  procTimestamp: $("proc-timestamp"),
  procEtaRow: $("proc-eta-row"),
  procEta: $("proc-eta"),
  procStatus: $("proc-status"),
  cancelBtn: $("cancel-btn"),
  procResultCard: $("proc-result-card"),
  procResultIcon: $("proc-result-icon"),
  procResultTitle: $("proc-result-title"),
  procResultDesc: $("proc-result-desc"),
  procPrimaryBtn: $("proc-primary-btn"),
  procSecondaryBtn: $("proc-secondary-btn"),

  galleryFolders: $("gallery-folders"),
  galleryActions: $("gallery-actions"),
  downloadZipBtn: $("download-zip-btn"),
  clearGalleryBtn: $("clear-gallery-btn"),
  galleryEmpty: $("gallery-empty"),
  galleryGrid: $("gallery-grid"),

  intervalMinus: $("interval-minus"),
  intervalPlus: $("interval-plus"),
  defaultIntervalValue: $("default-interval-value"),
  defaultQuality: $("default-quality"),
  defaultQualityValue: $("default-quality-value"),
  defaultResolution: $("default-resolution"),
  darkModeToggle: $("dark-mode-toggle"),

  sourceVideo: $("source-video"),

  previewModal: $("preview-modal"),
  modalBackdrop: $("modal-backdrop"),
  previewImg: $("preview-img"),
  previewName: $("preview-name"),
  previewFolder: $("preview-folder"),
  previewSize: $("preview-size"),
  previewShareBtn: $("preview-share-btn"),
  previewDeleteBtn: $("preview-delete-btn"),
  previewCloseBtn: $("preview-close-btn"),

  toast: $("toast"),

  storageBanner: $("storage-banner"),
  storageBannerClose: $("storage-banner-close")
};

el.storageBannerClose.addEventListener("click", () => {
  el.storageBanner.classList.add("hidden");
});

// ---------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------
let toastTimer = null;
function showToast(message, duration = 2500) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), duration);
}

// ---------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------
function formatBytes(bytes) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------
function showView(name) {
  Object.entries(el.views).forEach(([key, section]) => {
    section.classList.toggle("active", key === name);
  });
  el.bottomNav.classList.toggle("hidden", name === "processing");
  el.navItems.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === name));

  if (name === "gallery") refreshGallery();
}

el.navItems.forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

// ---------------------------------------------------------------------
// Theme & Settings view
// ---------------------------------------------------------------------
function applyTheme() {
  document.body.classList.toggle("dark", settings.darkMode);
  el.darkModeToggle.checked = settings.darkMode;
}

function applySettingsToUI() {
  el.defaultIntervalValue.textContent = `${settings.defaultInterval} s`;
  el.defaultQuality.value = settings.defaultQuality;
  el.defaultQualityValue.textContent = `${settings.defaultQuality}%`;
  el.defaultResolution.value = settings.defaultResolution;
  applyTheme();
}

el.darkModeToggle.addEventListener("change", () => {
  settings.darkMode = el.darkModeToggle.checked;
  saveSettings(settings);
  applyTheme();
});

el.intervalMinus.addEventListener("click", () => {
  if (settings.defaultInterval > 1) {
    settings.defaultInterval -= 1;
    el.defaultIntervalValue.textContent = `${settings.defaultInterval} s`;
    saveSettings(settings);
  }
});

el.intervalPlus.addEventListener("click", () => {
  settings.defaultInterval += 1;
  el.defaultIntervalValue.textContent = `${settings.defaultInterval} s`;
  saveSettings(settings);
});

el.defaultQuality.addEventListener("input", () => {
  settings.defaultQuality = parseInt(el.defaultQuality.value, 10);
  el.defaultQualityValue.textContent = `${settings.defaultQuality}%`;
  saveSettings(settings);
});

el.defaultResolution.addEventListener("change", () => {
  settings.defaultResolution = el.defaultResolution.value;
  saveSettings(settings);
});

// ---------------------------------------------------------------------
// Mode switching (YouTube URL vs Local File)
// ---------------------------------------------------------------------
function setMode(mode) {
  state.mode = mode;
  el.modeYoutubeBtn.classList.toggle("active", mode === "youtube");
  el.modeFileBtn.classList.toggle("active", mode === "file");
  el.youtubeCard.classList.toggle("hidden", mode !== "youtube");
  el.fileCard.classList.toggle("hidden", mode !== "file");
  el.startBtnLabel.textContent = mode === "file" && state.files.length > 1
    ? "Start Batch Extraction"
    : "Start Grabbing Frames";
  updateRangeCard();
}

el.modeYoutubeBtn.addEventListener("click", () => setMode("youtube"));
el.modeFileBtn.addEventListener("click", () => setMode("file"));

// ---------------------------------------------------------------------
// Advanced section
// ---------------------------------------------------------------------
el.advancedToggle.addEventListener("click", () => {
  const isHidden = el.advancedContent.classList.toggle("hidden");
  el.advancedArrow.classList.toggle("open", !isHidden);
});

el.sceneChangeToggle.addEventListener("change", () => {
  const enabled = el.sceneChangeToggle.checked;
  el.sceneThresholdField.classList.toggle("hidden", !enabled);
  el.intervalRow.classList.toggle("hidden", enabled);
});

el.sceneThreshold.addEventListener("input", () => {
  el.sceneThresholdValue.textContent = parseFloat(el.sceneThreshold.value).toFixed(2);
});

// ---------------------------------------------------------------------
// Time range slider
// ---------------------------------------------------------------------
function updateRangeCard() {
  const showRange = state.duration > 0 && (state.mode === "youtube" ? !!state.youtube : state.files.length === 1);
  el.rangeCard.classList.toggle("hidden", !showRange);
  el.rangeMultiHint.classList.toggle("hidden", !(state.mode === "file" && state.files.length > 1));
}

function setupRangeSlider(durationSeconds) {
  state.duration = durationSeconds || 0;
  state.rangeStart = 0;
  state.rangeEnd = state.duration;
  const max = Math.max(1, Math.floor(state.duration));
  el.rangeStartInput.min = 0;
  el.rangeStartInput.max = max;
  el.rangeStartInput.value = 0;
  el.rangeEndInput.min = 0;
  el.rangeEndInput.max = max;
  el.rangeEndInput.value = max;
  renderRangeLabels();
  updateRangeCard();
}

function renderRangeLabels() {
  el.rangeStartLabel.textContent = `Start: ${formatSeconds(state.rangeStart)}`;
  el.rangeEndLabel.textContent = `End: ${formatSeconds(state.rangeEnd)}`;
  const max = Math.max(1, Math.floor(state.duration));
  const startPct = (state.rangeStart / max) * 100;
  const endPct = (state.rangeEnd / max) * 100;
  el.dualRangeFill.style.left = `${startPct}%`;
  el.dualRangeFill.style.width = `${Math.max(0, endPct - startPct)}%`;
}

el.rangeStartInput.addEventListener("input", () => {
  let start = parseInt(el.rangeStartInput.value, 10);
  let end = parseInt(el.rangeEndInput.value, 10);
  if (start > end) {
    start = end;
    el.rangeStartInput.value = start;
  }
  state.rangeStart = start;
  renderRangeLabels();
});

el.rangeEndInput.addEventListener("input", () => {
  let start = parseInt(el.rangeStartInput.value, 10);
  let end = parseInt(el.rangeEndInput.value, 10);
  if (end < start) {
    end = start;
    el.rangeEndInput.value = end;
  }
  state.rangeEnd = end;
  renderRangeLabels();
});

// ---------------------------------------------------------------------
// YouTube URL loading
// ---------------------------------------------------------------------
function setLoadingState(isLoading) {
  el.loadVideoBtn.disabled = isLoading;
  el.loadBtnIcon.classList.toggle("hidden", isLoading);
  el.loadBtnSpinner.classList.toggle("hidden", !isLoading);
}

function showYoutubeError(message) {
  el.youtubeError.textContent = message || "";
  el.youtubeError.classList.toggle("hidden", !message);
}

function showYoutubeWarning(message) {
  el.youtubeWarning.textContent = message || "";
  el.youtubeWarning.classList.toggle("hidden", !message);
}

function renderMetadataCard(meta) {
  el.metaThumb.src = meta.thumbnailUrl || "";
  el.metaTitle.textContent = meta.title;
  el.metaChannel.textContent = `Channel: ${meta.uploader}`;
  el.metaDuration.textContent = meta.duration > 0 ? `Duration: ${formatSeconds(meta.duration)}` : "Duration: unknown";
  el.metadataCard.classList.remove("hidden");
}

async function loadYoutubeVideo() {
  const url = el.youtubeUrl.value.trim();
  if (!url) {
    showYoutubeError("URL cannot be empty");
    return;
  }

  showYoutubeError("");
  showYoutubeWarning("");
  el.metadataCard.classList.add("hidden");
  setLoadingState(true);
  state.youtube = null;
  state.duration = 0;
  updateRangeCard();

  try {
    let oembed = null;
    try {
      oembed = await fetchOEmbedMetadata(url);
    } catch (e) {
      // ignore — Piped response below also carries title/author/thumbnail
    }

    let resolved = null;
    try {
      resolved = await resolveYouTubeVideo(url, settings.defaultResolution);
    } catch (e) {
      console.warn("Piped resolution failed:", e);
    }

    if (!oembed && !resolved) {
      throw new Error("Failed to fetch video: could not reach YouTube or any extraction proxy.");
    }

    const merged = {
      videoId: (resolved && resolved.videoId) || extractVideoId(url),
      title: (resolved && resolved.title) || (oembed && oembed.title) || "Unknown Video",
      uploader: (resolved && resolved.uploader) || (oembed && oembed.uploader) || "Unknown Uploader",
      thumbnailUrl: (oembed && oembed.thumbnailUrl) || (resolved && resolved.thumbnailUrl) || "",
      duration: (resolved && resolved.duration) || 0,
      streamUrl: resolved && resolved.streamUrl,
      sourceUrl: url
    };

    renderMetadataCard(merged);
    state.youtube = merged;

    if (resolved && resolved.streamUrl) {
      setupRangeSlider(merged.duration);
    } else {
      state.duration = 0;
      updateRangeCard();
      showYoutubeWarning(
        "Loaded video info, but couldn't reach a streaming proxy for direct frame extraction right now " +
        "(public Piped instances may be busy or blocked). Try again in a bit, or download the video and " +
        "use “Local Video File” mode instead."
      );
    }
  } catch (e) {
    showYoutubeError(e.message || "Failed to load video.");
  } finally {
    setLoadingState(false);
  }
}

el.loadVideoBtn.addEventListener("click", loadYoutubeVideo);
el.youtubeUrl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadYoutubeVideo();
});

// ---------------------------------------------------------------------
// Local video file handling
// ---------------------------------------------------------------------
function loadVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = objectUrl;
    video.onloadedmetadata = () => {
      resolve({ file, title: file.name.replace(/\.[^/.]+$/, ""), duration: video.duration, objectUrl });
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not read "${file.name}" as a video.`));
    };
  });
}

function renderFileList() {
  el.fileMetadataList.innerHTML = "";
  state.files.forEach((f) => {
    const item = document.createElement("div");
    item.className = "file-list-item";
    item.innerHTML = `
      <span class="file-name">${escapeHtml(f.title)}</span>
      <span class="file-duration">${formatSeconds(f.duration)}</span>
    `;
    el.fileMetadataList.appendChild(item);
  });
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith("video/"));
  if (files.length === 0) return;

  // Revoke any previously loaded object URLs.
  state.files.forEach((f) => URL.revokeObjectURL(f.objectUrl));
  state.files = [];

  el.fileDropLabel.textContent = "Loading video info...";
  try {
    for (const file of files) {
      const meta = await loadVideoMetadata(file);
      state.files.push(meta);
    }
  } catch (e) {
    showToast(e.message);
  }

  el.fileDropLabel.textContent =
    state.files.length === 1
      ? state.files[0].file.name
      : `${state.files.length} files selected`;

  renderFileList();

  if (state.files.length === 1) {
    setupRangeSlider(state.files[0].duration);
  } else {
    state.duration = 0;
    updateRangeCard();
  }

  el.startBtnLabel.textContent = state.files.length > 1 ? "Start Batch Extraction" : "Start Grabbing Frames";
}

el.fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

["dragover", "dragenter"].forEach((evt) => {
  el.fileDropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    el.fileDropZone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((evt) => {
  el.fileDropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    el.fileDropZone.classList.remove("dragover");
  });
});
el.fileDropZone.addEventListener("drop", (e) => {
  if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
});

// ---------------------------------------------------------------------
// Build extraction config & start
// ---------------------------------------------------------------------
function buildBaseConfig() {
  return {
    interval: parseInt(el.intervalInput.value, 10) || 10,
    unit: el.unitSelect.value,
    outputFolder: el.outputFolder.value.trim() || "FrameGrabber",
    qualityPercentage: settings.defaultQuality,
    maxResolution: settings.defaultResolution,
    filenamePattern: el.filenamePattern.value,
    isSceneChangeMode: el.sceneChangeToggle.checked,
    sceneChangeThreshold: parseFloat(el.sceneThreshold.value)
  };
}

function buildJobList() {
  const base = buildBaseConfig();

  if (state.mode === "youtube") {
    if (!state.youtube || !state.youtube.streamUrl) {
      throw new Error("Please load a YouTube video with a working stream first.");
    }
    return [{
      ...base,
      sourceType: "youtube",
      streamUrl: state.youtube.streamUrl,
      videoTitle: state.youtube.title,
      thumbnailUrl: state.youtube.thumbnailUrl,
      durationSeconds: state.youtube.duration,
      timeRangeStartSeconds: state.rangeStart,
      timeRangeEndSeconds: state.rangeEnd
    }];
  }

  // Local file mode
  if (state.files.length === 0) {
    throw new Error("Please choose at least one video file first.");
  }

  if (state.files.length === 1) {
    const f = state.files[0];
    return [{
      ...base,
      sourceType: "file",
      objectUrl: f.objectUrl,
      videoTitle: f.title,
      thumbnailUrl: "",
      durationSeconds: f.duration,
      timeRangeStartSeconds: state.rangeStart,
      timeRangeEndSeconds: state.rangeEnd
    }];
  }

  // Batch: each file processed in full (matches the app's Batch URLs mode).
  return state.files.map((f) => ({
    ...base,
    sourceType: "file",
    objectUrl: f.objectUrl,
    videoTitle: f.title,
    thumbnailUrl: "",
    durationSeconds: f.duration,
    timeRangeStartSeconds: 0,
    timeRangeEndSeconds: 0
  }));
}

el.startBtn.addEventListener("click", () => {
  el.startError.classList.add("hidden");
  let jobs;
  try {
    jobs = buildJobList();
  } catch (e) {
    el.startError.textContent = e.message;
    el.startError.classList.remove("hidden");
    return;
  }
  startProcessing(jobs);
});

// ---------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------
let currentExtractor = null;
let processingCancelled = false;

function resetProcessingUI() {
  el.processingProgressCard.classList.remove("hidden");
  el.procResultCard.classList.add("hidden");
  el.procThumb.classList.add("hidden");
  el.procProgressFill.classList.remove("indeterminate");
  el.procProgressFill.style.width = "0%";
  el.procPercent.textContent = "0% Done";
  el.procFrames.textContent = "0 / 0 frames";
  el.procTimestamp.textContent = "N/A";
  el.procEtaRow.classList.add("hidden");
  el.procEta.textContent = "--";
  el.procStatus.textContent = "Initializing extraction pipeline...";
  el.cancelBtn.disabled = false;
}

function updateProcessingUI(progress, jobIndex, totalJobs) {
  const prefix = totalJobs > 1 ? `[Video ${jobIndex + 1}/${totalJobs}] ` : "";
  el.procStatus.textContent = prefix + progress.status;
  el.procTimestamp.textContent = progress.currentTimestamp || "N/A";

  if (progress.totalFrames > 0) {
    el.procProgressFill.classList.remove("indeterminate");
    const pct = Math.round((progress.completedFrames / progress.totalFrames) * 100);
    el.procProgressFill.style.width = `${pct}%`;
    el.procPercent.textContent = `${pct}% Done`;
    el.procFrames.textContent = `${progress.completedFrames} / ${progress.totalFrames} frames`;
  } else {
    el.procProgressFill.classList.add("indeterminate");
    el.procPercent.textContent = "Scanning...";
    el.procFrames.textContent = `${progress.completedFrames} frame(s) found`;
  }

  if (typeof progress.estimatedRemainingSeconds === "number" && progress.estimatedRemainingSeconds >= 0) {
    el.procEtaRow.classList.remove("hidden");
    el.procEta.textContent = formatDuration(progress.estimatedRemainingSeconds);
  }
}

function loadVideoSource(job) {
  return new Promise((resolve, reject) => {
    const video = el.sourceVideo;

    function cleanup() {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
    }
    function onReady() {
      cleanup();
      resolve(video);
    }
    function onError() {
      cleanup();
      const detail = job.sourceType === "youtube"
        ? "Couldn't load the YouTube stream (it may have expired or the proxy blocked it)."
        : `Couldn't load "${job.videoTitle}".`;
      reject(new Error(detail));
    }

    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("error", onError);

    if (job.sourceType === "youtube") {
      video.crossOrigin = "anonymous";
    } else {
      video.removeAttribute("crossorigin");
    }
    video.src = job.sourceType === "youtube" ? job.streamUrl : job.objectUrl;
    video.load();
  });
}

async function startProcessing(jobs) {
  showView("processing");
  resetProcessingUI();
  processingCancelled = false;

  let totalSaved = 0;
  let lastError = null;
  let cancelledByUser = false;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (processingCancelled) { cancelledByUser = true; break; }

    el.procVideoLabel.textContent = job.videoTitle;
    if (job.thumbnailUrl) {
      el.procThumb.src = job.thumbnailUrl;
      el.procThumb.classList.remove("hidden");
    } else {
      el.procThumb.classList.add("hidden");
    }

    try {
      const video = await loadVideoSource(job);
      job.durationSeconds = job.durationSeconds || video.duration || 0;

      const extractor = new FrameExtractor(video, job, (progress) => updateProcessingUI(progress, i, jobs.length));
      currentExtractor = extractor;
      const results = await extractor.run();

      for (const frame of results) {
        await FrameDB.addFrame({ blob: frame.blob, name: frame.name, folderName: job.outputFolder });
        totalSaved++;
      }
    } catch (e) {
      if (e instanceof CancelledError) {
        cancelledByUser = true;
        break;
      }
      console.error(e);
      if (e.name === "SecurityError" && job.sourceType === "youtube") {
        lastError = new Error(
          "The video stream blocked frame access (cross-origin restrictions from the streaming proxy). " +
          "Try a different video, or download it and use “Local Video File” mode."
        );
      } else {
        lastError = e;
      }
      if (jobs.length === 1) break;
    } finally {
      currentExtractor = null;
    }
  }

  el.sourceVideo.removeAttribute("src");
  el.sourceVideo.load();

  if (cancelledByUser) {
    showResult({
      icon: "⚠️",
      title: "Extraction Cancelled",
      desc: `The extraction job was stopped. ${totalSaved} frame(s) saved so far remain in your gallery.`,
      primary: { text: "Go to Gallery", action: () => showView("gallery") },
      secondary: { text: "Back to Home", action: () => showView("home") }
    });
  } else if (lastError && totalSaved === 0) {
    showResult({
      icon: "⚠️",
      title: "Extraction Failed",
      desc: `An error occurred during extraction:\n\n${lastError.message}`,
      primary: { text: "Go to Gallery", action: () => showView("gallery") },
      secondary: { text: "Try Again / Home", action: () => showView("home") }
    });
  } else {
    const desc = lastError
      ? `${totalSaved} frame(s) extracted and saved to your gallery. One file failed: ${lastError.message}`
      : `${totalSaved} frame(s) extracted successfully and saved to your gallery.`;
    showResult({
      icon: "✅",
      title: "Extraction Complete!",
      desc,
      primary: { text: "View Gallery", action: () => showView("gallery") },
      secondary: { text: "Back to Home", action: () => showView("home") }
    });
  }
}

function showResult({ icon, title, desc, primary, secondary }) {
  el.processingProgressCard.classList.add("hidden");
  el.procResultCard.classList.remove("hidden");
  el.procResultIcon.textContent = icon;
  el.procResultTitle.textContent = title;
  el.procResultDesc.textContent = desc;
  el.procPrimaryBtn.textContent = primary.text;
  el.procPrimaryBtn.onclick = primary.action;
  el.procSecondaryBtn.textContent = secondary.text;
  el.procSecondaryBtn.onclick = secondary.action;
}

el.cancelBtn.addEventListener("click", () => {
  processingCancelled = true;
  if (currentExtractor) currentExtractor.cancel();
  el.cancelBtn.disabled = true;
  el.procStatus.textContent = "Cancelling...";
});

// ---------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------
let galleryObjectUrls = [];

function revokeGalleryUrls() {
  galleryObjectUrls.forEach((u) => URL.revokeObjectURL(u));
  galleryObjectUrls = [];
}

async function refreshGallery() {
  const folders = await FrameDB.getFolders();
  const items = await FrameDB.getByFolder(state.galleryFolder);

  el.galleryFolders.innerHTML = "";
  if (folders.length > 0) {
    el.galleryFolders.classList.remove("hidden");
    el.galleryActions.classList.remove("hidden");

    const allChip = document.createElement("button");
    allChip.className = "chip" + (state.galleryFolder === null ? " active" : "");
    allChip.textContent = "All Folders";
    allChip.addEventListener("click", () => {
      state.galleryFolder = null;
      refreshGallery();
    });
    el.galleryFolders.appendChild(allChip);

    folders.forEach((folder) => {
      const chip = document.createElement("button");
      chip.className = "chip" + (state.galleryFolder === folder ? " active" : "");
      chip.textContent = folder;
      chip.addEventListener("click", () => {
        state.galleryFolder = folder;
        refreshGallery();
      });
      el.galleryFolders.appendChild(chip);
    });
  } else {
    el.galleryFolders.classList.add("hidden");
    el.galleryActions.classList.add("hidden");
  }

  el.galleryEmpty.classList.toggle("hidden", items.length > 0);
  el.galleryGrid.classList.toggle("hidden", items.length === 0);

  revokeGalleryUrls();
  el.galleryGrid.innerHTML = "";
  state.galleryItems = items;

  items.forEach((item) => {
    const url = URL.createObjectURL(item.blob);
    galleryObjectUrls.push(url);

    const cell = document.createElement("div");
    cell.className = "gallery-item";
    cell.innerHTML = `
      <img src="${url}" alt="${escapeHtml(item.name)}" loading="lazy">
      <span class="folder-tag">${escapeHtml(item.folderName)}</span>
    `;
    cell.addEventListener("click", () => openPreview(item, url));
    el.galleryGrid.appendChild(cell);
  });
}

function openPreview(item, url) {
  state.previewItem = item;
  el.previewImg.src = url;
  el.previewName.textContent = item.name;
  el.previewFolder.textContent = `Folder: ${item.folderName}`;
  el.previewSize.textContent = `Size: ${formatBytes(item.sizeBytes)}`;
  el.previewModal.classList.remove("hidden");
}

function closePreview() {
  el.previewModal.classList.add("hidden");
  state.previewItem = null;
}

el.previewCloseBtn.addEventListener("click", closePreview);
el.modalBackdrop.addEventListener("click", closePreview);

el.previewDeleteBtn.addEventListener("click", async () => {
  if (!state.previewItem) return;
  await FrameDB.deleteFrame(state.previewItem.id);
  closePreview();
  refreshGallery();
  showToast("Frame deleted");
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

el.previewShareBtn.addEventListener("click", async () => {
  if (!state.previewItem) return;
  const item = state.previewItem;
  const file = new File([item.blob], item.name, { type: "image/jpeg" });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: item.name });
      return;
    } catch (e) {
      // user cancelled or share unsupported — fall back to download
    }
  }
  downloadBlob(item.blob, item.name);
});

el.downloadZipBtn.addEventListener("click", async () => {
  const items = state.galleryItems;
  if (items.length === 0) return;

  el.downloadZipBtn.disabled = true;
  el.downloadZipBtn.textContent = "Zipping...";
  try {
    const zip = new JSZip();
    items.forEach((item) => {
      const folder = zip.folder(item.folderName || "FrameGrabber");
      folder.file(item.name, item.blob);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const zipName = (state.galleryFolder || "FrameGrabber") + ".zip";
    downloadBlob(blob, zipName);
  } catch (e) {
    showToast("Failed to create ZIP: " + e.message);
  } finally {
    el.downloadZipBtn.disabled = false;
    el.downloadZipBtn.textContent = "⬇️ Download ZIP";
  }
});

el.clearGalleryBtn.addEventListener("click", async () => {
  const label = state.galleryFolder || "all folders";
  if (!confirm(`Delete all frames in ${label}? This cannot be undone.`)) return;
  await FrameDB.deleteFolder(state.galleryFolder);
  state.galleryFolder = null;
  refreshGallery();
  showToast("Frames deleted");
});

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
function init() {
  applySettingsToUI();
  el.intervalInput.value = settings.defaultInterval;
  setMode("youtube");
  showView("home");
  renderRangeLabels();

  FrameDB.isMemoryFallback().then((isMemory) => {
    if (isMemory) el.storageBanner.classList.remove("hidden");
  });
}

init();
