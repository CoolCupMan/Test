import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.binarycore.editor3dx",
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
      // package name (app.binarycore.editor3dx) + signing certificate SHA-1 —
      // Google Play Services matches that automatically, nothing to reference
      // here for it.
      scopes: ["profile", "email"],
      clientId: process.env.VITE_GOOGLE_CLIENT_ID || "",
      serverClientId: process.env.VITE_GOOGLE_CLIENT_ID || "",
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
