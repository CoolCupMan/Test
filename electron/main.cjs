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
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");

const PORT = 3000;
const SERVER_URL = `http://127.0.0.1:${PORT}/`;
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/health`;

let serverProcess = null;
let mainWindow = null;

// A GUI-launched app (double-clicked, no console attached) has nowhere
// visible for the server's own console output to go — this is the only
// place a startup failure (a crash, a port already in use, a missing
// dependency) would otherwise show up, and without it a failure here was
// silently producing nothing but a blank window. Captured in memory (to show
// inline if startup fails, see showStartupError) and to a log file so it's
// still findable after the window closes.
let serverLogPath = null;
const serverLogLines = [];
const MAX_LOG_LINES = 200;

function logServerOutput(chunk) {
  const text = chunk.toString();
  serverLogLines.push(text);
  if (serverLogLines.length > MAX_LOG_LINES) serverLogLines.shift();
  try {
    fs.appendFileSync(serverLogPath, text);
  } catch (_) {
    // Best-effort only — never let logging itself crash startup.
  }
}

// Ties this build's Windows taskbar/shortcut identity to the exact Android
// build (editor3dx24) it was generated from, and keeps it distinct from any
// other binarycore build (Android or Windows) installed on the same
// machine — see electron-builder.yml's "appId" for the installer-level id.
app.setAppUserModelId("app.binarycore.editor3dx24win");

function startBackendServer() {
  serverLogPath = path.join(app.getPath("userData"), "server.log");
  try {
    fs.writeFileSync(serverLogPath, `binarycore server log — started ${new Date().toISOString()}\n`);
  } catch (_) {
    // Non-fatal — the in-memory tail (serverLogLines) still works even if
    // the log file itself can't be written.
  }

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
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProcess.stdout.on("data", logServerOutput);
  serverProcess.stderr.on("data", logServerOutput);

  serverProcess.on("error", (err) => {
    logServerOutput(`\n[electron] Failed to spawn the server process: ${err && err.stack ? err.stack : err}\n`);
  });

  serverProcess.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      logServerOutput(`\n[electron] Server process exited early with code ${code} (signal ${signal || "none"})\n`);
    }
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

// Shown instead of a bare blank/browser-error page when the local server
// never came up in time — an actual explanation plus the tail of its own
// log, so a startup problem is visible and reportable instead of silent.
function showStartupError(err) {
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const logTail = escapeHtml(serverLogLines.join("").trim() || "(no output captured)");
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>binarycore3d3x</title>
<style>
  body { font-family: Segoe UI, Arial, sans-serif; background: #14181f; color: #e6e9ef; margin: 0; padding: 32px; }
  h1 { font-size: 18px; color: #f59e0b; }
  p { line-height: 1.5; }
  pre { background: #0b0e13; border: 1px solid #2a2f3a; border-radius: 6px; padding: 12px; white-space: pre-wrap;
        word-break: break-word; max-height: 50vh; overflow-y: auto; font-size: 12px; color: #9fd0ff; }
  code { background: #232833; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
  <h1>binarycore3d3x couldn't start its local server</h1>
  <p>${escapeHtml(err && err.message ? err.message : String(err))}</p>
  <p>Full log saved to: <code>${escapeHtml(serverLogPath || "")}</code></p>
  <p>Recent server output:</p>
  <pre>${logTail}</pre>
</body>
</html>`;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  try {
    await waitForServer(HEALTH_URL);
    mainWindow.loadURL(SERVER_URL);
  } catch (err) {
    showStartupError(err);
  }
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
