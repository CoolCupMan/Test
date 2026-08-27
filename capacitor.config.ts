import type { CapacitorConfig } from "@capacitor/cli";

// The native Google Auth plugin calls Google Sign-In SDK's `requestIdToken()`
// unconditionally during app startup (Capacitor plugin `load()`, runs on every
// launch regardless of whether Google Sign-In is ever used) — and that SDK call
// throws immediately if given an empty string, crashing the whole app before
// the WebView even renders. So this must NEVER be "" even when unconfigured;
// a syntactically-plausible placeholder keeps the plugin's native init happy,
// while the JS side (src/lib/googleAuth.ts, driven by the real
// VITE_GOOGLE_CLIENT_ID) independently disables the Google Sign-In button
// until a real Client ID is set — so nothing here fakes a working sign-in.
const GOOGLE_CLIENT_ID =
  process.env.VITE_GOOGLE_CLIENT_ID || "000000000000-not-configured.apps.googleusercontent.com";

const config: CapacitorConfig = {
  // Deliberately different from earlier binarycore builds' app id
  // (app.binarycore.editor3dx, editor3dx2, editor3dx3, editor3dx4,
  // editor3dx5, editor3dx6, editor3dx7, editor3dx8, editor3dx9,
  // editor3dx10, editor3dx11, editor3dx12, or whatever the original
  // binarycore3d2x... APK used) so this build installs as a separate app
  // instead of requiring a previous one to be uninstalled first, or
  // failing with an INSTALL_FAILED_UPDATE_INCOMPATIBLE / signature-mismatch
  // error — all of them can stay installed side by side.
  appId: "app.binarycore.editor3dx13",
  appName: "binarycore3d3x",
  webDir: "dist",
  server: {
    // Allow loading local files & the bundled web assets as the app shell.
    androidScheme: "https",
  },
  plugins: {
    GoogleAuth: {
      // Fill in once you've created an OAuth Client ID (Web application type) in
      // Google Cloud Console (see README.md > "Configuring real Google Sign-In").
      // Same value as the VITE_GOOGLE_CLIENT_ID used by the web build. You also
      // need a separate Android-type OAuth client registered with this app's
      // package name (app.binarycore.editor3dx13) + signing certificate SHA-1 —
      // Google Play Services matches that automatically, nothing to reference
      // here for it.
      scopes: ["profile", "email"],
      clientId: GOOGLE_CLIENT_ID,
      serverClientId: GOOGLE_CLIENT_ID,
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
