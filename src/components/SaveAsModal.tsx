import React, { useState, useEffect } from "react";
import {
  Save,
  Download,
  FolderOpen,
  X,
  FileCode,
  FileText,
  Globe,
  Check,
  HardDrive,
  FolderPlus,
} from "lucide-react";
import { VirtualFile } from "../types";
import {
  listVirtualDirectory,
  saveVirtualFile,
  saveFileAsExternal,
  joinLinesAsync,
} from "../lib/indexedDbStorage";
import { formatAsChromeHtmlViewer } from "../lib/htmlExportFormatter";
import { isNativePlatform } from "../lib/nativeFileSystem";

interface SaveAsModalProps {
  currentFile: VirtualFile | null;
  lines: string[];
  darkTheme: boolean;
  onClose: () => void;
  onSaved: (savedFile: VirtualFile) => void;
}

const COMMON_EXTENSIONS = [
  { ext: "txt", label: ".txt (Text File)", icon: FileText, color: "text-emerald-400" },
  { ext: "dat", label: ".dat (Data Record)", icon: FileCode, color: "text-amber-400" },
  { ext: "html", label: ".html (Web Page)", icon: Globe, color: "text-orange-400" },
  { ext: "md", label: ".md (Markdown)", icon: FileText, color: "text-indigo-400" },
  { ext: "json", label: ".json (JSON Data)", icon: FileCode, color: "text-cyan-400" },
  { ext: "csv", label: ".csv (Comma Separated)", icon: FileText, color: "text-teal-400" },
  { ext: "log", label: ".log (Log File)", icon: FileText, color: "text-slate-400" },
];

