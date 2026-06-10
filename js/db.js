/* ==========================================================================
   FrameDB — IndexedDB-backed storage for extracted frames.
   Mirrors the role of GalleryRepository / MediaStore in the Android app:
   frames are grouped by "folderName" (the Output Folder field on Home).

   Some contexts deny IndexedDB entirely (opening index.html via file://,
   private/incognito modes, locked-down browser settings) and throw a
   SecurityError such as "access to the Indexed Database API is denied in
   this context". When that happens this module transparently falls back to
   an in-memory store so extraction still works for the current tab session
   — callers can check isMemoryFallback() to warn the user that the gallery
   won't survive a reload.
   ========================================================================== */

const FrameDB = (() => {
  const DB_NAME = "framegrabber";
  const DB_VERSION = 1;
  const STORE_NAME = "frames";

  let memoryStore = [];
  let memoryNextId = 1;
  let backendPromise = null;

  function openIDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is not available in this browser context."));
        return;
      }
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
          store.createIndex("folderName", "folderName", { unique: false });
          store.createIndex("addedDate", "addedDate", { unique: false });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject((e.target && e.target.error) || new Error("Failed to open IndexedDB"));
    });
  }

  function getBackend() {
    if (!backendPromise) {
      backendPromise = openIDB()
        .then((db) => ({ type: "idb", db }))
        .catch((e) => {
          console.warn("FrameDB: IndexedDB unavailable, using in-memory storage for this session.", e);
          return { type: "memory" };
        });
    }
    return backendPromise;
  }

  async function addFrame({ blob, name, folderName }) {
    const backend = await getBackend();
    const record = {
      blob,
      name,
      folderName,
      sizeBytes: blob.size,
      addedDate: Date.now()
    };

    if (backend.type === "memory") {
      record.id = memoryNextId++;
      memoryStore.push(record);
      return record.id;
    }

    return new Promise((resolve, reject) => {
      const tx = backend.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll() {
    const backend = await getBackend();
    let items;

    if (backend.type === "memory") {
      items = [...memoryStore];
    } else {
      items = await new Promise((resolve, reject) => {
        const tx = backend.db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }

    items.sort((a, b) => b.addedDate - a.addedDate);
    return items;
  }

  async function getByFolder(folderName) {
    const all = await getAll();
    if (!folderName) return all;
    return all.filter((f) => f.folderName === folderName);
  }

  async function getFolders() {
    const all = await getAll();
    const folders = [];
    for (const item of all) {
      if (!folders.includes(item.folderName)) folders.push(item.folderName);
    }
    return folders;
  }

  async function deleteFrame(id) {
    const backend = await getBackend();
    if (backend.type === "memory") {
      memoryStore = memoryStore.filter((f) => f.id !== id);
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = backend.db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteFolder(folderName) {
    const backend = await getBackend();
    if (backend.type === "memory") {
      memoryStore = memoryStore.filter((f) => !(folderName == null || f.folderName === folderName));
      return;
    }
    const all = await getAll();
    const ids = all.filter((f) => folderName == null || f.folderName === folderName).map((f) => f.id);
    return new Promise((resolve, reject) => {
      const tx = backend.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      ids.forEach((id) => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Resolves true if frames are only kept in memory for this tab (IndexedDB denied). */
  async function isMemoryFallback() {
    const backend = await getBackend();
    return backend.type === "memory";
  }

  return { addFrame, getAll, getByFolder, getFolders, deleteFrame, deleteFolder, isMemoryFallback };
})();
