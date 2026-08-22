/**
 * Real file saving for the packaged Android app.
 *
 * The web build's save/export used a Blob + `<a download>` click, which only
 * works in real browsers. Android's WebView (what the packaged app runs in)
 * does not support the `download` attribute at all — the click either does
 * nothing or gets handed off to a generic "open with" resolver, which is what
 * showed up as "save cancelled" / getting redirected to the stock file
 * manager instead of actually saving.
 *
 * The fix: write the file for real using the native Capacitor Filesystem
 * plugin, directly into the public `/storage/emulated/0/Documents/` folder.
 * That's real shared Android storage — any file manager (stock Files app,
 * Amaze, Dateimanager+, X-plore/"BD File Manager", etc.) can browse to it and
 * open the file later, the same as if it had been saved from any other app.
 */
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { VirtualFile } from "../types";
import { isNativePlatform } from "./googleAuth";

export { isNativePlatform };

export interface NativeSaveResult {
  ok: boolean;
  path?: string;
  message: string;
}

// Android 6-10 require the runtime storage permission for writes to public
// directories; Android 11+ doesn't need it for this plugin's approach (see
// FilesystemPlugin's own permission gate), but requesting is a harmless no-op
// there and the correct thing to do on older devices.
async function ensureStoragePermission(): Promise<boolean> {
  try {
    const status = await Filesystem.checkPermissions();
    if (status.publicStorage === "granted") return true;
    const requested = await Filesystem.requestPermissions();
    return requested.publicStorage === "granted";
  } catch {
    // Some Android versions/plugin versions don't implement permission
    // checks at all (not needed there) — treat that as "fine, proceed".
    return true;
  }
}

export async function saveFileToPublicStorage(file: VirtualFile): Promise<NativeSaveResult> {
  try {
    const granted = await ensureStoragePermission();
    if (!granted) {
      return {
        ok: false,
        message: "Storage permission denied — grant it in Android Settings > Apps > binarycore3d3x > Permissions to save files.",
      };
    }

    await Filesystem.writeFile({
      path: file.name,
      data: file.content,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    });

    const path = `/storage/emulated/0/Documents/${file.name}`;
    return { ok: true, path, message: `Saved to ${path} — open it from any file manager.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to save file to device storage." };
  }
}