export const SaveAsModal: React.FC<SaveAsModalProps> = ({
  currentFile,
  lines,
  darkTheme,
  onClose,
  onSaved,
}) => {
  const initialName = currentFile?.name || "untitled.txt";
  const initialParts = initialName.split(".");
  const initialExt = initialParts.length > 1 ? initialParts.pop() || "txt" : "txt";
  const initialBaseName = initialParts.join(".");

  const [baseName, setBaseName] = useState(initialBaseName || "untitled");
  const [selectedExt, setSelectedExt] = useState(initialExt.toLowerCase());
  const [customExt, setCustomExt] = useState("");
  const [useCustomExt, setUseCustomExt] = useState(false);

  const [targetDirPath, setTargetDirPath] = useState(
    currentFile?.parentPath || "/storage/emulated/0/Documents"
  );
  const [availableFolders, setAvailableFolders] = useState<VirtualFile[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Load directory options
  useEffect(() => {
    async function loadFolders() {
      try {
        const items = await listVirtualDirectory(targetDirPath);
        setAvailableFolders(items.filter((item) => item.isDirectory));
      } catch (err) {
        console.error("Failed to list folders:", err);
      }
    }
    loadFolders();
  }, [targetDirPath]);

  const activeExt = useCustomExt && customExt.trim() ? customExt.trim().replace(/^\./, "") : selectedExt;
  const finalFileName = `${baseName.trim() || "untitled"}.${activeExt}`;
  const finalFilePath = `${targetDirPath}/${finalFileName}`;

  // Save to In-App Virtual Storage
  const handleSaveToVirtualFs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baseName.trim()) return;

    setIsSaving(true);
    setSaveStatus("Saving file to storage...");

    try {
      const now = Date.now();
      const mimeType =
        activeExt === "html" || activeExt === "htm"
          ? "text/html"
          : activeExt === "json"
          ? "application/json"
          : activeExt === "dat"
          ? "application/octet-stream"
          : "text/plain";

      let currentContent = await joinLinesAsync(lines);
      if ((activeExt === "html" || activeExt === "htm") && !currentContent.trim().toLowerCase().startsWith("<!doctype") && !currentContent.trim().toLowerCase().startsWith("<html")) {
        currentContent = formatAsChromeHtmlViewer(finalFileName, lines);
      }

      const savedFile: VirtualFile = {
        path: finalFilePath,
        name: finalFileName,
        content: currentContent,
        size: currentContent.length,
        createdAt: currentFile?.createdAt || now,
        updatedAt: now,
        mimeType,
        extension: activeExt,
        isDirectory: false,
        parentPath: targetDirPath,
      };

      await saveVirtualFile(savedFile);
      setSaveStatus(`Saved successfully as ${finalFileName}`);
      setTimeout(() => {
        onSaved(savedFile);
        onClose();
      }, 300);
    } catch (err: any) {
      console.error("Save error:", err);
      setSaveStatus("Failed to save file.");
    } finally {
      setIsSaving(false);
    }
  };

  // Export / Save anywhere on local device or computer
  const handleSaveToDevice = async () => {
    if (!baseName.trim()) return;

    setIsSaving(true);
    setSaveStatus(isNativePlatform() ? "Saving to device storage..." : "Opening save file dialog...");

    try {
      const mimeType =
        activeExt === "html" || activeExt === "htm"
          ? "text/html"
          : activeExt === "json"
          ? "application/json"
          : activeExt === "dat"
          ? "application/octet-stream"
          : "text/plain";

      let currentContent = await joinLinesAsync(lines);
      if ((activeExt === "html" || activeExt === "htm") && !currentContent.trim().toLowerCase().startsWith("<!doctype") && !currentContent.trim().toLowerCase().startsWith("<html")) {
        currentContent = formatAsChromeHtmlViewer(finalFileName, lines);
      }

      const fileToExport: VirtualFile = {
        path: finalFilePath,
        name: finalFileName,
        content: currentContent,
        size: currentContent.length,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        mimeType,
        extension: activeExt,
        isDirectory: false,
        parentPath: targetDirPath,
      };

      const result = await saveFileAsExternal(fileToExport);
      setSaveStatus(result.message);
      if (result.ok) {
        // Also save to virtual storage so active document updates
        await saveVirtualFile(fileToExport);
        setTimeout(() => {
          onSaved(fileToExport);
          onClose();
        }, 600);
      }
    } catch (err: any) {
      console.error("External save error:", err);
      setSaveStatus("Error saving file to device.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFolderUp = () => {
    if (targetDirPath === "/storage/emulated/0") return;
    const parts = targetDirPath.split("/");
    parts.pop();
    setTargetDirPath(parts.join("/") || "/storage/emulated/0");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div
        className={`w-full max-w-2xl rounded-xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${
          darkTheme ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-600 rounded-lg text-white shadow-md">
              <Save className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg">Save File As</h2>
              <p className="text-xs text-slate-400">
                Save .txt, .dat, .html or other text documents to in-app storage or anywhere on device
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSaveToVirtualFs} className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Filename & Extension Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              File Name & Format
            </label>
            <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
              <input
                type="text"
                value={baseName}
                onChange={(e) => setBaseName(e.target.value)}
                placeholder="document_name"
                className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
                autoFocus
              />

              {!useCustomExt ? (
                <select
                  value={selectedExt}
                  onChange={(e) => {
                    if (e.target.value === "custom") {
                      setUseCustomExt(true);
                    } else {
                      setSelectedExt(e.target.value);
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-emerald-400 font-mono text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 shrink-0"
                >
                  {COMMON_EXTENSIONS.map((item) => (
                    <option key={item.ext} value={item.ext}>
                      .{item.ext}
                    </option>
                  ))}
                  <option value="custom">Other Extension...</option>
                </select>
              ) : (
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="text"
                    value={customExt}
                    onChange={(e) => setCustomExt(e.target.value)}
                    placeholder="ext (e.g. xml)"
                    className="w-24 px-2 py-2 rounded-lg bg-slate-950 border border-slate-700 text-amber-300 font-mono text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setUseCustomExt(false)}
                    className="px-2 py-2 rounded bg-slate-800 text-slate-400 text-xs hover:text-slate-200"
                    title="Choose standard extension"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            {/* Preview filename */}
            <div className="text-xs font-mono text-emerald-400/90 flex items-center gap-1.5 pt-1">
              <span>Full Output Name:</span>
              <span className="font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-emerald-300">
                {finalFileName}
              </span>
            </div>
          </div>

          {/* Preset Extension Quick Selector */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Quick Format Presets:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_EXTENSIONS.map((item) => {
                const IconComponent = item.icon;
                const isSelected = !useCustomExt && selectedExt === item.ext;
                return (
                  <button
                    key={item.ext}
                    type="button"
                    onClick={() => {
                      setUseCustomExt(false);
                      setSelectedExt(item.ext);
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium flex items-center space-x-1.5 border transition-all ${
                      isSelected
                        ? "bg-emerald-600 text-white border-emerald-500 shadow-sm"
                        : "bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700"
                    }`}
                  >
                    <IconComponent className={`w-3.5 h-3.5 ${item.color}`} />
                    <span>.{item.ext}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Directory Selector in In-App Storage */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-emerald-400" />
                <span>In-App Destination Folder</span>
              </label>
              {targetDirPath !== "/storage/emulated/0" && (
                <button
                  type="button"
                  onClick={handleFolderUp}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-mono"
                >
                  ↑ Parent Folder
                </button>
              )}
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 truncate">
              {targetDirPath}
            </div>

            {/* Subfolders List */}
            {availableFolders.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[11px] text-slate-500 self-center mr-1">Subfolders:</span>
                {availableFolders.map((folder) => (
                  <button
                    key={folder.path}
                    type="button"
                    onClick={() => setTargetDirPath(folder.path)}
                    className="px-2.5 py-1 rounded bg-slate-800/90 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-mono flex items-center gap-1"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                    <span>{folder.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status Message */}
          {saveStatus && (
            <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono animate-pulse flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>{saveStatus}</span>
            </div>
          )}

          {/* Modal Action Buttons */}
          <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleSaveToDevice}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center space-x-1.5 shadow-md disabled:opacity-50"
              title="Save directly anywhere on local device or phone storage"
            >
              <Download className="w-4 h-4 text-indigo-200" />
              <span>Save Anywhere to Device</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white flex items-center space-x-1.5 shadow-md disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>Save to In-App Storage</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
