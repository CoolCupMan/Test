import { VirtualFile, EditorSession } from "../types";
import { splitLinesAsync } from "./performanceUtils";

const DB_NAME = "binarycore_android_fs";
const DB_VERSION = 1;
const STORE_FILES = "files";
const STORE_SETTINGS = "settings";

const INITIAL_BASE_PATH = "/storage/emulated/0";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_FILES)) {
          const fileStore = db.createObjectStore(STORE_FILES, { keyPath: "path" });
          fileStore.createIndex("parentPath", "parentPath", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = (err) => {
        dbPromise = null;
        reject(request.error || err);
      };
    });
  }
  return dbPromise;
}

// Seed default Android directory structure and sample files if empty
export async function initializeStorage(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([STORE_FILES], "readonly");
  const store = tx.objectStore(STORE_FILES);
  const countReq = store.count();

  return new Promise((resolve, reject) => {
    countReq.onsuccess = async () => {
      if (countReq.result === 0) {
        // Create root Android folders
        const now = Date.now();
        const defaultFolders: VirtualFile[] = [
          {
            path: INITIAL_BASE_PATH,
            name: "0",
            content: "",
            size: 0,
            createdAt: now,
            updatedAt: now,
            mimeType: "text/plain",
            extension: "txt",
            isDirectory: true,
            parentPath: "/storage/emulated",
          },
          {
            path: `${INITIAL_BASE_PATH}/Documents`,
            name: "Documents",
            content: "",
            size: 0,
            createdAt: now,
            updatedAt: now,
            mimeType: "text/plain",
            extension: "txt",
            isDirectory: true,
            parentPath: INITIAL_BASE_PATH,
          },
          {
            path: `${INITIAL_BASE_PATH}/Download`,
            name: "Download",
            content: "",
            size: 0,
            createdAt: now,
            updatedAt: now,
            mimeType: "text/plain",
            extension: "txt",
            isDirectory: true,
            parentPath: INITIAL_BASE_PATH,
          },
          {
            path: `${INITIAL_BASE_PATH}/binarycore`,
            name: "binarycore",
            content: "",
            size: 0,
            createdAt: now,
            updatedAt: now,
            mimeType: "text/plain",
            extension: "txt",
            isDirectory: true,
            parentPath: INITIAL_BASE_PATH,
          },
        ];

        // Seed sample documents
        const sampleTxtContent = `[2026-08-10 10:00:00] Chris Narup: Welcome to binarycore for Android!
[2026-08-10 10:01:15] System: Initialized virtual file system at /storage/emulated/0/
[2026-08-10 10:02:30] Chris Narup: Editing high-volume .txt and .dat files with up to 1,000,000+ lines.
Line 4: Fast line number indexing enabled on the left side.
Line 5: Use dual scrolling for precision control.
Line 6: Perform AI analysis with Gemini, OpenAI, or local Android AI.
Line 7: Send chats with automatic timestamps.
Line 8: Preserve original line text 1-to-1 without accidental replacements.
Line 9: Local storage persisted directly in-app across restarts and phone reboots.
Line 10: binarycore High Performance Text Engine Ready.`;

        const sampleDatContent = `BINARYCORE_HEADER_v1.0
TIMESTAMP_INDEX_START=0
DATA_RECORD_001=OK
DATA_RECORD_002=20260810_120000_LOG_ENTRY
SYSTEM_STATUS=OPERATIONAL
MEM_ALLOC_LIMIT=1048576
CHUNK_SIZE=50000
DEBUG_LOG=NO_ERRORS_DETECTED
RECORD_END`;

        const defaultFiles: VirtualFile[] = [
          ...defaultFolders,
          {
            path: `${INITIAL_BASE_PATH}/Documents/welcome_binarycore.txt`,
            name: "welcome_binarycore.txt",
            content: sampleTxtContent,
            size: new Blob([sampleTxtContent]).size,
            createdAt: now,
            updatedAt: now,
            mimeType: "text/plain",
            extension: "txt",
            isDirectory: false,
            parentPath: `${INITIAL_BASE_PATH}/Documents`,
          },
          {
            path: `${INITIAL_BASE_PATH}/binarycore/system_config.dat`,
            name: "system_config.dat",
            content: sampleDatContent,
            size: new Blob([sampleDatContent]).size,
            createdAt: now,
            updatedAt: now,
            mimeType: "application/octet-stream",
            extension: "dat",
            isDirectory: false,
            parentPath: `${INITIAL_BASE_PATH}/binarycore`,
          },
        ];

        const saveTx = db.transaction([STORE_FILES], "readwrite");
        const saveStore = saveTx.objectStore(STORE_FILES);
        for (const f of defaultFiles) {
          saveStore.put(f);
        }
        saveTx.oncomplete = () => resolve();
        saveTx.onerror = () => reject(saveTx.error);
      } else {
        resolve();
      }
    };
    countReq.onerror = () => reject(countReq.error);
  });
}

// Save or overwrite a file in IndexedDB
export async function saveVirtualFile(file: VirtualFile): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_FILES], "readwrite");
        const store = tx.objectStore(STORE_FILES);
        store.put(file);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => {
          console.warn("IndexedDB save warning (handled):", tx.error || e);
          resolve();
        };
      } catch (err) {
        console.warn("IndexedDB save transaction error (handled):", err);
        resolve();
      }
    });
  } catch (err) {
    console.warn("IndexedDB open error (handled):", err);
  }
}

