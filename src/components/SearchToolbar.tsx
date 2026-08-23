import React, { useState, useEffect } from "react";
import {
  Search,
  ChevronUp,
  ChevronDown,
  ArrowUpToLine,
  ArrowDownToLine,
  X,
  CheckCircle2,
} from "lucide-react";
import { SearchMatch } from "../types";

interface SearchToolbarProps {
  lines: string[];
  darkTheme: boolean;
  onClose: () => void;
  onSelectMatch: (match: SearchMatch) => void;
  onJumpTop: () => void;
  onJumpBottom: () => void;
}

export const SearchToolbar: React.FC<SearchToolbarProps> = ({
  lines,
  darkTheme,
  onClose,
  onSelectMatch,
  onJumpTop,
  onJumpBottom,
}) => {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  // Perform non-blocking fast scan over document lines
  useEffect(() => {
    if (!query.trim()) {
      setMatches([]);
      setCurrentIndex(0);
      return;
    }

    let isCancelled = false;
    setIsSearching(true);

    const timer = setTimeout(async () => {
      const results: SearchMatch[] = [];
      const lowerQ = query.toLowerCase();
      const total = lines.length;
      const chunkSize = 20000;

      for (let i = 0; i < total; i += chunkSize) {
        if (isCancelled) return;
        const end = Math.min(i + chunkSize, total);

        for (let idx = i; idx < end; idx++) {
          const line = lines[idx];
          if (!line) continue;
          const lowerLine = line.toLowerCase();
          const matchIdx = lowerLine.indexOf(lowerQ);

          if (matchIdx !== -1) {
            results.push({
              lineNumber: idx + 1,
              lineContent: line,
              matchIndex: matchIdx,
              length: query.length,
            });

            if (results.length >= 100000) break;
          }
        }

        if (results.length >= 100000) break;

        // Yield to keep UI smooth and un-frozen
        await new Promise((r) => setTimeout(r, 0));
      }

      if (!isCancelled) {
        setMatches(results);
        setCurrentIndex(0);
        setIsSearching(false);

        if (results.length > 0) {
          onSelectMatch(results[0]);
        }
      }
    }, 150);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [query, lines]);

  const handleNext = () => {
    if (matches.length === 0) return;
    const nextIdx = (currentIndex + 1) % matches.length;
    setCurrentIndex(nextIdx);
    onSelectMatch(matches[nextIdx]);
  };

  const handlePrev = () => {
    if (matches.length === 0) return;
    const prevIdx = (currentIndex - 1 + matches.length) % matches.length;
    setCurrentIndex(prevIdx);
    onSelectMatch(matches[prevIdx]);
  };

  return (
    <div
      id="search-toolbar"
      className={`px-3 py-2 border-b flex flex-wrap items-center justify-between gap-2 shadow-sm ${
        darkTheme ? "bg-slate-800/95 border-slate-700 text-slate-100" : "bg-slate-100 border-slate-300 text-slate-900"
      }`}
    >
      <div className="flex items-center flex-1 min-w-0 sm:min-w-[240px] space-x-2">
        <Search className="w-4 h-4 text-cyan-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search characters or words (up to 1,000,000+ lines)..."
          className={`w-full px-2.5 py-1 text-xs rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
            darkTheme ? "bg-slate-900 text-slate-100 border border-slate-700" : "bg-white text-slate-900 border border-slate-300"
          }`}
          autoFocus
        />
      </div>

      {/* Match Status & Control Arrows */}
      <div className="flex items-center space-x-1 sm:space-x-2 text-xs font-mono">
        {isSearching ? (
          <span className="text-amber-400 animate-pulse text-xs">Scanning...</span>
        ) : query.trim() ? (
          <span
            className={`px-2 py-0.5 rounded font-semibold text-xs ${
              matches.length > 0
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
            }`}
          >
            {matches.length > 0
              ? `${currentIndex + 1} / ${matches.length.toLocaleString()}`
              : "0 matches"}
          </span>
        ) : null}

        <button
          onClick={handlePrev}
          disabled={matches.length === 0}
          className="p-1 rounded bg-slate-700/50 hover:bg-slate-700 text-slate-200 disabled:opacity-30"
          title="Previous match (Backward)"
        >
          <ChevronUp className="w-4 h-4" />
        </button>

        <button
          onClick={handleNext}
          disabled={matches.length === 0}
          className="p-1 rounded bg-slate-700/50 hover:bg-slate-700 text-slate-200 disabled:opacity-30"
          title="Next match (Forward)"
        >
          <ChevronDown className="w-4 h-4" />
        </button>

        {/* Jump Top & Bottom Toggles */}
        <button
          onClick={onJumpTop}
          className="p-1 rounded bg-slate-700/50 hover:bg-slate-700 text-slate-200"
          title="Jump Top"
        >
          <ArrowUpToLine className="w-4 h-4" />
        </button>

        <button
          onClick={onJumpBottom}
          className="p-1 rounded bg-slate-700/50 hover:bg-slate-700 text-slate-200"
          title="Jump Bottom"
        >
          <ArrowDownToLine className="w-4 h-4" />
        </button>

        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-rose-500/20 text-rose-400"
          title="Close Search Toolbar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
