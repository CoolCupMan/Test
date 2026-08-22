import React from "react";
import {
  Sparkles,
  ChevronUp,
  ChevronDown,
  ArrowUpToLine,
  ArrowDownToLine,
  X,
  Bot,
  ExternalLink,
} from "lucide-react";
import { AiMatchResult } from "../types";

interface AiMatchToolbarProps {
  aiMatches: AiMatchResult[];
  currentIndex: number;
  darkTheme: boolean;
  onSelectIndex: (index: number) => void;
  onClose: () => void;
  onJumpTop: () => void;
  onJumpBottom: () => void;
  onOpenAiModal?: () => void;
}

export const AiMatchToolbar: React.FC<AiMatchToolbarProps> = ({
  aiMatches,
  currentIndex,
  darkTheme,
  onSelectIndex,
  onClose,
  onJumpTop,
  onJumpBottom,
  onOpenAiModal,
}) => {
  if (aiMatches.length === 0) return null;

  const currentMatch = aiMatches[currentIndex] || aiMatches[0];

  const handleNext = () => {
    if (aiMatches.length === 0) return;
    const nextIdx = (currentIndex + 1) % aiMatches.length;
    onSelectIndex(nextIdx);
  };

  const handlePrev = () => {
    if (aiMatches.length === 0) return;
    const prevIdx = (currentIndex - 1 + aiMatches.length) % aiMatches.length;
    onSelectIndex(prevIdx);
  };

  return (
    <div
      id="ai-match-toolbar"
      className={`px-3 py-2 border-b flex flex-wrap items-center justify-between gap-2 shadow-md z-20 transition-colors ${
        darkTheme
          ? "bg-slate-900/95 border-teal-500/40 text-slate-100 shadow-teal-950/30"
          : "bg-teal-50/95 border-teal-300 text-slate-900 shadow-teal-100/50"
      }`}
    >
      {/* AI Search Badge & Current Match Info */}
      <div className="flex items-center flex-1 min-w-[280px] space-x-2.5 overflow-hidden">
        <div className="p-1.5 rounded-lg bg-gradient-to-tr from-teal-600 to-emerald-500 text-white shrink-0 shadow-sm flex items-center space-x-1">
          <Sparkles className="w-4 h-4 animate-pulse text-amber-300" />
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase hidden sm:inline">
            AI Jump
          </span>
        </div>

        {/* Active AI Match Counter & Line Number */}
        <div className="flex items-center space-x-2 font-mono text-xs overflow-hidden">
          <span className="px-2 py-0.5 rounded font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40 shrink-0">
            {currentIndex + 1} / {aiMatches.length.toLocaleString()} AI Matches
          </span>

          {currentMatch && (
            <div className="flex items-center space-x-1.5 truncate text-[11px]">
              <span className="font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-800/60 shrink-0">
                Line #{currentMatch.lineNumber.toLocaleString()}
              </span>

              {currentMatch.confidence !== undefined && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0 hidden md:inline">
                  {Math.round(currentMatch.confidence * 100)}% match
                </span>
              )}

              {currentMatch.reason ? (
                <span className="text-slate-300 truncate max-w-[180px] sm:max-w-[280px] md:max-w-[400px] italic">
                  "{currentMatch.reason}"
                </span>
              ) : (
                <span className="text-slate-300 truncate max-w-[180px] sm:max-w-[280px] md:max-w-[400px] font-mono">
                  "{currentMatch.matchedContent.trim()}"
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation Controls: Jump Prev / Next AI Match */}
      <div className="flex items-center space-x-1 sm:space-x-2 text-xs font-mono shrink-0">
        <button
          onClick={handlePrev}
          className="px-2 py-1 rounded bg-teal-950/80 hover:bg-teal-900 text-teal-200 border border-teal-600/60 font-semibold flex items-center space-x-1 shadow-sm active:scale-95 transition-all"
          title="Jump to Previous AI Match (Up / Backward)"
        >
          <ChevronUp className="w-4 h-4 text-teal-300" />
          <span className="hidden sm:inline">Prev AI Match</span>
        </button>

        <button
          onClick={handleNext}
          className="px-2 py-1 rounded bg-teal-950/80 hover:bg-teal-900 text-teal-200 border border-teal-600/60 font-semibold flex items-center space-x-1 shadow-sm active:scale-95 transition-all"
          title="Jump to Next AI Match (Down / Forward)"
        >
          <ChevronDown className="w-4 h-4 text-teal-300" />
          <span className="hidden sm:inline">Next AI Match</span>
        </button>

        {/* Jump Top & Bottom */}
        <button
          onClick={onJumpTop}
          className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700"
          title="Jump to First Line"
        >
          <ArrowUpToLine className="w-4 h-4" />
        </button>

        <button
          onClick={onJumpBottom}
          className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700"
          title="Jump to Last Line"
        >
          <ArrowDownToLine className="w-4 h-4" />
        </button>

        {/* Reopen AI Modal */}
        {onOpenAiModal && (
          <button
            onClick={onOpenAiModal}
            className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-amber-400 border border-slate-700"
            title="Open AI Analysis Full Window"
          >
            <Bot className="w-4 h-4" />
          </button>
        )}

        {/* Close AI Jump Toolbar */}
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-rose-500/20 text-rose-400 transition-colors"
          title="Close AI Jump Toolbar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
