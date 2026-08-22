/**
 * Base URL for the app's own Express API (/api/ai/analyze, /api/auth/verify-key).
 *
 * In the web/dev preview, requests are same-origin so this stays empty ("").
 * The packaged Android app has no on-device Node server — its WebView loads static
 * assets only — so relative fetch("/api/...") calls have nothing to reach. Set
 * VITE_API_BASE_URL at build time to the deployed server's URL (the same one
 * documented as APP_URL in .env.example) before running `npx cap sync android`,
 * and native requests will target that instead.
 */
export const API_BASE: string = ((import.meta as any).env?.VITE_API_BASE_URL || "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
