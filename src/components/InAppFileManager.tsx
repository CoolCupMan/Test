import React, { useState, useEffect } from "react";
import {
  FolderOpen,
  FileText,
  FileCode,
  FolderPlus,
  FilePlus,
  Trash2,
  Download,
  Upload,
  ArrowLeft,
  X,
  HardDrive,
  Folder,
  Globe,
} from "lucide-react";
import { VirtualFile } from "../types";
import {
  listVirtualDirectory,
  saveVirtualFile,
  deleteVirtualFile,
  exportFileToLocalDevice,
  readVirtualFile,
} from "../lib/indexedDbStorage";

interface InAppFileManagerProps {
  currentDirPath: string;
  darkTheme: boolean;
  onClose: () => void;
  onSelectFile: (file: VirtualFile) => void;
  onDirectoryChange: (dirPath: string) => void;
}

export const InAppFileManager: React.FC<InAppFileManagerProps> = ({
  currentDirPath,
  darkTheme,
  onClose,
  onSelectFile,
  onDirectoryChange,
}) => {
  const [items, setItems] = useState<VirtualFile[]>([]);
  const [newFileName, setNewFileName] = useState("");
  const [newFileExt, setNewFileExt] = useState<string>("txt");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFileForm, setShowNewFileForm] = useState(false);
  const [showNewFolderForm, setShowNewFolderForm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  // Load files in current directory
  const loadDirectory = async (path: string) => {
    try {
      const files = await listVirtualDirectory(path);
      setItems(files);
      onDirectoryChange(path);
    } catch (err) {
      console.error("Failed to list directory:", err);
    }
  };

  useEffect(() => {
    loadDirectory(currentDirPath);
  }, [currentDirPath]);

  // Navigate up to parent folder
  const handleGoUp = () => {
    if (currentDirPath === "/storage/emulated/0") return;
    const parts = currentDirPath.split("/");
    parts.pop();
    const parentPath = parts.join("/") || "/storage/emulated/0";
    loadDirectory(parentPath);
  };

  // Create new file inside current virtual path
  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;

    const ext = newFileExt.replace(/^\./, "").toLowerCase();
    const fileNameWithExt = newFileName.toLowerCase().endsWith(`.${ext}`)
      ? newFileName
      : `${newFileName}.${ext}`;

    const filePath = `${currentDirPath}/${fileNameWithExt}`;
    const now = Date.now();

    const initialContent =
      ext === "html" || ext === "htm"
        ? `<!DOCTYPE html>\n<html>\n<head>\n  <title>${newFileName}</title>\n</head>\n<body>\n  <h1>${newFileName}</h1>\n  <p>Created in binarycore</p>\n</body>\n</html>\n`
        : ext === "json"
        ? `{\n  "name": "${newFileName}",\n  "created": "${new Date().toISOString()}"\n}\n`
        : `[${new Date().toISOString().slice(0, 19).replace("T", " ")}] binarycore initialized.\n`;

    const mimeType =
      ext === "html" || ext === "htm"
        ? "text/html"
        : ext === "json"
        ? "application/json"
        : ext === "dat"
        ? "application/octet-stream"
        : "text/plain";

    const newFile: VirtualFile = {
      path: filePath,
      name: fileNameWithExt,
      content: initialContent,
      size: initialContent.length,
      createdAt: now,
      updatedAt: now,
      mimeType,
      extension: ext,
      isDirectory: false,
      parentPath: currentDirPath,
    };

    await saveVirtualFile(newFile);
    setNewFileName("");
    setShowNewFileForm(false);
    loadDirectory(currentDirPath);
    onSelectFile(newFile);
  };

  // Create new folder inside current virtual path
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const folderPath = `${currentDirPath}/${newFolderName}`;
    const now = Date.now();

    const newFolder: VirtualFile = {
      path: folderPath,
      name: newFolderName,
      content: "",
      size: 0,
      createdAt: now,
      updatedAt: now,
      mimeType: "text/plain",
      extension: "txt",
      isDirectory: true,
      parentPath: currentDirPath,
    };

    await saveVirtualFile(newFolder);
    setNewFolderName("");
    setShowNewFolderForm(false);
    loadDirectory(currentDirPath);
  };

  // Delete virtual file or folder
  const handleDeleteItem = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Delete item permanently from binarycore storage?")) {
      await deleteVirtualFile(path);
      loadDirectory(currentDirPath);
    }
  };

  // Import native file from local Android device
  const handleNativeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setIsUploading(true);
    setUploadStatus(`Loading ${uploadedFile.name} (${(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB)...`);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setUploadStatus("Processing file content into virtual storage...");
        const content = (event.target?.result as string) || "";
        const parts = uploadedFile.name.split(".");
        const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : "txt";
        const filePath = `${currentDirPath}/${uploadedFile.name}`;
        const now = Date.now();

        const mimeType =
          ext === "html" || ext === "htm"
            ? "text/html"
            : ext === "json"
            ? "application/json"
            : ext === "dat"
            ? "application/octet-stream"
            : "text/plain";

        const newVirtualFile: VirtualFile = {
          path: filePath,
          name: uploadedFile.name,
          content: content,
          size: uploadedFile.size,
          createdAt: now,
          updatedAt: now,
          mimeType,
          extension: ext,
          isDirectory: false,
          parentPath: currentDirPath,
        };

        setUploadStatus("Saving to IndexedDB storage...");
        await saveVirtualFile(newVirtualFile);
        await loadDirectory(currentDirPath);
        onSelectFile(newVirtualFile);
        onClose();
      } catch (err) {
        console.error("Error saving uploaded file:", err);
        alert("Failed to import file into storage.");
      } finally {
        setIsUploading(false);
        setUploadStatus("");
      }
    };

    reader.onerror = (err) => {
      console.error("FileReader error:", err);
      setIsUploading(false);
      setUploadStatus("");
      alert("Error reading file from device.");
    };

    reader.readAsText(uploadedFile);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full max-w-3xl rounded-xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${
          darkTheme ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {/* Header Bar */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center space-x-2">
            <HardDrive className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="font-bold text-base sm:text-lg">In-App Android File Manager</h2>
              <p className="text-xs text-slate-400 font-mono">
                {currentDirPath}
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

        {/* Toolbar Controls */}
        <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-900/50">
          <div className="flex items-center space-x-2">
            <button
              onClick={handleGoUp}
              disabled={currentDirPath === "/storage/emulated/0"}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Up</span>
            </button>

            <button
              onClick={() => setShowNewFileForm(!showNewFileForm)}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <FilePlus className="w-3.5 h-3.5" />
              <span>+ New File</span>
            </button>

            <button
              onClick={() => setShowNewFolderForm(!showNewFolderForm)}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            >
              <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
              <span>+ New Folder</span>
            </button>
          </div>

          {/* Import Native Phone File Button */}
          <label className="cursor-pointer px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm">
            <Upload className="w-3.5 h-3.5" />
            <span>Open Phone File</span>
            <input
              type="file"
              accept=".txt,.dat,.html,.htm,.md,.json,.csv,.log,.xml,.js,.ts,.css,.text,text/plain,text/html,application/json,*/*"
              onChange={handleNativeFileUpload}
              className="hidden"
            />
          </label>
        </div>

        {/* Upload & Reading Progress Indicator */}
        {isUploading && (
          <div className="p-3 bg-indigo-950/80 border-b border-indigo-800/60 flex items-center space-x-3 text-xs font-mono text-indigo-300 animate-pulse">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
            <span>{uploadStatus || "Processing file into storage..."}</span>
          </div>
        )}

        {/* New File Inline Form */}
        {showNewFileForm && (
          <form
            onSubmit={handleCreateFile}
            className="p-3 bg-emerald-950/30 border-b border-emerald-800/40 flex flex-wrap items-center gap-2"
          >
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="Filename (e.g. index or log_2026)"
              className="px-2.5 py-1 text-xs rounded border border-slate-700 bg-slate-900 text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 flex-1 min-w-[160px]"
              autoFocus
            />
            <select
              value={newFileExt}
              onChange={(e) => setNewFileExt(e.target.value)}
              className="px-2 py-1 text-xs rounded border border-slate-700 bg-slate-900 text-emerald-400 font-mono font-bold"
            >
              <option value="txt">.txt (Text)</option>
              <option value="dat">.dat (Data)</option>
              <option value="html">.html (Web)</option>
              <option value="md">.md (Markdown)</option>
              <option value="json">.json (JSON)</option>
              <option value="csv">.csv (Table)</option>
              <option value="log">.log (Log)</option>
            </select>
            <button
              type="submit"
              className="px-3 py-1 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Create
            </button>
          </form>
        )}

        {/* New Folder Inline Form */}
        {showNewFolderForm && (
          <form
            onSubmit={handleCreateFolder}
            className="p-3 bg-amber-950/30 border-b border-amber-800/40 flex flex-wrap items-center gap-2"
          >
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder Name"
              className="px-2.5 py-1 text-xs rounded border border-slate-700 bg-slate-900 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 flex-1 min-w-[160px]"
              autoFocus
            />
            <button
              type="submit"
              className="px-3 py-1 text-xs font-semibold rounded bg-amber-600 hover:bg-amber-500 text-white"
            >
              Create Folder
            </button>
          </form>
        )}

        {/* File List Grid / Table */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {items.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              This folder is empty. Create or open a file above.
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.path}
                onClick={async () => {
                  if (item.isDirectory) {
                    loadDirectory(item.path);
                  } else {
                    try {
                      setIsUploading(true);
                      setUploadStatus(`Opening ${item.name}...`);
                      const fullFile = (await readVirtualFile(item.path)) || item;
                      onSelectFile(fullFile);
                      onClose();
                    } catch (err) {
                      console.error("Error loading file:", err);
                      onSelectFile(item);
                      onClose();
                    } finally {
                      setIsUploading(false);
                      setUploadStatus("");
                    }
                  }
                }}
                className={`p-2.5 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
                  darkTheme
                    ? "bg-slate-800/40 hover:bg-slate-800 border-slate-700/60"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200"
                }`}
              >
                <div className="flex items-center space-x-3 truncate">
                  {item.isDirectory ? (
                    <Folder className="w-5 h-5 text-amber-400 shrink-0" />
                  ) : item.extension === "html" || item.extension === "htm" ? (
                    <Globe className="w-5 h-5 text-orange-400 shrink-0" />
                  ) : item.extension === "dat" || item.extension === "json" ? (
                    <FileCode className="w-5 h-5 text-amber-500 shrink-0" />
                  ) : (
                    <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
                  )}

                  <div className="truncate">
                    <div className="text-xs font-medium font-mono truncate">{item.name}</div>
                    {!item.isDirectory && (
                      <div className="text-[10px] text-slate-400">
                        {(item.size / 1024).toFixed(1)} KB •{" "}
                        {new Date(item.updatedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  {!item.isDirectory && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        exportFileToLocalDevice(item);
                      }}
                      className="p-1.5 rounded hover:bg-slate-700 text-slate-300"
                      title="Export file to Android device storage"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                    </button>
                  )}

                  <button
                    onClick={(e) => handleDeleteItem(item.path, e)}
                    className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                    title="Delete item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between bg-slate-950/60">
          <span>Root storage: <code className="text-emerald-400 font-mono">/storage/emulated/0/</code></span>
          <span>In-app file storage active</span>
        </div>
      </div>
    </div>
  );
};
