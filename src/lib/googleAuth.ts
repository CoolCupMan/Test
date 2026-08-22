/**
 * Real Google Sign-In integration.
 *
 * Two code paths:
 *  - Web / dev preview: Google Identity Services (GIS) JS SDK, using a Client ID
 *    configured via VITE_GOOGLE_CLIENT_ID. This is what runs in `npm run dev` and
 *    in any regular browser.
 *  - Native Android (this app packaged via Capacitor): GIS does not work inside a
 *    generic WebView (Google blocks embedded WebViews from completing OAuth), so
 *    we instead call the native Capacitor Google Auth plugin, which uses Android's
 *    real Google Sign-In SDK. That plugin needs the SAME Client ID (as its
 *    "server client ID") plus, once you build the APK yourself, that build's SHA-1
 *    fingerprint + package name registered as an Android OAuth client in the same
 *    Google Cloud project. See README.md > "Configuring real Google Sign-In".
 *
 * If no Client ID is configured, isGoogleSignInConfigured() returns false and the
 * caller should disable the button rather than pretend to succeed.
 */

export interface GoogleProfile {
  email: string;
  name: string;
  picture?: string;
  sub: string; // Google's stable user id
}

const CLIENT_ID: string | undefined = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;

export function isGoogleSignInConfigured(): boolean {
  return typeof CLIENT_ID === "string" && CLIENT_ID.trim().length > 0;
}

export function isNativePlatform(): boolean {
  try {
    return Boolean((window as any).Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

// Decode a JWT payload without verifying the signature. Fine here because the
// token is only used to pre-fill local profile display data (name/email/avatar)
// for an app with no server-side session — never treat this as a verified
// identity for anything security-sensitive.
function decodeJwtPayload(jwt: string): any {
  const payloadB64 = jwt.split(".")[1] || "";
  const normalized = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const json = decodeURIComponent(
    atob(padded)
      .split("")
      .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
  );
  return JSON.parse(json);
}

let gisScriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (gisScriptPromise) return gisScriptPromise;
  gisScriptPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services script."));
    document.head.appendChild(script);
  });
  return gisScriptPromise;
}

// Web (browser / dev preview) sign-in via Google Identity Services.
// Resolves with the decoded profile, or rejects if the user cancels / it fails.
export function signInWithGoogleWeb(): Promise<GoogleProfile> {
  return new Promise(async (resolve, reject) => {
    if (!isGoogleSignInConfigured()) {
      reject(new Error("Google Sign-In is not configured (missing VITE_GOOGLE_CLIENT_ID)."));
      return;
    }

    try {
      await loadGisScript();
    } catch (err) {
      reject(err);
      return;
    }

    const google = (window as any).google;
    if (!google?.accounts?.id) {
      reject(new Error("Google Identity Services failed to load."));
      return;
    }

    try {
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response: { credential?: string }) => {
          if (!response?.credential) {
            reject(new Error("Google Sign-In did not return a credential."));
            return;
          }
          try {
            const payload = decodeJwtPayload(response.credential);
            resolve({
              email: payload.email,
              name: payload.name || payload.email,
              picture: payload.picture,
              sub: payload.sub,
            });
          } catch (err) {
            reject(err);
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      // The One Tap prompt is the most reliable path inside a modal (no button DOM needed).
      google.accounts.id.prompt((notification: any) => {
        if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
          reject(new Error("Google Sign-In prompt was dismissed or blocked by the browser."));
        }
      });
    } catch (err) {
      reject(err as Error);
    }
  });
}

// Native Android sign-in, used when this app runs inside the packaged Capacitor
// WebView. Requires @codetrix-studio/capacitor-google-auth to be installed and
// initialized (see capacitor.config.ts) — dynamically imported so the web build
// doesn't need the native plugin present.
export async function signInWithGoogleNative(): Promise<GoogleProfile> {
  let GoogleAuth: any;
  try {
    ({ GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth"));
  } catch {
    throw new Error(
      "Native Google Sign-In plugin is not installed in this build. Run `npm install @codetrix-studio/capacitor-google-auth` and `npx cap sync android`."
    );
  }

  if (!isGoogleSignInConfigured()) {
    throw new Error("Google Sign-In is not configured (missing VITE_GOOGLE_CLIENT_ID).");
  }

  const user = await GoogleAuth.signIn();
  return {
    email: user.email,
    name: user.name || user.email,
    picture: user.imageUrl,
    sub: user.id,
  };
}

export async function signInWithGoogle(): Promise<GoogleProfile> {
  return isNativePlatform() ? signInWithGoogleNative() : signInWithGoogleWeb();
}
