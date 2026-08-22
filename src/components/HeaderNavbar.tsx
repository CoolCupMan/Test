import React from "react";
import {
  FileText,
  FolderOpen,
  Sparkles,
  Search,
  Sun,
  Moon,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Settings,
  Download,
  FileCode,
  LogIn,
  User,
  PlusCircle,
  Save,
  Globe,
} from "lucide-react";
import { UserAccount } from "./AuthModal";

interface HeaderNavbarProps {
  currentFileName: string;
  fileExtension: string;
  totalLines: number;
  darkTheme: boolean;
  userAccount: UserAccount | null;
  aiMatchesCount?: number;
  showAiMatchToolbar?: boolean;
  onToggleTheme: () => void;
  onOpenFileManager: () => void;
  onOpenAiModal: () => void;
  onOpenSearch: () => void;
  onToggleAiMatchToolbar?: () => void;
  onJumpTop: () => void;
  onJumpBottom: () => void;
  onOpenSettings: () => void;
  onQuickSave: () => void;
  onOpenSaveAs: () => void;
  onExportFile: () => void;
  onReopenLastDoc: () => void;
  onOpenAuth: () => void;
  onNewLineAtBottom?: () => void;
}

export const HeaderNavbar: React.FC<HeaderNavbarProps> = ({
  currentFileName,
  fileExtension,
  totalLines,
  darkTheme,
  userAccount,
  aiMatchesCount = 0,
  showAiMatchToolbar = false,
  onToggleTheme,
  onOpenFileManager,
  onOpenAiModal,
  onOpenSearch,
  onToggleAiMatchToolbar,
  onJumpTop,
  onJumpBottom,
  onOpenSettings,
  onQuickSave,
  onOpenSaveAs,
  onExportFile,
  onReopenLastDoc,
  onOpenAuth,
  onNewLineAtBottom,
}) => {
  const ext = (fileExtension || "").toLowerCase();
  const isHtml = ext === "html" || ext === "htm";
  const isDat = ext === "dat";
  const isJsonOrMd = ext === "json" || ext === "md" || ext === "csv";

  return (
    <header
      id="binarycore-header"
      className={`sticky top-0 z-50 shrink-0 border-b shadow-md transition-colors ${
        darkTheme
          ? "bg-slate-900 border-slate-800 text-slate-100"
          : "bg-slate-50 border-slate-200 text-slate-900"
      }`}
    >
      {/* Top Main Status Bar */}
      <div className="max-w-7xl mx-auto px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        {/* App Title & File Badge */}
        <div className="flex items-center space-x-2">
          <div className="bg-emerald-600 text-white p-1.5 rounded-lg flex items-center justify-center shadow-sm">
            {isHtml ? (
              <Globe className="w-5 h-5 text-orange-200" />
            ) : (
              <FileCode className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold tracking-tight text-base sm:text-lg bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
                binarycore
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded font-mono font-semibold uppercase ${
                  isHtml
                    ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                    : isDat
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : isJsonOrMd
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                .{ext || "txt"}
              </span>
            </div>
            <div className="text-xs text-slate-400 truncate max-w-[180px] sm:max-w-xs flex items-center gap-1">
              <FileText className="w-3 h-3 inline" />
              <span className="truncate">{currentFileName}</span>
              <span className="opacity-60">({totalLines.toLocaleString()} lines)</span>
            </div>
          </div>
        </div>

        {/* Quick Action Controls */}
        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 z-20">
          {/* Quick Save Button */}
          <button
            type="button"
            id="btn-quick-save"
            onClick={(e) => {
              e.stopPropagation();
              onQuickSave();
            }}
            className="px-3 py-2 min-h-[38px] rounded-lg text-xs font-bold flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-md transition-all active:scale-95 touch-manipulation cursor-pointer select-none shrink-0"
            title="Save file changes immediately to in-app storage"
          >
            <Save className="w-4 h-4 text-emerald-100" />
            <span>Save</span>
          </button>

          {/* Save As Button */}
          <button
            type="button"
            id="btn-save-as"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSaveAs();
            }}
            className={`px-3 py-2 min-h-[38px] rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all touch-manipulation cursor-pointer select-none shrink-0 ${
              darkTheme
                ? "bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-teal-300 border border-slate-700"
                : "bg-white hover:bg-slate-100 active:bg-slate-200 text-teal-700 border border-slate-300"
            }`}
            title="Save file as .txt, .dat, .html, or export anywhere on device"
          >
            <Download className="w-4 h-4 text-teal-400" />
            <span className="inline">Save As...</span>
          </button>

          {/* New Line at Bottom Button from Topper Menu */}
          {onNewLineAtBottom && (
            <button
              id="btn-topper-new-line"
              onClick={onNewLineAtBottom}
              className="px-2.5 py-1.5 rounded-md text-xs font-bold flex items-center space-x-1 bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/70 shadow-sm transition-all active:scale-95"
              title="Create new line at bottom from topper menu and open text writing box"
            >
              <PlusCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">+ New Line</span>
            </button>
          )}

          {/* Internal File Manager Button */}
          <button
            id="btn-file-manager"
            onClick={onOpenFileManager}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1 transition-all ${
              darkTheme
                ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                : "bg-white hover:bg-slate-100 text-slate-800 border border-slate-300"
            }`}
            title="Open Internal Android File Manager (/storage/emulated/0/)"
          >
            <FolderOpen className="w-4 h-4 text-emerald-500" />
            <span className="hidden sm:inline">Files</span>
          </button>

          {/* AI Analysis Window Button */}
          <button
            id="btn-ai-analysis"
            onClick={onOpenAiModal}
            className="px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white shadow-sm"
            title="AI Text Analysis (Gemini, OpenAI, Local AI)"
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>AI Search</span>
          </button>

          {/* AI Jump Toolbar Toggle Button (when AI matches exist) */}
          {aiMatchesCount > 0 && onToggleAiMatchToolbar && (
            <button
              id="btn-ai-jump-toolbar"
              onClick={onToggleAiMatchToolbar}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1 border transition-all ${
                showAiMatchToolbar
                  ? "bg-teal-600 text-white border-teal-500 shadow-sm"
                  : "bg-teal-950/80 hover:bg-teal-900 text-teal-300 border-teal-600/60"
              }`}
              title="Jump between AI found matching texts"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>AI Jump ({aiMatchesCount})</span>
            </button>
          )}

          {/* Character Search Toolbar Button */}
          <button
            id="btn-search-toolbar"
            onClick={onOpenSearch}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1 ${
              darkTheme
                ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                : "bg-white hover:bg-slate-100 text-slate-800 border border-slate-300"
            }`}
            title="Find exact character matches up to 1,000,000+ lines"
          >
            <Search className="w-4 h-4 text-cyan-500" />
            <span className="hidden sm:inline">Find</span>
          </button>

          {/* Jump Top & Jump Bottom Controls */}
          <div className="flex items-center border rounded-md overflow-hidden border-slate-700">
            <button
              id="btn-jump-top"
              onClick={onJumpTop}
              className={`p-1.5 text-xs transition-colors ${
                darkTheme ? "bg-slate-800 hover:bg-slate-700 text-slate-300" : "bg-white hover:bg-slate-100 text-slate-700"
              }`}
              title="Jump instantly to Top (Line 1)"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
            <button
              id="btn-jump-bottom"
              onClick={onJumpBottom}
              className={`p-1.5 text-xs border-l border-slate-700 transition-colors ${
                darkTheme ? "bg-slate-800 hover:bg-slate-700 text-slate-300" : "bg-white hover:bg-slate-100 text-slate-700"
              }`}
              title="Jump instantly to Bottom"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          </div>

          {/* Reopen Last Document Toggle */}
          <button
            id="btn-reopen-last-doc"
            onClick={onReopenLastDoc}
            className={`p-1.5 rounded-md text-xs transition-colors ${
              darkTheme
                ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-300"
            }`}
            title="Open last document from previous session"
          >
            <RotateCcw className="w-4 h-4 text-indigo-400" />
          </button>

          {/* Export to Android Device */}
          <button
            id="btn-export-local"
            onClick={onExportFile}
            className={`p-1.5 rounded-md text-xs transition-colors ${
              darkTheme
                ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-300"
            }`}
            title="Save/Export file to local Android Phone Storage for external file managers"
          >
            <Download className="w-4 h-4 text-emerald-400" />
          </button>

          {/* Settings Modal */}
          <button
            id="btn-app-settings"
            onClick={onOpenSettings}
            className={`p-1.5 rounded-md text-xs transition-colors ${
              darkTheme
                ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-300"
            }`}
            title="Settings (Username, Credentials, Viewport)"
          >
            <Settings className="w-4 h-4 text-amber-400" />
          </button>

          {/* Login / Auth Button */}
          <button
            id="btn-app-auth"
            onClick={onOpenAuth}
            className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              userAccount?.isLoggedIn
                ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30"
                : "bg-teal-600 hover:bg-teal-500 text-white shadow-sm"
            }`}
            title="Anmeldung / Login (Email, Google, OpenAI)"
          >
            {userAccount?.isLoggedIn ? (
              <>
                <User className="w-3.5 h-3.5 text-emerald-400" />
                <span className="truncate max-w-[80px] sm:max-w-[120px]">{userAccount.username}</span>
              </>
            ) : (
              <>
                <LogIn className="w-3.5 h-3.5" />
                <span>Anmelden</span>
              </>
            )}
          </button>

          {/* Light / Dark Mode Toggle */}
          <button
            id="btn-theme-toggle"
            onClick={onToggleTheme}
            className={`p-1.5 rounded-md text-xs transition-colors ${
              darkTheme
                ? "bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700"
                : "bg-white hover:bg-slate-100 text-indigo-600 border border-slate-300"
            }`}
            title="Toggle Light / Dark Mode"
          >
            {darkTheme ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
