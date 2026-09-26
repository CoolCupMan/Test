// Electron main process for the Windows build of binarycore3d3x.
//
// Serves the same built web assets (dist/, from `npx vite build`) straight
// off disk through an in-process custom "app://" protocol handler — no
// Express server, no localhost port, no network stack at all. This mirrors
// exactly how the Android build already works: Capacitor's WebView loads
// the identical dist/ output as a bundled static asset via its own internal
// scheme, not through any on-device server (see README.md's "Why
// VITE_API_BASE_URL matters for the packaged app" — the packaged Android
// app has no on-device Node server either). So "same functions as the
// Android build" here means literally that: the editor, Local AI, and
// everything that doesn't need a server work exactly the same; the
// server-side /api/ai/analyze and /api/auth/verify-key calls behave exactly
// as they already do on Android — unreachable unless VITE_API_BASE_URL was
// set at build time to a separately hosted server, with everything else
// working regardless.
//
// Plain file:// was tried first and dropped: Chromium treats every file://
// URL as its own unique, opaque origin, which silently blocks the
// cross-file fetches that a `<script type="module">` bundle (what Vite
// outputs) needs to load its own imports — a real, well-known Electron+Vite
// pitfall that reproduces as exactly the same kind of blank window this is
// fixing. A custom scheme registered as "standard" gives the page a normal,
// consistent origin (so modules/fetch work like they do on the web) while
// still never opening an actual network socket — request.url never leaves
// this process.
//
// (An even earlier version of this file spawned dist/server.cjs as a
// background server process; removed for the same reason plus the extra
// moving part it added.)
//
// CommonJS (.cjs) on purpose — package.json has "type": "module".

const { app, BrowserWindow, protocol, net } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

const DIST_DIR = path.join(__dirname, "..", "dist");
const APP_SCHEME = "app";

let mainWindow = null;

// Ties this build's Windows taskbar/shortcut identity to the exact Android
// build (editor3dx24) it was generated from, and keeps it distinct from any
// other binarycore build (Android or Windows) installed on the same
// machine — see electron-builder.yml's "appId" for the installer-level id.
app.setAppUserModelId("app.binarycore.editor3dx24win");

// Must be registered before app.whenReady() — this is what makes "app://"
// behave like a normal web origin (fetch/modules/relative URLs all work)
// instead of the more restricted default Electron gives unregistered
// schemes.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, (request) => {
    const requestUrl = new URL(request.url);
    let pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname === "" || pathname === "/") pathname = "/index.html";
    const filePath = path.join(DIST_DIR, pathname);

    // Guard against the resolved path escaping dist/ (e.g. via "..").
    if (!filePath.startsWith(DIST_DIR)) {
      return new Response("Not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow() {
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

  mainWindow.loadURL(`${APP_SCHEME}://bundle/index.html`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerAppProtocol();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