// Read virtual file
export async function readVirtualFile(path: string): Promise<VirtualFile | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_FILES], "readonly");
    const store = tx.objectStore(STORE_FILES);
    const req = store.get(path);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// Delete virtual file
export async function deleteVirtualFile(path: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_FILES], "readwrite");
    const store = tx.objectStore(STORE_FILES);
    store.delete(path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// List directory items
export async function listVirtualDirectory(dirPath: string): Promise<VirtualFile[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_FILES], "readonly");
    const store = tx.objectStore(STORE_FILES);
    const index = store.index("parentPath");
    const req = index.getAll(dirPath);

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Save session settings (e.g. last opened directory & file)
export async function saveSessionState(session: Partial<EditorSession>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SETTINGS], "readwrite");
    const store = tx.objectStore(STORE_SETTINGS);

    for (const [key, value] of Object.entries(session)) {
      store.put({ key, value });
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Get session settings
export async function loadSessionState(): Promise<EditorSession> {
  const db = await openDB();
  const defaultSession: EditorSession = {
    lastOpenedPath: `${INITIAL_BASE_PATH}/Documents/welcome_binarycore.txt`,
    lastDirPath: `${INITIAL_BASE_PATH}/Documents`,
    autoOpenLastDoc: true,
    userName: "User",
    darkTheme: true,
    wordWrap: true,
    isHorizontalMode: false,
    showLineNumbers: true,
    slowScrollRatio: 0.1,
  };

  return new Promise((resolve) => {
    const tx = db.transaction([STORE_SETTINGS], "readonly");
    const store = tx.objectStore(STORE_SETTINGS);
    const req = store.getAll();

    req.onsuccess = () => {
      const items = req.result || [];
      const loaded: Record<string, any> = {};
      for (const item of items) {
        loaded[item.key] = item.value;
      }
      resolve({ ...defaultSession, ...loaded });
    };

    req.onerror = () => resolve(defaultSession);
  });
}

// Fast non-blocking line joiner for massive 1,000,000+ line files
export async function joinLinesAsync(lines: string[]): Promise<string> {
  if (lines.length < 50000) {
    return lines.join("\n");
  }
  return new Promise((resolve) => {
    setTimeout(() => {
      const chunkSize = 100000;
      const chunks: string[] = [];
      for (let i = 0; i < lines.length; i += chunkSize) {
        chunks.push(lines.slice(i, i + chunkSize).join("\n"));
      }
      resolve(chunks.join("\n"));
    }, 0);
  });
}

// Trigger browser download for external Android File Manager visibility
export function exportFileToLocalDevice(file: VirtualFile): void {
  const ext = (file.extension || "").toLowerCase();
  const mimeType =
    ext === "html" || ext === "htm"
      ? "text/html;charset=utf-8"
      : ext === "json"
      ? "application/json;charset=utf-8"
      : ext === "csv"
      ? "text/csv;charset=utf-8"
      : ext === "dat"
      ? "application/octet-stream"
      : "text/plain;charset=utf-8";

  // Chunk large content strings into smaller array blocks to avoid V8 string/blob heap freezes
  let blob: Blob;
  if (file.content.length > 5 * 1024 * 1024) {
    const chunks: string[] = [];
    const chunkSize = 2 * 1024 * 1024;
    for (let i = 0; i < file.content.length; i += chunkSize) {
      chunks.push(file.content.slice(i, i + chunkSize));
    }
    blob = new Blob(chunks, { type: mimeType });
  } else {
    blob = new Blob([file.content], { type: mimeType });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Modern File System Access API Save As function (falls back to Blob download)
export async function saveFileAsExternal(file: VirtualFile): Promise<boolean> {
  try {
    if ("showSaveFilePicker" in window) {
      const ext = (file.extension || "txt").toLowerCase();
      const mimeMap: Record<string, string> = {
        txt: "text/plain",
        html: "text/html",
        htm: "text/html",
        json: "application/json",
        csv: "text/csv",
        md: "text/markdown",
        dat: "application/octet-stream",
        log: "text/plain",
        xml: "application/xml",
        js: "text/javascript",
        ts: "text/plain",
        css: "text/css",
      };
      const mime = mimeMap[ext] || "text/plain";

      const handle = await (window as any).showSaveFilePicker({
        suggestedName: file.name,
        types: [
          {
            description: `${ext.toUpperCase()} Document`,
            accept: { [mime]: [`.${ext}`] },
          },
        ],
      });
      const writable = await handle.createWritable();

      // Write in chunks for large HTML / text exports (> 5MB)
      if (file.content.length > 5 * 1024 * 1024) {
        const chunkSize = 2 * 1024 * 1024;
        for (let i = 0; i < file.content.length; i += chunkSize) {
          await writable.write(file.content.slice(i, i + chunkSize));
        }
      } else {
        await writable.write(file.content);
      }

      await writable.close();
      return true;
    }
  } catch (err: any) {
    if (err.name === "AbortError") return false;
    console.warn("showSaveFilePicker unavailable or rejected, falling back to download:", err);
  }

  exportFileToLocalDevice(file);
  return true;
}
