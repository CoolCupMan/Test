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

/**
 * Parse a fetch Response as JSON, but fail with a clear, actionable message
 * instead of the cryptic "Unexpected token '<', "<!doctype "... is not valid
 * JSON" you get from calling res.json() on an HTML page. That HTML shows up
 * whenever this app's own /api/... endpoint is hit with no real server behind
 * it — e.g. the packaged Android app's WebView answers any unknown path with
 * index.html instead of a 404.
 */
export async function parseJsonResponse(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      res.ok
        ? "Server returned an unexpected non-JSON response."
        : `No AI server reachable at "${API_BASE || "(same origin)"}" (HTTP ${res.status}). Enter your own API key above instead of relying on the server default, or set VITE_API_BASE_URL if you're running the packaged app.`
    );
  }
}
