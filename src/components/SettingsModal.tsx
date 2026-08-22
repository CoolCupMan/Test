import React, { useState } from "react";
import { Settings, User, RotateCcw, Sliders, Moon, Sun, X } from "lucide-react";
import { EditorSession } from "../types";

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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSession({
      userName,
      autoOpenLastDoc,
      wordWrap,
      showLineNumbers,
      slowScrollRatio,
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
            <h2 className="font-bold text-base sm:text-lg">binarycore Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-4 text-xs sm:text-sm">
          {/* User Name Setting */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-300 flex items-center space-x-1.5">
              <User className="w-4 h-4 text-emerald-400" />
              <span>User Name for Timestamps:</span>
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
              <div className="font-semibold text-slate-200">Reopen Last Document</div>
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
              <div className="font-semibold text-slate-200">Word Wrap (Vertical View Mode)</div>
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
              <div className="font-semibold text-slate-200">Continuous Line Numbers</div>
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
              <span>Right Slow Scroll Speed Ratio:</span>
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

          {/* Submit */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
