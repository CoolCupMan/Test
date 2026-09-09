<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# binarycore3d3x

Android-optimized `.txt` / `.dat` text editor with high-performance virtualization
for 1,000,000+ line files, an in-app Android file manager, instant search, and
AI text analysis backed by Google Gemini, OpenAI, or Claude (Anthropic) — plus a
local, fully offline AI scanner.

## Run Locally (web dev preview)

**Prerequisites:** Node.js 20+

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and fill in what you need (see below —
   nothing is required just to run the editor itself).
3. Run the app: `npm run dev`

## Environment variables (`.env.local`)

| Variable | Required? | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Optional | Server-side default Gemini key, used when a request doesn't supply its own. |
| `ANTHROPIC_API_KEY` | Optional | Same, for Claude. Users can also just connect their own key from the Login screen. |
| `ANTHROPIC_MODEL` | Optional | Overrides the Claude model used for analysis (default `claude-opus-5`). |
| `APP_URL` | Optional | Public URL this server is deployed at (Cloud Run, etc.). |
| `VITE_GOOGLE_CLIENT_ID` | Optional | Enables real "Sign in with Google". Without it, the Google button is disabled with an explanatory note instead of faking success. |
| `VITE_API_BASE_URL` | Only for the Android build | See "Building the Android APK" below — the packaged app has no on-device server. |

## Login & AI provider accounts

The Login modal (top right) supports:

- **Google Sign-In** — real OAuth via Google Identity Services on web, or the
  native Android Google Sign-In SDK inside the packaged app. Disabled until
  `VITE_GOOGLE_CLIENT_ID` is configured (see below) — it will not fake a login.
- **OpenAI** — there's no public "Sign in with OpenAI" for third-party apps, so
  this connects by verifying your OpenAI API key against `GET /v1/models`
  server-side, then links the account. The verified key is also used
  automatically for AI Text Analysis.
- **Claude (Anthropic)** — same pattern as OpenAI, verified against Anthropic's
  models endpoint.
- **Username & Password** — a local-only account (no server), used just to set
  the display name shown on editor timestamps. It is explicitly labeled as such
  in the UI — it is not a security login.

### Configuring real Google Sign-In

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or pick)
   a project, then **APIs & Services → OAuth consent screen** and configure it.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Create a **Web application** client. Add your dev URL (e.g.
     `http://localhost:3000`) and your deployed `APP_URL` under *Authorized
     JavaScript origins*. This client's ID is what you set as
     `VITE_GOOGLE_CLIENT_ID` — it's used for both the web flow and as the
     Android plugin's `clientId`/`serverClientId`.
   - Create a second **Android** client for the packaged app: package name
     `app.binarycore.editor3dx21`, and the SHA-1 fingerprint of whatever keystore
     signs your build. Google Play Services matches this automatically at
     runtime — it isn't referenced anywhere in code.
     - Debug keystore SHA-1 (what the CI build in this repo produces):
       `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`
     - Release keystore SHA-1: same command, pointed at your `.jks`/`.keystore`.
3. Set `VITE_GOOGLE_CLIENT_ID` in `.env.local` (web) and as a GitHub Actions
   secret of the same name (Android build, see below).

## Building the Android APK

This repo includes a Capacitor Android project (`android/`) wrapping the built
web app. Building it needs the Android SDK, which most sandboxed/dev
environments don't have installed (and often can't fetch — egress to
`dl.google.com` is commonly blocked by network policy). GitHub-hosted Actions
runners ship a preinstalled Android SDK, so that's where this repo builds it:

1. Push to this repo (or run manually) to trigger
   **.github/workflows/build-android-apk.yml**.
2. Optionally set repo **Secrets** → `VITE_GOOGLE_CLIENT_ID`, and repo
   **Variables** → `VITE_API_BASE_URL` (see below), before running the workflow
   — otherwise it still builds, just with Google Sign-In disabled and AI/login
   network calls unreachable until configured.
3. Download the `binarycore3d3x-debug-apk` artifact from the workflow run.

That produces a **debug-signed** APK — fine for sideloading and testing. For a
release build, sign `android/app/build/outputs/apk/release/app-release-unsigned.apk`
with your own keystore (`jarsigner` / `apksigner`), and register that
keystore's SHA-1 as the Android OAuth client above.

### Why `VITE_API_BASE_URL` matters for the packaged app

The Android build is a static WebView shell — it has no on-device Node server.
The `/api/ai/analyze` and `/api/auth/verify-key` calls need somewhere real to
land, so before building set `VITE_API_BASE_URL` to wherever you've deployed
this repo's Express server (the same URL as `APP_URL`). Left unset, those
calls will simply fail to reach a server on-device — Local AI, the file editor,
and everything else that doesn't need the server work fine regardless.

### Local Capacitor commands

```sh
npm run build          # vite build + bundles server.ts (for the hosted server)
npx vite build          # just the web assets the APK needs
npx cap sync android    # copy web assets + native plugins into android/
```

Opening `android/` in Android Studio also works if you have the SDK installed
locally.
