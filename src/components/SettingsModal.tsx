import React, { useEffect, useState } from "react";
import { Settings, User, RotateCcw, Sliders, Moon, Sun, X, Globe, HardDrive, Check } from "lucide-react";
import { EditorSession } from "../types";
import { t, SUPPORTED_LANGUAGES } from "../lib/i18n";
import { isNativePlatform, checkDiskAccessStatus, requestFullDiskAccess } from "../lib/nativeFileSystem";

interface SettingsModalProps {
  session: EditorSession;
  darkTheme: boolean;
  onUpdateSession: (newSession: Partial<EditorSession>) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  session,
  darkTheme,
  onUpdateSession,
  onClose,
}) => {
  const [userName, setUserName] = useState(session.userName || "User");
  const [autoOpenLastDoc, setAutoOpenLastDoc] = useState(session.autoOpenLastDoc ?? true);
  const [wordWrap, setWordWrap] = useState(session.wordWrap ?? true);
  const [showLineNumbers, setShowLineNumbers] = useState(session.showLineNumbers ?? true);
  const [slowScrollRatio, setSlowScrollRatio] = useState(session.slowScrollRatio ?? 0.1);
  const [language, setLanguage] = useState(session.language || "en");

  // Use the locally-edited (not-yet-saved) language so the labels in this
  // modal preview the switch immediately, before Save commits it app-wide.
  const lang = language;

  // Full Disk Access — a standalone, explicit, one-time permission request,
  // entirely separate from Save/Save As's own automatic check (unchanged).
  // Some devices/Android skins (reported on Ulefone rugged phones) don't
  // reliably surface the OS permission prompt when it's requested
  // implicitly mid-save, so this lets it be granted explicitly ahead of
  // time instead. Native-only: the underlying permission doesn't exist on
  // the web build.
  const [diskAccessGranted, setDiskAccessGranted] = useState<boolean | null>(null);
  const [diskAccessMessage, setDiskAccessMessage] = useState<string | null>(null);
  const [diskAccessChecking, setDiskAccessChecking] = useState(false);

  useEffect(() => {
    if (!isNativePlatform()) return;
    checkDiskAccessStatus().then((status) => setDiskAccessGranted(status.granted));
  }, []);

  const handleRequestDiskAccess = async () => {
    setDiskAccessChecking(true);
    setDiskAccessMessage(null);
    const status = await requestFullDiskAccess();
    setDiskAccessGranted(status.granted);
    setDiskAccessMessage(status.message);
    setDiskAccessChecking(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSession({
      userName,
      autoOpenLastDoc,
      wordWrap,
      showLineNumbers,
      slowScrollRatio,
      language,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full max-w-lg rounded-xl border shadow-2xl flex flex-col overflow-hidden ${
          darkTheme ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-base sm:text-lg">binarycore {t(lang, "settingsHeading")}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-4 text-xs sm:text-sm">
          {/* Language Selector */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-300 flex items-center space-x-1.5">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>{t(lang, "languageLabel")}:</span>
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName} {l.nativeName !== l.englishName ? `(${l.englishName})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* User Name Setting */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-300 flex items-center space-x-1.5">
              <User className="w-4 h-4 text-emerald-400" />
              <span>{t(lang, "userNameLabel")}</span>
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Your full name"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
            />
            <p className="text-[11px] text-slate-400">
              Appears behind timestamp entries, e.g. <code className="text-emerald-400">[2026-08-10] {userName}:</code>
            </p>
          </div>

          {/* Auto Open Last Document */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/60">
            <div>
              <div className="font-semibold text-slate-200">{t(lang, "reopenLastDoc")}</div>
              <div className="text-[11px] text-slate-400">
                Automatically loads previous file on app restart or phone reboot
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoOpenLastDoc}
              onChange={(e) => setAutoOpenLastDoc(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-700 focus:ring-emerald-500"
            />
          </div>

          {/* Word Wrap / Vertical Reading Mode */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/60">
            <div>
              <div className="font-semibold text-slate-200">{t(lang, "wordWrapLabel")}</div>
              <div className="text-[11px] text-slate-400">
                Fits all characters on screen without horizontal scrolling
              </div>
            </div>
            <input
              type="checkbox"
              checked={wordWrap}
              onChange={(e) => setWordWrap(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-700 focus:ring-emerald-500"
            />
          </div>

          {/* Show Line Numbers */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/60">
            <div>
              <div className="font-semibold text-slate-200">{t(lang, "lineNumbersLabel")}</div>
              <div className="text-[11px] text-slate-400">
                Always show line numbers on left side for up to 1,000,000+ lines
              </div>
            </div>
            <input
              type="checkbox"
              checked={showLineNumbers}
              onChange={(e) => setShowLineNumbers(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-700 focus:ring-emerald-500"
            />
          </div>

          {/* Precision / Slow Scroll Speed */}
          <div className="space-y-1 p-3 rounded-lg bg-slate-800/40 border border-slate-700/60">
            <div className="flex justify-between items-center font-semibold text-slate-200">
              <span>{t(lang, "scrollSpeedLabel")}</span>
              <span className="font-mono text-emerald-400">{(slowScrollRatio * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.02"
              max="0.5"
              step="0.01"
              value={slowScrollRatio}
              onChange={(e) => setSlowScrollRatio(parseFloat(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <p className="text-[11px] text-slate-400">
              Adjusts precision scroll speed for fine line-by-line inspection on right slider
            </p>
          </div>

          {/* Restart App — a full, immediate reload of the app, exactly like
              closing and reopening it after a phone restart. It goes straight
              back to the normal app screen with no extra prompt or in-between
              screen, and doesn't touch or bypass the Reopen Last Document
              setting above — that setting's own normal startup check runs
              again unchanged, same as any other fresh launch. */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/60">
            <div>
              <div className="font-semibold text-slate-200">{t(lang, "restartAppBtn")}</div>
              <div className="text-[11px] text-slate-400">
                Reloads the app fresh, the same as if you restarted your phone and opened it again
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 transition-colors shrink-0"
              title={t(lang, "restartAppBtn")}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Grant Disk Access — standalone, explicit, one-time storage
              permission request for devices (e.g. Ulefone rugged phones)
              where the automatic prompt during Save/Save As doesn't
              reliably surface. Entirely separate control: Save, Save As,
              and their floppy-disk buttons are completely untouched. */}
          {isNativePlatform() && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/60">
              <div>
                <div className="font-semibold text-slate-200">{t(lang, "diskAccessBtn")}</div>
                <div className="text-[11px] text-slate-400">
                  One-time storage permission for saving text files onto the phone — helps on devices (e.g. Ulefone) where it isn't reliably prompted during Save
                </div>
                {diskAccessMessage && (
                  <div className="text-[11px] text-emerald-400 mt-0.5">{diskAccessMessage}</div>
                )}
              </div>
              <button
                type="button"
                onClick={handleRequestDiskAccess}
                disabled={diskAccessChecking || diskAccessGranted === true}
                className={`p-2 rounded-lg border transition-colors shrink-0 disabled:opacity-70 ${
                  diskAccessGranted === true
                    ? "bg-emerald-900/60 border-emerald-600 text-emerald-400"
                    : "bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
                }`}
                title={t(lang, "diskAccessBtn")}
              >
                {diskAccessGranted === true ? <Check className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
              </button>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {t(lang, "saveSettingsBtn")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
