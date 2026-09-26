// Electron main process for the Windows build of binarycore3d3x.
//
// This intentionally does NOT reimplement anything: it just launches the
// exact same production server this project already builds for the web
// (dist/server.cjs, built by `npm run build`) as a background process, then
// opens a normal window pointed at it — so every feature that works in the
// browser/web build (including the server-side AI analyze / API-key-verify
// endpoints in server.ts, which the packaged Android app can't reach without
// a separately hosted VITE_API_BASE_URL) works unmodified here too, with no
// separate Electron-specific code path to keep in sync.
//
// CommonJS (.cjs) on purpose — package.json has "type": "module", and
// Electron's main process (like dist/server.cjs) is loaded as CommonJS.

const { app, BrowserWindow } = require("electron");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const PORT = 3000;
const SERVER_URL = `http://127.0.0.1:${PORT}/`;
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/health`;

let serverProcess = null;
let mainWindow = null;

// Ties this build's Windows taskbar/shortcut identity to the exact Android
// build (editor3dx24) it was generated from, and keeps it distinct from any
// other binarycore build (Android or Windows) installed on the same
// machine — see electron-builder.yml's "appId" for the installer-level id.
app.setAppUserModelId("app.binarycore.editor3dx24win");

function startBackendServer() {
  // dist/server.cjs is a bundled CommonJS script, not an Electron app, so it
  // must run under a plain Node.js runtime rather than relaunching Electron
  // itself. Spawning Electron's own executable with ELECTRON_RUN_AS_NODE=1
  // does exactly that without needing a separate Node.js install bundled
  // alongside it — the standard way to run a plain Node script from a
  // packaged Electron app.
  const serverPath = path.join(__dirname, "..", "dist", "server.cjs");
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "production", ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
    windowsHide: true,
  });

  serverProcess.on("error", (err) => {
    console.error("Failed to start binarycore server:", err);
  });
}

function waitForServer(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for the local server at ${url}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    title: "binarycore3d3x",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await waitForServer(HEALTH_URL);
  } catch (err) {
    // Fall through and try to load anyway — a slow first start is better
    // shown as the app's own "can't reach server" state (already handled by
    // the existing web UI, see src/lib/apiBase.ts) than a blank Electron
    // window with no explanation.
    console.error(err);
  }

  mainWindow.loadURL(SERVER_URL);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function stopBackendServer() {
  if (serverProcess && !serverProcess.killed) {
    try {
      serverProcess.kill();
    } catch (_) {
      // Already gone — nothing to do.
    }
  }
  serverProcess = null;
}

app.whenReady().then(() => {
  startBackendServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopBackendServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopBackendServer);
