import React, { useState, useEffect, useCallback } from "react";
import { Save, Download } from "lucide-react";
import { HeaderNavbar } from "./components/HeaderNavbar";
import { SearchToolbar } from "./components/SearchToolbar";
import { AiMatchToolbar } from "./components/AiMatchToolbar";
import { VirtualizedTextEditor } from "./components/VirtualizedTextEditor";
import { InAppFileManager } from "./components/InAppFileManager";
import { AiAnalysisModal } from "./components/AiAnalysisModal";
import { SettingsModal } from "./components/SettingsModal";
import { AuthModal, UserAccount } from "./components/AuthModal";
import { SaveAsModal } from "./components/SaveAsModal";
import { VirtualFile, EditorSession, SearchMatch, AiCredentials, AiMatchResult } from "./types";
import {
  initializeStorage,
  loadSessionState,
  saveSessionState,
  readVirtualFile,
  saveVirtualFile,
  exportFileToLocalDevice,
  joinLinesAsync,
} from "./lib/indexedDbStorage";
import { splitLinesAsync } from "./lib/performanceUtils";
import { formatAsChromeHtmlViewer } from "./lib/htmlExportFormatter";

import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  const [session, setSession] = useState<EditorSession>({
    lastOpenedPath: "/storage/emulated/0/Documents/welcome_binarycore.txt",
    lastDirPath: "/storage/emulated/0/Documents",
    autoOpenLastDoc: true,
    userName: "User",
    darkTheme: true,
    wordWrap: true,
    isHorizontalMode: false,
    showLineNumbers: true,
    slowScrollRatio: 0.1,
  });

  const [currentFile, setCurrentFile] = useState<VirtualFile | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [showFileManager, setShowFileManager] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showSearchToolbar, setShowSearchToolbar] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveToastMessage, setSaveToastMessage] = useState<string | null>(null);

  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [focusedMatch, setFocusedMatch] = useState<SearchMatch | null>(null);

  // AI Matches Navigation State
  const [aiMatches, setAiMatches] = useState<AiMatchResult[]>([]);
  const [currentAiMatchIndex, setCurrentAiMatchIndex] = useState<number>(0);
  const [showAiMatchToolbar, setShowAiMatchToolbar] = useState(false);

  const [aiCredentials, setAiCredentials] = useState<AiCredentials>({
    provider: "gemini",
    geminiKey: "",
    openaiKey: "",
    claudeKey: "",
    customKey: "",
  });

  // Called when the Auth modal verifies an OpenAI/Claude API key, so logging in
  // there also wires up AI Analysis without re-entering the same key.
  const handleVerifiedApiKey = useCallback((provider: "openai" | "claude", apiKey: string) => {
    setAiCredentials((prev) => ({
      ...prev,
      provider,
      ...(provider === "openai" ? { openaiKey: apiKey } : { claudeKey: apiKey }),
    }));
  }, []);

  // Trigger new line at bottom from topper menu
  const [triggerNewLineAtBottom, setTriggerNewLineAtBottom] = useState(0);

  // App Initialization & Saved Auth Session Restore
  useEffect(() => {
    async function init() {
      try {
        await initializeStorage();
        const loadedSession = await loadSessionState();
        setSession(loadedSession);

        // Restore saved account from localStorage if exists
        const savedAccount = localStorage.getItem("binarycore_user_account");
        if (savedAccount) {
          try {
            const parsedAccount = JSON.parse(savedAccount);
            setUserAccount(parsedAccount);
            if (parsedAccount.username) {
              setSession((prev) => ({ ...prev, userName: parsedAccount.username }));
            }
          } catch (_) {}
        }

        // Auto-open last opened document if configured
        const targetPath =
          loadedSession.autoOpenLastDoc && loadedSession.lastOpenedPath
            ? loadedSession.lastOpenedPath
            : "/storage/emulated/0/Documents/welcome_binarycore.txt";

        let file = await readVirtualFile(targetPath);
        if (!file) {
          file = await readVirtualFile("/storage/emulated/0/Documents/welcome_binarycore.txt");
        }

        if (!file) {
          const now = Date.now();
          const fallbackContent = `[${new Date().toISOString().slice(0, 10)}] binarycore ready.\nLine 2: High Performance Text Engine Active.\nLine 3: Open file manager or type content below.`;
          file = {
            path: "/storage/emulated/0/Documents/welcome_binarycore.txt",
            name: "welcome_binarycore.txt",
            content: fallbackContent,
            size: new Blob([fallbackContent]).size,
            createdAt: now,
            updatedAt: now,
            mimeType: "text/plain",
            extension: "txt",
            isDirectory: false,
            parentPath: "/storage/emulated/0/Documents",
          };
          await saveVirtualFile(file);
        }

        setCurrentFile(file);
        const parsedLines = await splitLinesAsync(file.content);
        setLines(parsedLines);
      } catch (err) {
        console.error("Initialization error:", err);
      }
    }

    init();
  }, []);

  // Update session and persist
  const updateSession = (partial: Partial<EditorSession>) => {
    setSession((prev) => {
      const next = { ...prev, ...partial };
      saveSessionState(next);
      return next;
    });
  };

  // Login Success Handler
  const handleLoginSuccess = (account: UserAccount) => {
    setUserAccount(account);
    localStorage.setItem("binarycore_user_account", JSON.stringify(account));
    updateSession({ userName: account.username });
  };

  // Logout Handler
  const handleLogout = () => {
    setUserAccount(null);
    localStorage.removeItem("binarycore_user_account");
    updateSession({ userName: "User" });
  };

  // Open a file into the editor
  const handleSelectFile = useCallback(async (file: VirtualFile) => {
    const isMassive = file.content.length > 5000000;
    const lightFile = isMassive ? { ...file, content: "" } : file;
    setCurrentFile(lightFile);
    const parsedLines = await splitLinesAsync(file.content);
    setLines(parsedLines);
    updateSession({
      lastOpenedPath: file.path,
      lastDirPath: file.parentPath,
    });
  }, []);

  // Save document content changes (Debounced for 100% smooth instant UI response with big files)
  const saveTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleContentChange = useCallback(
    (newLines: string[]) => {
      setLines(newLines);

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      const isMassive = newLines.length > 100000;
      const debounceDelay = isMassive ? 3500 : 800;

      saveTimerRef.current = setTimeout(async () => {
        if (!currentFile) return;

        const newContent = isMassive ? "" : await joinLinesAsync(newLines);
        const estSize = isMassive ? newLines.length * 20 : newContent.length;

        const updatedFile: VirtualFile = {
          ...currentFile,
          content: newContent,
          size: estSize,
          updatedAt: Date.now(),
        };

        setCurrentFile(updatedFile);

        if (isMassive) {
          setTimeout(async () => {
            const fullContent = await joinLinesAsync(newLines);
            await saveVirtualFile({ ...updatedFile, content: fullContent });
          }, 50);
        } else {
          await saveVirtualFile(updatedFile);
        }
      }, debounceDelay);
    },
    [currentFile]
  );

  // Jump to specific line (1-based index)
  const handleGoToLine = useCallback(
    (lineNumber: number) => {
      const lineContent = lines[lineNumber - 1] || "";
      setFocusedMatch({
        lineNumber,
        lineContent,
        matchIndex: 0,
        length: lineContent.length,
        timestamp: Date.now(),
      });
    },
    [lines]
  );

  // Jump between AI search matches
  const handleSelectAiMatchIndex = useCallback(
    (index: number) => {
      if (aiMatches.length === 0) return;
      const clampedIndex = Math.max(0, Math.min(aiMatches.length - 1, index));
      setCurrentAiMatchIndex(clampedIndex);

      const match = aiMatches[clampedIndex];
      if (match) {
        setFocusedMatch({
          lineNumber: match.lineNumber,
          lineContent: match.matchedContent,
          matchIndex: 0,
          length: match.matchedContent.length,
          timestamp: Date.now(),
        });
      }
    },
    [aiMatches]
  );

  // Apply AI matches from modal and open AI Jump toolbar
  const handleApplyAiMatches = useCallback(
    (matches: AiMatchResult[], initialIndex: number) => {
      setAiMatches(matches);
      setCurrentAiMatchIndex(initialIndex);
      setShowAiMatchToolbar(true);
      setShowAiModal(false);

      const match = matches[initialIndex];
      if (match) {
        setFocusedMatch({
          lineNumber: match.lineNumber,
          lineContent: match.matchedContent,
          matchIndex: 0,
          length: match.matchedContent.length,
          timestamp: Date.now(),
        });
      }
    },
    []
  );

  // Quick Save current file content to storage
  const handleQuickSave = async () => {
    if (!currentFile) return;
    const newContent = await joinLinesAsync(lines);
    const updatedFile: VirtualFile = {
      ...currentFile,
      content: newContent,
      size: newContent.length,
      updatedAt: Date.now(),
    };
    setCurrentFile(updatedFile);
    await saveVirtualFile(updatedFile);
    setSaveToastMessage(`Saved ${updatedFile.name}`);
    setTimeout(() => setSaveToastMessage(null), 2500);
  };

  // Export active file to Android local phone storage
  const handleExportActiveFile = async () => {
    if (currentFile) {
      let fullContent = await joinLinesAsync(lines);
      const ext = (currentFile.extension || "").toLowerCase();
      if ((ext === "html" || ext === "htm") && !fullContent.trim().toLowerCase().startsWith("<!doctype") && !fullContent.trim().toLowerCase().startsWith("<html")) {
        fullContent = formatAsChromeHtmlViewer(currentFile.name, lines);
      }
      const result = await exportFileToLocalDevice({
        ...currentFile,
        content: fullContent,
        size: fullContent.length,
      });
      setSaveToastMessage(result.message);
      setTimeout(() => setSaveToastMessage(null), 3500);
    }
  };

  // Reopen Last Document
  const handleReopenLastDoc = async () => {
    if (session.lastOpenedPath) {
      const file = await readVirtualFile(session.lastOpenedPath);
      if (file) {
        handleSelectFile(file);
      }
    }
  };

  return (
    <div
      className={`h-screen flex flex-col font-sans transition-colors overflow-hidden relative ${
        session.darkTheme ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* Toast Notification */}
      {saveToastMessage && (
        <div className="absolute top-14 right-4 z-50 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-mono text-xs font-bold shadow-xl border border-emerald-400 animate-fade-in flex items-center gap-1.5 pointer-events-none">
          <span>✓ {saveToastMessage}</span>
        </div>
      )}

      {/* Top Header Navbar */}
      <HeaderNavbar
        currentFileName={currentFile?.name || "Untitled.txt"}
        fileExtension={currentFile?.extension || "txt"}
        totalLines={lines.length}
        darkTheme={session.darkTheme}
        userAccount={userAccount}
        aiMatchesCount={aiMatches.length}
        showAiMatchToolbar={showAiMatchToolbar}
        onToggleTheme={() => updateSession({ darkTheme: !session.darkTheme })}
        onOpenFileManager={() => setShowFileManager(true)}
        onOpenAiModal={() => setShowAiModal(true)}
        onOpenSearch={() => setShowSearchToolbar(true)}
        onToggleAiMatchToolbar={() => setShowAiMatchToolbar(!showAiMatchToolbar)}
        onJumpTop={() => handleGoToLine(1)}
        onJumpBottom={() => handleGoToLine(lines.length)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onQuickSave={handleQuickSave}
        onOpenSaveAs={() => setShowSaveAsModal(true)}
        onExportFile={handleExportActiveFile}
        onReopenLastDoc={handleReopenLastDoc}
        onOpenAuth={() => setShowAuthModal(true)}
        onNewLineAtBottom={() => setTriggerNewLineAtBottom(Date.now())}
      />

      {/* Optional Character Search Toolbar */}
      {showSearchToolbar && (
        <SearchToolbar
          lines={lines}
          darkTheme={session.darkTheme}
          onClose={() => setShowSearchToolbar(false)}
          onSelectMatch={(match) => setFocusedMatch(match)}
          onJumpTop={() => handleGoToLine(1)}
          onJumpBottom={() => handleGoToLine(lines.length)}
        />
      )}

      {/* Optional AI Match Jump Toolbar */}
      {showAiMatchToolbar && aiMatches.length > 0 && (
        <AiMatchToolbar
          aiMatches={aiMatches}
          currentIndex={currentAiMatchIndex}
          darkTheme={session.darkTheme}
          onSelectIndex={handleSelectAiMatchIndex}
          onClose={() => setShowAiMatchToolbar(false)}
          onJumpTop={() => handleGoToLine(1)}
          onJumpBottom={() => handleGoToLine(lines.length)}
          onOpenAiModal={() => setShowAiModal(true)}
        />
      )}

      {/* Main Virtualized Text / DAT Editor Window */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <ErrorBoundary fallbackTitle="Editor Window Recovered">
          <VirtualizedTextEditor
            lines={lines}
            darkTheme={session.darkTheme}
            wordWrap={session.wordWrap}
            showLineNumbers={session.showLineNumbers}
            slowScrollRatio={session.slowScrollRatio}
            userName={session.userName}
            focusedMatch={focusedMatch}
            onContentChange={handleContentChange}
            triggerNewLineAtBottom={triggerNewLineAtBottom}
          />
        </ErrorBoundary>
      </main>

      {/* In-App Android File Manager Modal */}
      {showFileManager && (
        <InAppFileManager
          currentDirPath={session.lastDirPath || "/storage/emulated/0/Documents"}
          darkTheme={session.darkTheme}
          onClose={() => setShowFileManager(false)}
          onSelectFile={handleSelectFile}
          onDirectoryChange={(dirPath) => updateSession({ lastDirPath: dirPath })}
        />
      )}

      {/* AI Search & Text Analysis Modal */}
      {showAiModal && (
        <AiAnalysisModal
          lines={lines}
          darkTheme={session.darkTheme}
          credentials={aiCredentials}
          userAccount={userAccount}
          onUpdateCredentials={(creds) => setAiCredentials(creds)}
          onOpenAuth={() => setShowAuthModal(true)}
          onClose={() => setShowAiModal(false)}
          onGoToLine={handleGoToLine}
          onApplyAiMatches={handleApplyAiMatches}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          session={session}
          darkTheme={session.darkTheme}
          onUpdateSession={updateSession}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* Auth / Login Modal (Google, OpenAI, Email & Password) */}
      {showAuthModal && (
        <AuthModal
          darkTheme={session.darkTheme}
          userAccount={userAccount}
          onLoginSuccess={handleLoginSuccess}
          onLogout={handleLogout}
          onClose={() => setShowAuthModal(false)}
          onVerifiedApiKey={handleVerifiedApiKey}
        />
      )}

      {/* Save File As Modal */}
      {showSaveAsModal && (
        <SaveAsModal
          currentFile={currentFile}
          lines={lines}
          darkTheme={session.darkTheme}
          onClose={() => setShowSaveAsModal(false)}
          onSaved={(savedFile) => {
            handleSelectFile(savedFile);
            setSaveToastMessage(`Saved as ${savedFile.name}`);
            setTimeout(() => setSaveToastMessage(null), 2500);
          }}
        />
      )}

      {/* Floating Save Action Button for Mobile / Android Touchscreens */}
      <div className="fixed bottom-4 right-4 z-40 sm:hidden flex flex-col gap-2">
        <button
          type="button"
          onClick={handleQuickSave}
          className="p-3 bg-emerald-600 active:bg-emerald-700 text-white rounded-full shadow-2xl border border-emerald-400 flex items-center justify-center touch-manipulation cursor-pointer"
          title="Quick Save File"
        >
          <Save className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
