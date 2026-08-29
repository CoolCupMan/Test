/**
 * App version shown in Settings — the exact, precise iteration count of the
 * whole source history: the original app (built in Google AI Studio) plus
 * every update since (all done here). It's not a hand-maintained number that
 * could drift out of date — CI computes it fresh on every build as the
 * total commit count (`git rev-list --count HEAD`, see
 * .github/workflows/build-android-apk.yml) and bakes it in via
 * VITE_APP_VERSION, so it always exactly matches what actually shipped in
 * that build, automatically, without needing to be bumped by hand.
 *
 * Falls back to "dev" for local/dev builds run outside that CI workflow
 * (e.g. `npm run dev`), where the exact commit count isn't injected.
 */
export const APP_VERSION: string = (import.meta as any).env?.VITE_APP_VERSION || "dev";
