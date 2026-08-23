import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Key,
  Cpu,
  Globe,
  Bot,
  Search,
  ArrowRight,
  CheckCircle2,
  X,
  Sliders,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { AiCredentials, AiMatchResult, AiProvider } from "../types";
import { runLocalAiAnalysis } from "../lib/localAiEngine";
import { apiUrl, parseJsonResponse } from "../lib/apiBase";
import { analyzeWithProviderDirect } from "../lib/aiProviders";
import { t } from "../lib/i18n";

import { UserAccount } from "./AuthModal";

interface AiAnalysisModalProps {
  lines: string[];
  darkTheme: boolean;
  language: string;
  credentials: AiCredentials;
  userAccount?: UserAccount | null;
  onUpdateCredentials: (newCreds: AiCredentials) => void;
  onOpenAuth?: () => void;
  onClose: () => void;
  onGoToLine: (lineNumber: number) => void;
  onApplyAiMatches?: (matches: AiMatchResult[], activeIndex: number) => void;
}

export const AiAnalysisModal: React.FC<AiAnalysisModalProps> = ({
  lines,
  darkTheme,
  language,
  credentials,
  userAccount,
  onUpdateCredentials,
  onOpenAuth,
  onClose,
  onGoToLine,
  onApplyAiMatches,
}) => {
  const [provider, setProvider] = useState<AiProvider>(credentials.provider || "gemini");
  const [query, setQuery] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [results, setResults] = useState<AiMatchResult[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [showKeyForm, setShowKeyForm] = useState(false);

  // Local key form states
  const [openaiKey, setOpenaiKey] = useState(credentials.openaiKey || "");
  const [geminiKey, setGeminiKey] = useState(credentials.geminiKey || "");
  const [claudeKey, setClaudeKey] = useState(credentials.claudeKey || "");
  const [customKey, setCustomKey] = useState(credentials.customKey || "");

  // Keep local key fields in sync when credentials change from elsewhere (e.g. the
  // Login modal verifying an OpenAI/Claude key while this modal stays open behind it).
  useEffect(() => {
    setOpenaiKey(credentials.openaiKey || "");
    setGeminiKey(credentials.geminiKey || "");
    setClaudeKey(credentials.claudeKey || "");
    setCustomKey(credentials.customKey || "");
  }, [credentials]);

  const handleSaveKeys = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: AiCredentials = {
      provider,
      openaiKey,
      geminiKey,
      claudeKey,
      customKey,
    };
    onUpdateCredentials(updated);
    setShowKeyForm(false);
  };

  const handleRunAnalysis = async () => {
    if (!query.trim()) return;

    setIsAnalyzing(true);
    setError(null);
    setResults([]);
    setVisibleLimit(100);
    setProgressText("Initializing AI text analysis engine...");

    try {
      if (provider === "local") {
        setProgressText("Running local Android Phone AI scanner over lines...");
        const localResults = await runLocalAiAnalysis(
          lines,
          query,
          (processed, total) => {
            setProgressText(
              `Processed ${processed.toLocaleString()} of ${total.toLocaleString()} lines...`
            );
          }
        );
        setResults(localResults);
      } else {
        // Server-side AI (Gemini / OpenAI / Hosted API)
        setProgressText("Extracting representative sample chunks for AI analysis...");

        // Extract sample lines spaced across document with real line numbers
        const totalLines = lines.length;
        const qLower = query.toLowerCase().trim();
        const queryTokens = qLower.split(/\s+/).filter((t) => t.length > 0);
        const sampleLines: { lineNumber: number; content: string }[] = [];

        // 1. Candidate scan: find lines containing search query tokens with async chunking for 1M+ lines
        const chunkSize = 20000;
        for (let i = 0; i < totalLines && sampleLines.length < 100; i += chunkSize) {
          const end = Math.min(i + chunkSize, totalLines);
          for (let idx = i; idx < end && sampleLines.length < 100; idx++) {
            const line = lines[idx];
            if (!line) continue;
            const lower = line.toLowerCase();
            if (queryTokens.some((token) => lower.includes(token))) {
              sampleLines.push({ lineNumber: idx + 1, content: line });
            }
          }

          if (totalLines > 50000) {
            setProgressText(
              `Scanning candidate line ${Math.min(end, totalLines).toLocaleString()} of ${totalLines.toLocaleString()}...`
            );
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        // 2. Uniform sampling: fill remaining quota across the entire document
        if (sampleLines.length < 100) {
          const existingLineNums = new Set(sampleLines.map((s) => s.lineNumber));
          const needed = 100 - sampleLines.length;
          const step = Math.max(1, Math.floor(totalLines / needed));
          for (let i = 0; i < totalLines && sampleLines.length < 100; i += step) {
            if (lines[i] !== undefined && !existingLineNums.has(i + 1)) {
              sampleLines.push({ lineNumber: i + 1, content: lines[i] });
            }
          }
        }

        sampleLines.sort((a, b) => a.lineNumber - b.lineNumber);

        const apiKey =
          provider === "gemini"
            ? geminiKey
            : provider === "openai"
            ? openaiKey
            : provider === "claude"
            ? claudeKey
            : customKey;

        // Providers with a key entered here call the provider's own API
        // directly from the device — no dependency on this app's own server,
        // so this works the same in the web preview and the packaged Android
        // app. Only the "use server default Gemini key" case (key left empty)
        // and the custom-hosted-proxy option still need our own server.
        if ((provider === "openai" || provider === "claude" || provider === "gemini") && apiKey) {
          setProgressText(`Sending AI analysis request directly to ${provider.toUpperCase()}...`);
          const directResults = await analyzeWithProviderDirect(provider, apiKey, query, sampleLines, 0);
          setResults(directResults);
        } else {
          setProgressText(`Sending AI analysis request to ${provider.toUpperCase()} server...`);

          const res = await fetch(apiUrl("/api/ai/analyze"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              apiKey,
              query,
              sampleLines,
              lineOffset: 0,
            }),
          });

          const data = await parseJsonResponse(res);
          if (!res.ok) {
            throw new Error(data.error || "AI Analysis request failed.");
          }
          setResults(data.matches || []);
        }
      }
    } catch (err: any) {
      console.error("AI analysis error:", err);
      setError(err.message || "An error occurred during AI analysis.");
    } finally {
      setIsAnalyzing(false);
      setProgressText("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div
        className={`w-full max-w-4xl rounded-xl border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden ${
          darkTheme ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-lg shadow-md text-white">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="font-bold text-lg flex items-center gap-2">
                <span>AI Text Analysis Window</span>
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  1,000,000+ Lines
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Find matching content in large .txt / .dat files using AI models or local Android AI
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

        {/* AI Provider Switcher & Credentials Toggle */}
        <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto py-1">
            <button
              onClick={() => setProvider("gemini")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition-all ${
                provider === "gemini"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Google Gemini AI</span>
            </button>

            <button
              onClick={() => setProvider("openai")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition-all ${
                provider === "openai"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>OpenAI</span>
            </button>

            <button
              onClick={() => setProvider("claude")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition-all ${
                provider === "claude"
                  ? "bg-orange-600 text-white shadow-sm"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Claude</span>
            </button>

            <button
              onClick={() => setProvider("custom_hosted")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition-all ${
                provider === "custom_hosted"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>API-Key Hosted AI</span>
            </button>

            <button
              onClick={() => setProvider("local")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition-all ${
                provider === "local"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-amber-300" />
              <span>Local Android AI</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {/* Active Account Status Badge in AI Modal */}
            {userAccount?.isLoggedIn ? (
              <button
                onClick={onOpenAuth}
                className="px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 shadow-sm transition-all"
                title="Konto-Einstellungen öffnen"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="truncate max-w-[120px] sm:max-w-[160px] font-mono">
                  {userAccount.username} ({userAccount.authProvider.toUpperCase()})
                </span>
              </button>
            ) : (
              <button
                onClick={onOpenAuth}
                className="px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 bg-teal-600 hover:bg-teal-500 text-white shadow-sm transition-all"
                title="Google / OpenAI / Email Konto verbinden"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{t(language, "connectAccountBtn")}</span>
              </button>
            )}

            <button
              onClick={() => setShowKeyForm(!showKeyForm)}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>AI Credentials</span>
            </button>
          </div>
        </div>

        {/* Credentials Form & User Connection Status */}
        {showKeyForm && (
          <form
            onSubmit={handleSaveKeys}
            className="p-4 bg-slate-950/80 border-b border-slate-800 space-y-3"
          >
            {/* User Account / Auth Connection Row inside AI Window */}
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-200">
                    {userAccount?.isLoggedIn
                      ? `Verbundenes Konto: ${userAccount.username} (${userAccount.email})`
                      : "Kein Konto mit der App verbunden"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {userAccount?.isLoggedIn
                      ? `Authentifiziert über ${userAccount.authProvider.toUpperCase()}. Serverseitige AI Nutzung aktiviert.`
                      : "Verbinde dich mit Google, OpenAI oder Email/Passwort für synchronisierte AI Zugriffe."}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenAuth}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shrink-0 flex items-center gap-1 shadow-sm"
              >
                <span>{userAccount?.isLoggedIn ? t(language, "manageAccountBtn") : t(language, "loginNowBtn")}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider pt-1">
              Enter AI API Keys & Login Credentials
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Google Gemini API Key:</label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="Optional (uses server default if empty)"
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">OpenAI API Key:</label>
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Claude (Anthropic) API Key:</label>
                <input
                  type="password"
                  value={claudeKey}
                  onChange={(e) => setClaudeKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Hosted AI API Key:</label>
                <input
                  type="password"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  placeholder="Key for custom AI"
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                Save Credentials
              </button>
            </div>
          </form>
        )}

        {/* Search Bar */}
        <div className="p-4 bg-slate-950/30 space-y-2 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRunAnalysis()}
                placeholder="Describe what you are looking for in full sentences, codewords, or rules..."
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>

            <button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing || !query.trim()}
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white disabled:opacity-50 shadow-md shrink-0 flex items-center space-x-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>Analyze Text</span>
            </button>
          </div>

          {progressText && (
            <div className="text-xs text-amber-400 font-mono animate-pulse flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>{progressText}</span>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Results View */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {results.length === 0 && !isAnalyzing ? (
            <div className="text-center py-12 text-slate-500 text-xs space-y-2">
              <Bot className="w-8 h-8 mx-auto text-slate-600" />
              <p>Enter a prompt above to search across all lines with AI logic.</p>
              <p className="text-[11px] text-slate-600">
                Supports natural language query matching, error code analysis, and timestamp filtering (up to 100,000 matches).
              </p>
            </div>
          ) : (
            <>
              {results.slice(0, visibleLimit).map((res, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    darkTheme
                      ? "bg-slate-800/50 hover:bg-slate-800 border-slate-700/80"
                      : "bg-slate-50 hover:bg-slate-100 border-slate-200"
                  }`}
                >
                  <div className="space-y-1 overflow-hidden flex-1">
                    <div className="flex items-center space-x-2 font-mono text-xs">
                      <span className="px-2 py-0.5 rounded font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                        Line {res.lineNumber.toLocaleString()}
                      </span>
                      {res.reason && (
                        <span className="text-[11px] text-slate-400 truncate">
                          {res.reason}
                        </span>
                      )}
                      {res.confidence !== undefined && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {Math.round(res.confidence * 100)}% match
                        </span>
                      )}
                    </div>

                    <div className="font-mono text-xs p-2 rounded bg-slate-950/60 border border-slate-800 text-slate-200 overflow-x-auto whitespace-pre-wrap break-all">
                      {res.matchedContent}
                    </div>
                  </div>

                  {/* Apply / Go To Line Button */}
                  <button
                    onClick={() => {
                      if (onApplyAiMatches) {
                        onApplyAiMatches(results, i);
                      } else {
                        const targetLineNum = res.lineNumber;
                        onClose();
                        setTimeout(() => {
                          onGoToLine(targetLineNum);
                        }, 10);
                      }
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shrink-0"
                    title="Focus editor on exact line and enable AI Jump Toolbar on mainscreen"
                  >
                    <span>Apply & Jump There</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {results.length > visibleLimit && (
                <div className="pt-2 text-center">
                  <button
                    onClick={() => setVisibleLimit((prev) => prev + 500)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 font-mono text-xs font-semibold border border-slate-700 shadow-sm"
                  >
                    Show More Matches (Showing {visibleLimit.toLocaleString()} of {results.length.toLocaleString()})
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between bg-slate-950/60 font-mono flex-wrap gap-2">
          <span>Provider: <strong className="text-teal-400">{provider.toUpperCase()}</strong></span>
          <div className="flex items-center space-x-3">
            <span>{results.length.toLocaleString()} matches found</span>
            {results.length > 0 && onApplyAiMatches && (
              <button
                onClick={() => onApplyAiMatches(results, 0)}
                className="px-3 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center space-x-1 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Jump All AI Matches on Mainscreen</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
