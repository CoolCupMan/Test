import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import {
  Send,
  Clock,
  Copy,
  Clipboard,
  AlignLeft,
  Columns,
  Check,
  ChevronUp,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Sliders,
  MessageSquare,
  Sparkles,
  Code,
  User,
  PlusCircle,
  MousePointer,
  X,
  CornerDownLeft,
  MessageSquarePlus,
  Lock,
  PenTool,
  Pointer,
  Hand,
  Undo,
  Redo,
  Maximize2,
  Minimize2,
  ArrowLeft,
  MoreVertical,
} from "lucide-react";
import { SearchMatch } from "../types";
import { LRUMap } from "../lib/performanceUtils";

export interface ParsedMessage {
  timestamp: string;
  sender: string;
  role: "user" | "assistant" | "system";
  text: string;
  isMessage: boolean;
  isCodeBlock: boolean;
  codeLang?: string;
  isHeader: boolean;
  isList: boolean;
}

interface VirtualizedTextEditorProps {
  lines: string[];
  darkTheme: boolean;
  wordWrap: boolean;
  showLineNumbers: boolean;
  slowScrollRatio: number;
  userName: string;
  focusedMatch: SearchMatch | null;
  onContentChange: (newLines: string[]) => void;
  triggerNewLineAtBottom?: number;
}

const LINE_HEIGHT = 24; // Fixed pixel height per line for code mode
const MESSAGE_CARD_HEIGHT = 28; // Compact line height for continuous vertical message stream
const MAX_CONTAINER_HEIGHT = 8000000; // 8 Million pixels cap
// Upper character limit for the writing window (typed or pasted). Sized in
// CHARACTERS, but the real requirement is LINES: a single message can
// legitimately be 1,000,000+ lines (e.g. pasting a large file's worth of
// content to send at once), and lines vary a lot in length — a cap sized
// for "1,000,000 characters" was silently truncating a 1,000,000-line paste
// down to only as many whole lines as fit in that budget (as few as a few
// hundred, for longer lines) well before the line-count ever mattered. 100
// million characters comfortably fits 1,000,000+ lines at realistic average
// line lengths while still keeping some finite, sane upper bound.
const MAX_CHAT_INPUT_CHARS = 100000000;
const EDIT_WINDOW_MS = 15 * 60 * 1000; // How long a freshly sent text message stays directly editable

export const VirtualizedTextEditor: React.FC<VirtualizedTextEditorProps> = ({
  lines,
  darkTheme,
  wordWrap: initialWordWrap,
  showLineNumbers,
  userName,
  focusedMatch,
  onContentChange,
  triggerNewLineAtBottom,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftTrackRef = useRef<HTMLDivElement>(null);
  const rightTrackRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);

  // Set right before a programmatic .focus() on the compose textarea (e.g.
  // opening the writing box) so its onFocus handler knows to jump to the
  // box's bottom just this once. A normal focus from the user tapping/
  // clicking into the box to reposition their cursor leaves this false, so
  // that click isn't immediately overridden by a forced scroll to the end.
  const forceFollowBottomRef = useRef(true);

  const getBottomBarHeight = (): number => {
    if (bottomBarRef.current && bottomBarRef.current.offsetHeight > 0) {
      return bottomBarRef.current.offsetHeight;
    }
    return bBarHeight;
  };

  const [bBarHeight, setBBarHeight] = useState(42);

  // Miniature / Expanded Text Writing Box State
  const [isWritingBoxExpanded, setIsWritingBoxExpanded] = useState(false);

  const expandWritingBox = useCallback(() => {
    setIsWritingBoxExpanded((prev) => {
      if (!prev) {
        try {
          window.history.pushState({ textWritingBoxOpen: true }, "");
        } catch (_) {}
      }
      return true;
    });
    setTimeout(() => {
      if (chatInputRef.current) {
        forceFollowBottomRef.current = true;
        chatInputRef.current.focus({ preventScroll: true });
      }
    }, 50);
  }, []);

  const collapseWritingBox = useCallback(() => {
    setIsWritingBoxExpanded(false);
    setEditingRemarkStartIdx(null);
    setEditingOriginalLineCount(0);
  }, []);

  // Handle Android Menu Back Key (popstate) & Keyboard Esc Key to close text writing box
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (isWritingBoxExpanded) {
        setIsWritingBoxExpanded(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isWritingBoxExpanded) {
        e.preventDefault();
        setIsWritingBoxExpanded(false);
        if (window.history.state?.textWritingBoxOpen) {
          try {
            window.history.back();
          } catch (_) {}
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isWritingBoxExpanded]);

  // Dynamic bottom bar height observer
  useEffect(() => {
    if (!bottomBarRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setBBarHeight(entry.target.clientHeight || Math.ceil(entry.contentRect.height));
        }
      }
    });
    observer.observe(bottomBarRef.current);
    return () => observer.disconnect();
  }, [isWritingBoxExpanded]);

  // Keep the writing box fully visible above the on-screen keyboard —
  // including its emoji panel, which is usually taller than the regular
  // keyboard and on some devices (e.g. Ulefone Armor 30's WebView) doesn't
  // budge the layout by itself. The Android activity now also declares
  // windowSoftInputMode="adjustResize" so the OS itself shrinks the app's
  // window when the keyboard opens on most devices/WebView builds; this
  // visualViewport listener is the belt-and-suspenders layer on top of
  // that, for WebView builds where the resize either doesn't happen or
  // reports late. A small fixed buffer is added on top of the measured
  // keyboard height so the box's first line sits with a visible gap above
  // the keyboard/emoji panel instead of butting flush against it.
  const KEYBOARD_INSET_BUFFER_PX = 10;
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    if (!isWritingBoxExpanded || typeof window === "undefined" || !window.visualViewport) {
      setKeyboardInset(0);
      return;
    }
    const vv = window.visualViewport;
    const handleViewportChange = () => {
      const rawInset = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardInset(rawInset > 0 ? rawInset + KEYBOARD_INSET_BUFFER_PX : 0);
    };
    handleViewportChange();
    vv.addEventListener("resize", handleViewportChange);
    vv.addEventListener("scroll", handleViewportChange);
    return () => {
      vv.removeEventListener("resize", handleViewportChange);
      vv.removeEventListener("scroll", handleViewportChange);
    };
  }, [isWritingBoxExpanded]);

  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [wordWrap, setWordWrap] = useState(initialWordWrap);
  const [viewMode, setViewMode] = useState<"code" | "vertical-messages">("vertical-messages");
  const [activeLineIdx, setActiveLineIdx] = useState<number | null>(null);
  const [activeColIdx, setActiveColIdx] = useState<number | null>(null);
  const [isFreeWritingMode, setIsFreeWritingMode] = useState(true);
  const [cursorVerticalView, setCursorVerticalView] = useState(true);
  const [hoverCursor, setHoverCursor] = useState<{
    lineIdx: number;
    colIdx: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  const [editingText, setEditingText] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);

  // When set, the compose box holds the full editable text of this existing
  // (still within its 15-minute edit window) message, loaded there by its
  // Edit button so every character, space, and line of it can be edited
  // directly — Send below saves those edits back onto the message itself in
  // place, and no new message is created. Any lines typed beyond the
  // message's original length are treated as a new remark appended after it
  // (indented and tagged "rem", see handleSaveMessageEdit). Cleared once the
  // edit is sent, once the writing box is collapsed, or as soon as the
  // cursor is moved to a line outside that message (see
  // handleSelectCursorLocation / getMessageLineRange below).
  const [editingRemarkStartIdx, setEditingRemarkStartIdx] = useState<number | null>(null);
  // How many lines the message had (timestamped first line + continuation
  // lines) at the moment Edit was clicked — the boundary handleSaveMessageEdit
  // uses to tell "edited original content" apart from "new remark lines".
  const [editingOriginalLineCount, setEditingOriginalLineCount] = useState(0);

  // Undo / Redo History Stacks
  const [undoStack, setUndoStack] = useState<string[][]>([]);
  const [redoStack, setRedoStack] = useState<string[][]>([]);

  // Fast Memoization Cache for ChatGPT / Message parsing
  const messageCacheRef = useRef<LRUMap<number, ParsedMessage>>(new LRUMap<number, ParsedMessage>(20000));

  // Invalidate the parse cache the instant the document actually changes —
  // synchronously, during render, rather than in a useEffect. A useEffect
  // only runs after the browser paints, so the very first render after an
  // edit that shifts existing line indices (e.g. sending/pasting a message
  // anywhere except the very end of the document) would still read the OLD
  // cached parses for those now-different indices: the tail of the document
  // (exactly what's on screen right after the auto-scroll-to-bottom that
  // follows a send) rendered stale/wrong content instead of the message
  // that was actually just sent, until the effect caught up a frame later —
  // and depending on timing, that stale frame is what stuck. Clearing it
  // here, before any getParsedMessage() call this render can happen, means
  // every render always parses against the CURRENT lines, with no window
  // for stale content to appear at all.
  const prevLinesRef = useRef(lines);
  if (prevLinesRef.current !== lines) {
    messageCacheRef.current.clear();
    prevLinesRef.current = lines;
  }

  // Apply change with history recording
  const applyChange = (newLines: string[]) => {
    const maxHistory = lines.length > 2000000 ? 1 : lines.length > 500000 ? 2 : lines.length > 100000 ? 5 : 30;
    setUndoStack((prev) => [...prev.slice(-maxHistory), lines]);
    setRedoStack([]);
    onContentChange(newLines);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previousState = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, undoStack.length - 1);
    setUndoStack(newUndoStack);
    setRedoStack((prev) => [...prev, lines]);
    onContentChange(previousState);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, redoStack.length - 1);
    setRedoStack(newRedoStack);
    setUndoStack((prev) => [...prev, lines]);
    onContentChange(nextState);
  };

  // Keyboard shortcut listener for Ctrl+Z / Cmd+Z / Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoStack, redoStack, lines]);

  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const dragStartPosRef = useRef<{ startY: number; startScrollTop: number }>({ startY: 0, startScrollTop: 0 });

  // Sync initial wordWrap
  useEffect(() => {
    setWordWrap(initialWordWrap);
  }, [initialWordWrap]);

  // Auto-switch to fast code mode for HTML content and massive files (>500k lines)
  useEffect(() => {
    if (lines.length > 0) {
      const firstLine = (lines[0] || "").trim().toLowerCase();
      if (
        firstLine.startsWith("<!doctype") ||
        firstLine.startsWith("<html") ||
        firstLine.startsWith("<div") ||
        firstLine.startsWith("<?xml") ||
        lines.length > 500000
      ) {
        setViewMode("code");
      }
    }
  }, [lines.length]);

  // Auto-scroll typing window textarea to bottom so the last line of typed
  // text is always displayed — but ONLY while the caret is already at (or
  // right at) the very end, i.e. the user is continuing to type/paste onto
  // the end like a normal chat message. Forcing this unconditionally used
  // to yank the box's own internal scroll (and the visible caret with it)
  // down to its last line even while typing or pasting into an EARLIER
  // line the user had scrolled up to fix — making it look like the cursor
  // had jumped away from where it actually was.
  const isCaretNearEnd = (el: HTMLTextAreaElement, text: string): boolean =>
    el.selectionStart === null || el.selectionStart >= text.length - 1;

  useEffect(() => {
    const el = chatInputRef.current;
    if (el && isCaretNearEnd(el, chatInput)) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatInput]);

  // Handle Container Resize with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height || 600);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const scrollAnimationFrameRef = useRef<number | null>(null);

  // Handle Main Scroll Event with rAF throttling for 60fps un-frozen scrolling
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const newTop = e.currentTarget.scrollTop;
    if (scrollAnimationFrameRef.current !== null) {
      cancelAnimationFrame(scrollAnimationFrameRef.current);
    }
    scrollAnimationFrameRef.current = requestAnimationFrame(() => {
      setScrollTop(newTop);
    });
  };

  // Virtualization Calculations (Enabled for 100+ lines for instant 1,000,000+ line loading compatibility)
  const useVirtualization = lines.length > 100;
  const currentLineHeight = viewMode === "vertical-messages" ? MESSAGE_CARD_HEIGHT : LINE_HEIGHT;
  const totalLines = lines.length;
  const curBBarHeight = getBottomBarHeight();
  const bottomPadding = curBBarHeight + 20;
  const rawTotalHeight = totalLines * currentLineHeight + bottomPadding;
  const isCapped = rawTotalHeight > MAX_CONTAINER_HEIGHT;
  const totalHeight = isCapped ? MAX_CONTAINER_HEIGHT : rawTotalHeight;

  const visibleCount = Math.max(1, Math.ceil(containerHeight / currentLineHeight));
  const maxScrollablePixels = useVirtualization
    ? Math.max(0, totalHeight - containerHeight)
    : Math.max(0, containerRef.current ? containerRef.current.scrollHeight - containerRef.current.clientHeight : 0);

  // Calculate virtual scroll ratio (0.0 to 1.0)
  const scrollRatio = Math.max(0, Math.min(1, maxScrollablePixels > 0 ? scrollTop / maxScrollablePixels : 0));

  // Determine start index of visible lines
  let startIndex = 0;
  const bufferSize = viewMode === "vertical-messages" ? 60 : 25;
  if (!isCapped) {
    const maxStartIndex = Math.max(0, totalLines - 1);
    startIndex = Math.min(maxStartIndex, Math.max(0, Math.floor((scrollTop || 0) / currentLineHeight) - bufferSize));
  } else {
    const maxStartIndex = Math.max(0, totalLines - visibleCount);
    startIndex = Math.min(maxStartIndex, Math.max(0, Math.floor((scrollRatio || 0) * maxStartIndex)));
  }
  if (isNaN(startIndex) || !isFinite(startIndex) || startIndex < 0) startIndex = 0;

  let endIndex = Math.min(totalLines, Math.max(startIndex + 1, startIndex + visibleCount + bufferSize * 2));

  // FORCE target focused line / active line to be present in DOM range for precise focusing
  let targetFocusIdx: number | null = null;
  if (focusedMatch && focusedMatch.lineNumber > 0) {
    targetFocusIdx = focusedMatch.lineNumber - 1;
  } else if (activeLineIdx !== null && activeLineIdx >= 0) {
    targetFocusIdx = activeLineIdx;
  }

  if (targetFocusIdx !== null && targetFocusIdx >= 0 && targetFocusIdx < totalLines) {
    if (targetFocusIdx < startIndex || targetFocusIdx >= endIndex) {
      startIndex = Math.max(0, targetFocusIdx - bufferSize);
      endIndex = Math.min(totalLines, targetFocusIdx + visibleCount + bufferSize * 2);
    }
  }

  const visibleLines = lines.slice(startIndex, endIndex);

  // Determine Y offset for rendering the visible lines block inside the scroll container
  let offsetY = 0;
  if (!isCapped) {
    offsetY = startIndex * currentLineHeight;
  } else {
    const denom = Math.max(1, totalLines - visibleCount);
    offsetY = (startIndex / denom) * Math.max(0, totalHeight - containerHeight);
  }
  if (isNaN(offsetY) || !isFinite(offsetY) || offsetY < 0) offsetY = 0;

  // Keep the real (native) scroll position and our `scrollTop` state
  // consistent with whatever document is CURRENTLY loaded. This component
  // instance persists across opening/clearing/pasting different documents,
  // so `scrollTop` can be left over from a previous, very differently-sized
  // document (e.g. scrolled deep into a large file, then that file is
  // cleared/replaced and a large amount of text is typed or pasted into what
  // was an empty document). Our virtualization math always clamps startIndex
  // to the CURRENT document's line range, but the real DOM scrollTop doesn't
  // get reset just because content changed underneath it — so the rendered
  // window and the browser's actual scrolled-to position could disagree
  // about where "here" is, and the freshly typed/pasted text ends up
  // rendered outside what's currently scrolled into view: it looks exactly
  // like the text vanished, even without the user touching the scrollbar.
  // Runs before paint (useLayoutEffect) so this never has a chance to flash
  // a blank frame first.
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const maxScroll = Math.max(0, totalHeight - containerHeight);
    if (containerRef.current.scrollTop > maxScroll || scrollTop > maxScroll) {
      containerRef.current.scrollTop = maxScroll;
      setScrollTop(maxScroll);
    }
  }, [lines, totalHeight, containerHeight]);

  // Jump to Top (Line 1)
  const jumpTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrollTop(0);
      setActiveLineIdx(0);
      setEditingText((lines[0] || "").replace(/\r$/, ""));
    }
  };

  // Jump to Bottom
  const jumpBottom = () => {
    if (containerRef.current) {
      const lastIdx = Math.max(0, totalLines - 1);
      setActiveLineIdx(lastIdx);
      setEditingText((lines[lastIdx] || "").replace(/\r$/, ""));
      const maxScroll = Math.max(0, containerRef.current.scrollHeight - containerRef.current.clientHeight);
      containerRef.current.scrollTop = maxScroll;
      setScrollTop(maxScroll);
    }
  };

  // Fine Scroll Step (Line by Line)
  const scrollLines = (deltaLines: number) => {
    if (containerRef.current) {
      const pixelsPerLine = currentLineHeight;
      const scrollDelta = deltaLines * pixelsPerLine;
      const maxScroll = Math.max(0, containerRef.current.scrollHeight - containerRef.current.clientHeight);
      const newScroll = Math.max(
        0,
        Math.min(maxScroll, containerRef.current.scrollTop + scrollDelta)
      );
      containerRef.current.scrollTop = newScroll;
      setScrollTop(newScroll);
    }
  };

  // Scroll to focus a specific line index
  const scrollToLineIdx = (
    lineIdx: number,
    alignToBottom: boolean = false,
    targetTotalLines?: number,
    alignToTop: boolean = false
  ) => {
    if (!containerRef.current) return;
    const numLines = targetTotalLines ?? lines.length;
    if (numLines === 0) return;

    const clampedIdx = Math.max(0, Math.min(numLines - 1, lineIdx));

    const scrollToExact = () => {
      if (!containerRef.current) return;
      const realMaxScroll = Math.max(0, containerRef.current.scrollHeight - containerRef.current.clientHeight);
      if (alignToTop || clampedIdx === 0) {
        containerRef.current.scrollTop = 0;
        setScrollTop(0);
      } else if (alignToBottom || clampedIdx >= numLines - 1) {
        containerRef.current.scrollTop = realMaxScroll;
        setScrollTop(realMaxScroll);
      } else {
        const lineEl = containerRef.current.querySelector(`[data-line-idx="${clampedIdx}"]`) as HTMLElement | null;
        if (lineEl) {
          const containerRect = containerRef.current.getBoundingClientRect();
          const lineRect = lineEl.getBoundingClientRect();
          const currentScroll = containerRef.current.scrollTop;
          const targetY = currentScroll + (lineRect.top - containerRect.top);
          const clampedScroll = Math.max(0, Math.min(realMaxScroll, targetY));
          containerRef.current.scrollTop = clampedScroll;
          setScrollTop(clampedScroll);
        } else {
          // If lineEl is not yet in DOM, estimate scroll position to trigger virtualization range
          const estRatio = clampedIdx / Math.max(1, numLines - 1);
          const estimatedScroll = isCapped
            ? estRatio * realMaxScroll
            : Math.max(0, Math.min(realMaxScroll, clampedIdx * currentLineHeight - containerHeight / 2));
          containerRef.current.scrollTop = estimatedScroll;
          setScrollTop(estimatedScroll);
        }
      }
    };

    scrollToExact();
    requestAnimationFrame(scrollToExact);
    setTimeout(scrollToExact, 40);
    setTimeout(scrollToExact, 100);
  };

  // Right Fast Scrollbar Pointer Drag Logic
  const handleRightPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!rightTrackRef.current || !containerRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingRight(true);

    const rect = rightTrackRef.current.getBoundingClientRect();
    const offsetYPos = e.clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, offsetYPos / rect.height));

    const maxScroll = Math.max(0, totalHeight - containerHeight);
    const newScroll = ratio * maxScroll;
    containerRef.current.scrollTop = newScroll;
    setScrollTop(newScroll);
  };

  const handleRightPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRight || !rightTrackRef.current || !containerRef.current) return;
    const rect = rightTrackRef.current.getBoundingClientRect();
    const offsetYPos = e.clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, offsetYPos / rect.height));

    const maxScroll = Math.max(0, totalHeight - containerHeight);
    const newScroll = ratio * maxScroll;
    containerRef.current.scrollTop = newScroll;
    setScrollTop(newScroll);
  };

  const handleRightPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingRight(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  // Left Nuanced Slow Precision Scrollbar Pointer Drag Logic
  const handleLeftPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingLeft(true);
    dragStartPosRef.current = {
      startY: e.clientY,
      startScrollTop: containerRef.current.scrollTop,
    };
  };

  const handleLeftPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingLeft || !containerRef.current) return;
    const deltaY = e.clientY - dragStartPosRef.current.startY;
    const lineDelta = (deltaY / 15) * currentLineHeight;
    const pixelDelta = isCapped
      ? (lineDelta * MAX_CONTAINER_HEIGHT) / Math.max(1, totalLines * currentLineHeight)
      : lineDelta;
    const maxScroll = Math.max(0, totalHeight - containerHeight);
    const newScroll = Math.max(
      0,
      Math.min(maxScroll, dragStartPosRef.current.startScrollTop + pixelDelta)
    );
    containerRef.current.scrollTop = newScroll;
    setScrollTop(newScroll);
  };

  const handleLeftPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingLeft(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  // Auto Jump / Scroll to focused match line
  useEffect(() => {
    if (!focusedMatch || !containerRef.current) return;
    const targetLineIdx = Math.max(0, Math.min(totalLines - 1, focusedMatch.lineNumber - 1));
    setActiveLineIdx(targetLineIdx);
    const maxScroll = Math.max(0, totalHeight - containerHeight);

    let initialScroll = 0;
    if (targetLineIdx === 0) {
      initialScroll = 0;
    } else if (targetLineIdx >= totalLines - 1) {
      initialScroll = maxScroll;
    } else if (isCapped) {
      const targetRatio = totalLines > 1 ? targetLineIdx / (totalLines - 1) : 0;
      initialScroll = targetRatio * maxScroll;
    } else {
      initialScroll = Math.max(0, Math.min(maxScroll, targetLineIdx * currentLineHeight - containerHeight / 2));
    }

    containerRef.current.scrollTop = initialScroll;
    setScrollTop(initialScroll);

    setActiveColIdx(0);
    const rawLine = (lines[targetLineIdx] || "").replace(/\r$/, "");
    const { editableText } = extractTimestampPrefix(rawLine);
    setEditingText(editableText);

    // Precise DOM element centering alignment once React mounts/updates the line item
    let attempts = 0;
    let animId: number;

    const alignCenteredElement = () => {
      if (!containerRef.current) return;
      const containerEl = containerRef.current;
      if (targetLineIdx === 0) {
        containerEl.scrollTop = 0;
        setScrollTop(0);
        return;
      }

      const lineEl = containerEl.querySelector(`[data-line-idx="${targetLineIdx}"]`) as HTMLElement | null;
      if (lineEl) {
        // Native scrollIntoView centers the element dead-center in the container viewport regardless of variable heights
        lineEl.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
        setScrollTop(containerEl.scrollTop);
      } else if (attempts < 30) {
        attempts++;
        animId = requestAnimationFrame(alignCenteredElement);
      }
    };

    animId = requestAnimationFrame(alignCenteredElement);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [focusedMatch, totalLines, containerHeight, isCapped, totalHeight, currentLineHeight]);

  // Extract protected timestamp prefix from message line
  const extractTimestampPrefix = (line: string): { timestampPrefix: string; editableText: string } => {
    if (!line) return { timestampPrefix: "", editableText: "" };

    const tsRegex = /^(\[\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}(?:\s[^\]]+)?\](?:\s*[^:]+?:)?\s*|\[\d{2}:\d{2}:\d{2}(?:\s[^\]]+)?\](?:\s*[^:]+?:)?\s*|\[\d{2}:\d{2}(?:\s[^\]]+)?\](?:\s*[^:]+?:)?\s*)/;

    const match = line.match(tsRegex);
    if (match) {
      const timestampPrefix = match[1];
      const editableText = line.slice(timestampPrefix.length);
      return { timestampPrefix, editableText };
    }

    return { timestampPrefix: "", editableText: line };
  };

  // Format Timestamp String
  const generateTimestampStr = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const namePart = userName.trim() ? ` ${userName.trim()}` : "";
    return `[${dateStr} ${timeStr}]${namePart}: `;
  };

  // Parse a "YYYY-MM-DD HH:MM:SS" timestamp (exactly what generateTimestampStr
  // produces) back into local-time milliseconds, so we can tell how long ago a
  // message was actually sent — built from the same local date/time fields
  // rather than handed to Date() as a string, since "YYYY-MM-DD HH:MM:SS"
  // parsing isn't consistently reliable across WebView builds.
  const parseLocalTimestampMs = (timestamp: string): number | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})$/.exec(timestamp.trim());
    if (!m) return null;
    const [, y, mo, d, h, mi, s] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime();
  };

  // Ticks once a minute so the "Edit" affordance on a freshly sent message
  // disappears again once it ages past the 15-minute edit window, without
  // needing any other state change to trigger a re-render.
  const [editWindowNowTick, setEditWindowNowTick] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setEditWindowNowTick(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  const isMessageEditable = (timestamp: string): boolean => {
    if (!timestamp) return false;
    const sentAtMs = parseLocalTimestampMs(timestamp);
    if (sentAtMs === null) return false;
    return editWindowNowTick - sentAtMs < EDIT_WINDOW_MS;
  };

  // Fast O(1) Memoized Message Indexer for ChatGPT & Transcript Exports
  const getParsedMessage = useCallback((idx: number, lineStr: string): ParsedMessage => {
    if (typeof lineStr !== "string") {
      return {
        timestamp: "",
        sender: "",
        role: "assistant",
        text: "",
        isMessage: false,
        isCodeBlock: false,
        isHeader: false,
        isList: false,
      };
    }

    const cached = messageCacheRef.current.get(idx);
    if (cached) return cached;

    const clean = lineStr ? lineStr.replace(/\r$/, "") : "";
    if (!clean) {
      const empty: ParsedMessage = {
        timestamp: "",
        sender: "",
        role: "system",
        text: "",
        isMessage: false,
        isCodeBlock: false,
        isHeader: false,
        isList: false,
      };
      messageCacheRef.current.set(idx, empty);
      return empty;
    }

    let timestamp = "";
    let sender = "";
    let text = clean;
    let isMessage = false;

    // 1. Bracketed timestamp e.g. [2026-08-10 10:00:00] User: ...
    if (clean[0] === "[") {
      const closeBracket = clean.indexOf("]");
      if (closeBracket > 1 && closeBracket < 60) {
        timestamp = clean.slice(1, closeBracket).trim();
        const rest = clean.slice(closeBracket + 1).trim();
        const colonIdx = rest.indexOf(":");
        if (colonIdx > 0 && colonIdx < 40) {
          sender = rest.slice(0, colonIdx).trim();
          text = rest.slice(colonIdx + 1);
          isMessage = true;
        } else {
          text = rest;
          isMessage = true;
        }
      }
    }

    // 2. Chat export " - " format e.g. "12/08/2026, 14:32 - Sender: Message"
    if (!isMessage) {
      const dashIdx = clean.indexOf(" - ");
      if (dashIdx > 4 && dashIdx < 45) {
        timestamp = clean.slice(0, dashIdx).trim();
        const rest = clean.slice(dashIdx + 3);
        const colonIdx = rest.indexOf(":");
        if (colonIdx > 0 && colonIdx < 40) {
          sender = rest.slice(0, colonIdx).trim();
          text = rest.slice(colonIdx + 1);
          isMessage = true;
        }
      }
    }

    // 3. Sender: Message format
    if (!isMessage) {
      const colonIdx = clean.indexOf(":");
      if (colonIdx > 0 && colonIdx < 35) {
        const possibleSender = clean.slice(0, colonIdx).trim();
        const lower = possibleSender.toLowerCase();
        if (
          lower === "user" ||
          lower === "chatgpt" ||
          lower === "assistant" ||
          lower === "you" ||
          lower === "system" ||
          (!possibleSender.includes(" ") && !possibleSender.includes("\n"))
        ) {
          sender = possibleSender;
          text = clean.slice(colonIdx + 1);
          isMessage = true;
        }
      }
    }

    // 4. Markdown header format ### User or ### Assistant
    if (!isMessage && clean.trim().startsWith("### ")) {
      sender = clean.trim().replace(/^###\s*/, "");
      text = "";
      isMessage = true;
    }

    const lowerSender = sender.toLowerCase();
    let role: "user" | "assistant" | "system" = "assistant";
    if (lowerSender.includes("user") || lowerSender.includes("chris") || lowerSender.includes("human") || lowerSender.includes("you")) {
      role = "user";
    } else if (lowerSender.includes("system")) {
      role = "system";
    }

    const trimmed = text.trim();
    const isCodeBlock = trimmed.startsWith("```");
    let codeLang: string | undefined;
    if (isCodeBlock) {
      codeLang = trimmed.slice(3).trim();
    }
    const isHeader = clean.startsWith("# ") || clean.startsWith("## ") || clean.startsWith("### ");
    const isList = /^\s*[\*\-\+]\s+/.test(clean) || /^\s*\d+[\.\)]\s+/.test(clean);

    const res: ParsedMessage = {
      timestamp,
      sender,
      role,
      text,
      isMessage,
      isCodeBlock,
      codeLang,
      isHeader,
      isList,
    };

    messageCacheRef.current.set(idx, res);
    return res;
  }, [lines]);

  // Detect a remark line added via message-edit (see handleSaveMessageEdit):
  // stored in the document as "    ↳ [rem] text" for the first line of a
  // remark and "      [rem] text" for any further lines of it. Returns the
  // remark's own text with that marker stripped, so it can be shown as a
  // small "rem" badge instead of literal bracket text — or null if this
  // line isn't a remark line at all.
  const REMARK_LINE_RE = /^\s*(?:↳\s*)?\[rem\]\s?(.*)$/;
  const parseRemarkLine = (text: string): string | null => {
    const m = REMARK_LINE_RE.exec(text);
    return m ? m[1] : null;
  };

  // Formatted inline Markdown & Text renderer for ChatGPT & User responses
  const renderFormattedContent = (
    text: string,
    role: "user" | "assistant" | "system",
    darkTheme: boolean,
    isFocused: boolean
  ) => {
    if (!text || typeof text !== "string") return null;

    if (text.trim().startsWith("```")) {
      const lang = text.trim().slice(3);
      return (
        <div className={`my-0.5 font-mono text-[10px] px-2 py-0.5 rounded border inline-flex items-center gap-1.5 ${
          darkTheme ? "bg-slate-900 border-slate-700 text-teal-300" : "bg-slate-800 border-slate-700 text-teal-200"
        }`}>
          <Code className="w-3 h-3 text-amber-400 shrink-0" />
          <span className="font-bold text-amber-400 uppercase tracking-wider">
            Code Block {lang ? `(${lang})` : ""}
          </span>
        </div>
      );
    }

    // Split on **bold** and `code`
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

    return (
      <span>
        {parts.map((part, i) => {
          if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
            const content = part.slice(2, -2);
            return (
              <strong
                key={i}
                className={`font-bold ${
                  isFocused
                    ? "text-amber-950 font-extrabold"
                    : role === "user"
                    ? darkTheme
                      ? "text-emerald-300"
                      : "text-emerald-950"
                    : darkTheme
                    ? "text-teal-200"
                    : "text-slate-950 font-extrabold"
                }`}
              >
                {content}
              </strong>
            );
          }
          if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
            const content = part.slice(1, -1);
            return (
              <code
                key={i}
                className={`font-mono text-[11px] px-1 py-0.2 rounded border mx-0.5 ${
                  darkTheme
                    ? "bg-slate-900 text-teal-300 border-slate-700/80"
                    : "bg-slate-200 text-teal-900 border-slate-300 font-bold"
                }`}
              >
                {content}
              </code>
            );
          }
          return part;
        })}
      </span>
    );
  };

  // Hover pointer calculation for Free Writing Cursor searching
  const handlePointerMoveCanvas = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relY = e.clientY - rect.top + containerRef.current.scrollTop - 4;
    const calcLineIdx = Math.max(0, Math.min(totalLines - 1, Math.floor(relY / currentLineHeight)));
    
    const leftGutter = showLineNumbers ? (viewMode === "vertical-messages" ? 44 : 56) : 12;
    const relX = Math.max(0, e.clientX - rect.left - leftGutter);
    const approxCharWidth = 7.5;
    const currentLineText = lines[calcLineIdx] || "";
    const calcColIdx = Math.min(currentLineText.length, Math.max(0, Math.floor(relX / approxCharWidth)));

    setHoverCursor({
      lineIdx: calcLineIdx,
      colIdx: calcColIdx,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  };

  const handlePointerLeaveCanvas = () => {
    setHoverCursor(null);
  };

  // Single line copy state and handler
  const [copiedLineIdx, setCopiedLineIdx] = useState<number | null>(null);

  const handleCopySingleLine = (e: React.MouseEvent, lineText: string, lineIdx: number) => {
    e.stopPropagation();
    if (!lineText) return;
    navigator.clipboard.writeText(lineText).then(() => {
      setCopiedLineIdx(lineIdx);
      setTimeout(() => {
        setCopiedLineIdx(null);
      }, 2000);
    }).catch(() => {
      setCopiedLineIdx(null);
    });
  };

  // Find the full range of document lines that belong to one message
  // starting at startIdx: its timestamped first line plus every
  // continuation line, up to (but not including) the next message's own
  // timestamped line, or end of document. Deliberately does NOT stop at an
  // interior blank line — a pasted block of code very often has blank
  // lines in the middle of it, and those are real content of THIS message,
  // not a separator from the next one. Shared by Copy Full (below) and by
  // the remark-editing cursor range check, so both agree on where a
  // message actually ends.
  const getMessageLineRange = (startIdx: number): { start: number; end: number } => {
    let end = startIdx;
    for (let i = startIdx + 1; i < lines.length; i++) {
      const raw = (lines[i] || "").replace(/\r$/, "");
      if (extractTimestampPrefix(raw).timestampPrefix) break;
      end = i;
    }
    return { start: startIdx, end };
  };

  // Copy an entire text message — its timestamp+name line PLUS every
  // continuation line that belongs to it (e.g. a pasted multi-line/code
  // message) — in one click, instead of having to copy each line
  // separately. Only offered on a message's first (timestamped) line.
  // The existing single-line Copy button is untouched and still copies
  // just that one line.
  const [copiedFullMessageIdx, setCopiedFullMessageIdx] = useState<number | null>(null);

  const handleCopyFullMessage = (e: React.MouseEvent, startIdx: number) => {
    e.stopPropagation();
    const { end } = getMessageLineRange(startIdx);
    const collected: string[] = [];
    for (let i = startIdx; i <= end; i++) {
      collected.push((lines[i] || "").replace(/\r$/, ""));
    }
    // Trim only TRAILING blank lines — those just separate this message
    // from whatever comes after it (e.g. a "+ Remark Line" spacer), not
    // actual content of this message. Interior blank lines (blank lines in
    // the middle of pasted code, paragraph breaks, etc.) are kept, since
    // dropping them at the first one used to cut a code message off after
    // only its first few lines.
    while (collected.length > 1 && collected[collected.length - 1].trim() === "") {
      collected.pop();
    }
    const combined = collected.join("\n");
    if (!combined) return;
    navigator.clipboard.writeText(combined).then(() => {
      setCopiedFullMessageIdx(startIdx);
      setTimeout(() => setCopiedFullMessageIdx(null), 2000);
    }).catch(() => {});
  };

  // Multi-message selection for combined copy: tap the "Select" toggle on any
  // number of text messages to mark them, then hit the floating "Copy
  // Selected" bar that appears to copy them all at once, in document order,
  // as one clipboard write. Tapping a toggle again deselects that message.
  const [multiCopySelection, setMultiCopySelection] = useState<Set<number>>(new Set());
  const [multiCopyDone, setMultiCopyDone] = useState(false);

  const toggleMultiCopySelection = (e: React.MouseEvent, lineIdx: number) => {
    e.stopPropagation();
    setMultiCopySelection((prev) => {
      const next = new Set(prev);
      if (next.has(lineIdx)) next.delete(lineIdx);
      else next.add(lineIdx);
      return next;
    });
  };

  const clearMultiCopySelection = () => setMultiCopySelection(new Set());

  const handleCopyMultiSelected = () => {
    if (multiCopySelection.size === 0) return;
    const sortedIdx = Array.from(multiCopySelection).sort((a, b) => a - b);
    const combined = sortedIdx.map((idx) => (lines[idx] || "").replace(/\r$/, "")).join("\n");
    navigator.clipboard.writeText(combined).then(() => {
      setMultiCopyDone(true);
      setTimeout(() => setMultiCopyDone(false), 2000);
    }).catch(() => {});
  };

  // Jump into editing a freshly-sent message (only offered within the
  // 15-minute edit window) — reuses the existing click-to-place-cursor +
  // inline edit pipeline, just triggered from an explicit button instead of
  // requiring the user to know they can tap the line directly. Loads the
  // message's own current text (every line of it, timestamp aside) straight
  // into the compose box below, so it's fully visible and every character,
  // space, and line of it can be edited directly — Send then saves those
  // edits back onto the message in place; see handleSaveMessageEdit.
  const handleEditRecentMessage = (e: React.MouseEvent, lineIdx: number) => {
    e.stopPropagation();
    const { start, end } = getMessageLineRange(lineIdx);
    const rawFirst = (lines[start] || "").replace(/\r$/, "");
    const { editableText } = extractTimestampPrefix(rawFirst);
    const restLines: string[] = [];
    for (let i = start + 1; i <= end; i++) {
      restLines.push((lines[i] || "").replace(/\r$/, ""));
    }

    // Resolve cursor placement FIRST — this may cancel a different
    // message's in-progress edit session (see handleSelectCursorLocation
    // below) — before loading THIS message's text in, so that cancellation
    // can't turn around and wipe out the edit session being started here.
    handleSelectCursorLocation(start, rawFirst.length);

    setChatInput([editableText, ...restLines].join("\n"));
    setEditingOriginalLineCount(end - start + 1);
    setEditingRemarkStartIdx(start);
    if (!isWritingBoxExpanded) expandWritingBox();
  };

  // Select cursor location anywhere in document (without auto-expanding writing box)
  const handleSelectCursorLocation = (lineIdx: number, colIdx: number = 0) => {
    setActiveLineIdx(lineIdx);
    setActiveColIdx(colIdx);
    // The cursor can move to any line WITHIN the message currently being
    // edited (its blinking-cursor preview just repositions), but moving to
    // a line outside it means the user has moved on to something else —
    // cancel the edit session and drop its loaded draft rather than risk
    // that leftover text silently getting sent later as a brand new,
    // duplicate message.
    if (editingRemarkStartIdx !== null) {
      const { start, end } = getMessageLineRange(editingRemarkStartIdx);
      if (lineIdx < start || lineIdx > end) {
        setEditingRemarkStartIdx(null);
        setEditingOriginalLineCount(0);
        setChatInput("");
      }
    }
    const raw = (lines[lineIdx] || "").replace(/\r$/, "");
    if (isFreeWritingMode) {
      setEditingText(raw);
    } else {
      const { editableText } = extractTimestampPrefix(raw);
      setEditingText(editableText);
    }
  };

  // Insert explicit empty line between messages to place a remark cursor
  const handleInsertEmptyRemarkLine = () => {
    let updatedLines = [...lines];
    let targetIdx = lines.length;

    if (activeLineIdx !== null && activeLineIdx < lines.length) {
      targetIdx = activeLineIdx + 1;
      updatedLines.splice(targetIdx, 0, "");
    } else {
      updatedLines.push("");
      targetIdx = updatedLines.length - 1;
    }

    applyChange(updatedLines);
    setActiveLineIdx(targetIdx);
    setActiveColIdx(0);
    setEditingText("");
    expandWritingBox();
    if (chatInputRef.current) {
      forceFollowBottomRef.current = true;
      chatInputRef.current.focus();
    }

    setTimeout(() => {
      scrollToLineIdx(targetIdx);
    }, 50);
  };

  // Create a new line at top of document (Line 1) and start writing immediately in that line
  const handleCreateNewLineAtTop = () => {
    let updatedLines = [...lines];
    if (updatedLines.length === 0) {
      updatedLines = [""];
    } else {
      updatedLines.unshift("");
    }
    applyChange(updatedLines);

    setActiveLineIdx(0);
    setActiveColIdx(0);
    setEditingText("");
    expandWritingBox();

    setTimeout(() => {
      scrollToLineIdx(0, false, updatedLines.length, true);
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
        setScrollTop(0);
      }
      if (chatInputRef.current) {
        forceFollowBottomRef.current = true;
        chatInputRef.current.focus();
      }
    }, 50);
  };

  // Create a new line at bottom of document and start writing immediately in that line
  const handleCreateNewLineAtBottom = () => {
    let updatedLines = [...lines];
    const lastLine = updatedLines[updatedLines.length - 1];
    let newBottomIdx: number;

    if (updatedLines.length === 0 || (lastLine !== undefined && lastLine.trim() !== "")) {
      updatedLines.push("");
      newBottomIdx = updatedLines.length - 1;
      applyChange(updatedLines);
    } else {
      newBottomIdx = updatedLines.length - 1;
    }

    setActiveLineIdx(newBottomIdx);
    setActiveColIdx(0);
    setEditingText("");
    expandWritingBox();

    setTimeout(() => {
      scrollToLineIdx(newBottomIdx, true, updatedLines.length);
      if (chatInputRef.current) {
        forceFollowBottomRef.current = true;
        chatInputRef.current.focus();
      }
    }, 50);
  };

  // Listen to + New Line at Bottom trigger from topper menu
  const prevTriggerRef = useRef(triggerNewLineAtBottom);
  useEffect(() => {
    if (triggerNewLineAtBottom && triggerNewLineAtBottom !== prevTriggerRef.current) {
      prevTriggerRef.current = triggerNewLineAtBottom;
      handleCreateNewLineAtBottom();
      expandWritingBox();
    }
  }, [triggerNewLineAtBottom, expandWritingBox]);

  // Send text entry into cursor location or bottom of document
  const handleSendChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput) return;

    // Split the compose box into individual lines. A multi-line paste (e.g. a
    // block of code) used to get sent as ONE document line with raw "\n"
    // characters embedded inside it — no real per-line numbering until a
    // save+reload round trip happened to re-split it. Now every line becomes
    // its own real document line immediately: only the first gets the
    // timestamp+name prefix, like a real chat message; the rest are inserted
    // as plain continuation lines. Nothing here trims interior lines, so
    // indentation/whitespace and normal backspace editing on them are
    // completely unaffected — only fully-empty lines at the very start/end
    // (stray Enter presses before hitting Send) are dropped.
    const rawInputLines = chatInput.split("\n");
    let start = 0;
    let end = rawInputLines.length;
    while (end - start > 1 && rawInputLines[start].length === 0) start++;
    while (end - start > 1 && rawInputLines[end - 1].length === 0) end--;
    const contentLines = rawInputLines.slice(start, end);
    if (contentLines.length === 0 || contentLines.every((l) => l.trim() === "")) return;

    // Editing an existing message (via its Edit button, within the
    // 15-minute window) saves those edits back onto the message in place —
    // an entirely different path from composing a brand new message below —
    // and never creates a new timestamped message.
    if (editingRemarkStartIdx !== null) {
      handleSaveMessageEdit(contentLines);
      return;
    }

    let updatedLines = [...lines];
    const ts = generateTimestampStr();
    const entries = [`${ts}${contentLines[0]}`, ...contentLines.slice(1)];
    const lastEntryText = entries[entries.length - 1];
    let focusLineIdx: number | null = null;

    if (isFreeWritingMode) {
      // FREE WRITING MODE: Create new message line(s) with timestamp & username at exact cursor location
      if (activeLineIdx !== null && activeLineIdx < lines.length) {
        const targetLine = lines[activeLineIdx] || "";
        if (targetLine.trim() === "") {
          // Fill target empty line
          // Rebuilt via array-literal spread rather than
          // splice(idx, n, ...entries) / push(...entries) — spreading a
          // huge `entries` array (a message can legitimately be
          // 1,000,000+ lines) into a FUNCTION CALL blows past the JS
          // engine's argument-count limit and throws; spreading into an
          // array literal has no such limit, so this scales to any
          // document/message size the editor otherwise supports.
          updatedLines = [...updatedLines.slice(0, activeLineIdx), ...entries, ...updatedLines.slice(activeLineIdx + 1)];
          const newIdx = activeLineIdx + entries.length - 1;
          setActiveLineIdx(newIdx);
          setActiveColIdx(lastEntryText.length);
          focusLineIdx = newIdx;
        } else if (activeColIdx !== null && activeColIdx > 0 && activeColIdx < targetLine.length) {
          // Split line at cursor column and insert timestamped message as its own new line(s) in between
          const beforeText = targetLine.slice(0, activeColIdx);
          const afterText = targetLine.slice(activeColIdx);
          updatedLines = [...updatedLines.slice(0, activeLineIdx), beforeText, ...entries, afterText, ...updatedLines.slice(activeLineIdx + 1)];
          const newIdx = activeLineIdx + entries.length;
          setActiveLineIdx(newIdx);
          setActiveColIdx(lastEntryText.length);
          focusLineIdx = newIdx;
        } else {
          // Insert as new message line(s) directly after active line
          updatedLines = [...updatedLines.slice(0, activeLineIdx + 1), ...entries, ...updatedLines.slice(activeLineIdx + 1)];
          const newIdx = activeLineIdx + entries.length;
          setActiveLineIdx(newIdx);
          setActiveColIdx(lastEntryText.length);
          focusLineIdx = newIdx;
        }
      } else {
        // Append new message line(s) at bottom of file
        updatedLines = [...updatedLines, ...entries];
        const newIdx = updatedLines.length - 1;
        setActiveLineIdx(newIdx);
        setActiveColIdx(lastEntryText.length);
        focusLineIdx = newIdx;
      }
    } else {
      // STANDARD REMARK FUNCTION
      if (activeLineIdx !== null && activeLineIdx < lines.length) {
        const targetLine = lines[activeLineIdx] || "";
        if (targetLine.trim() === "") {
          updatedLines = [...updatedLines.slice(0, activeLineIdx), ...entries, ...updatedLines.slice(activeLineIdx + 1)];
          focusLineIdx = activeLineIdx + entries.length - 1;
        } else if (activeColIdx !== null && activeColIdx > 0 && activeColIdx < targetLine.length) {
          const beforeText = targetLine.slice(0, activeColIdx);
          const afterText = targetLine.slice(activeColIdx);
          updatedLines = [...updatedLines.slice(0, activeLineIdx), beforeText, ...entries, afterText, ...updatedLines.slice(activeLineIdx + 1)];
          focusLineIdx = activeLineIdx + entries.length;
        } else {
          updatedLines = [...updatedLines.slice(0, activeLineIdx + 1), ...entries, ...updatedLines.slice(activeLineIdx + 1)];
          focusLineIdx = activeLineIdx + entries.length;
        }
      } else {
        updatedLines = [...updatedLines, ...entries];
        focusLineIdx = updatedLines.length - 1;
      }

      // Advance cursor target to next line for remarks
      if (activeLineIdx !== null) {
        const nextIdx = focusLineIdx !== null ? Math.min(updatedLines.length - 1, focusLineIdx + 1) : Math.min(updatedLines.length - 1, activeLineIdx + 1);
        setActiveLineIdx(nextIdx);
        setActiveColIdx(0);
        focusLineIdx = nextIdx;
      } else {
        setActiveLineIdx(null);
        setActiveColIdx(null);
      }
    }

    applyChange(updatedLines);
    setChatInput("");

    if (focusLineIdx !== null) {
      const target = focusLineIdx;
      const isBottomLine = target >= updatedLines.length - 1;
      const isTopLine = target === 0;
      setTimeout(() => {
        scrollToLineIdx(target, isBottomLine || cursorVerticalView, updatedLines.length, isTopLine);
      }, 50);
    }
  };

  // Save an in-progress message edit (see handleEditRecentMessage above)
  // back onto the message itself, in place — never as a new message. The
  // first editingOriginalLineCount lines of the compose box are treated as
  // the (possibly edited) original message content and directly replace its
  // old lines, keeping its original protected timestamp untouched; any
  // further lines typed beyond that are new content the user added during
  // this edit, so they're kept as a separate, clearly-marked remark
  // (indented and tagged "rem") appended right after the edited message,
  // rather than being silently folded into it as if they'd always been
  // there.
  const handleSaveMessageEdit = (contentLines: string[]) => {
    const msgStartIdx = editingRemarkStartIdx;
    if (msgStartIdx === null) return;
    const { start: rangeStart, end: rangeEnd } = getMessageLineRange(msgStartIdx);
    const originalFirstRaw = (lines[rangeStart] || "").replace(/\r$/, "");
    const { timestampPrefix } = extractTimestampPrefix(originalFirstRaw);

    const editedOriginal = contentLines.slice(0, editingOriginalLineCount);
    const newRemarkLines = contentLines.slice(editingOriginalLineCount);

    const rebuiltOriginal =
      editedOriginal.length > 0
        ? [`${timestampPrefix}${editedOriginal[0]}`, ...editedOriginal.slice(1)]
        : [timestampPrefix];
    const remarkLines = newRemarkLines.map((l, i) => (i === 0 ? `    ↳ [rem] ${l}` : `      [rem] ${l}`));
    const replacement = [...rebuiltOriginal, ...remarkLines];

    const updatedLines = [...lines.slice(0, rangeStart), ...replacement, ...lines.slice(rangeEnd + 1)];
    applyChange(updatedLines);
    setChatInput("");
    setEditingRemarkStartIdx(null);
    setEditingOriginalLineCount(0);

    const target = rangeStart + replacement.length - 1;
    setActiveLineIdx(target);
    setActiveColIdx(0);
    setTimeout(() => {
      scrollToLineIdx(target, false, updatedLines.length);
    }, 50);
  };

  // Insert Inline Timestamp Button
  const handleInsertTimestampInline = () => {
    const ts = generateTimestampStr();
    let updatedLines = [...lines];

    if (activeLineIdx !== null && activeLineIdx < lines.length) {
      const current = lines[activeLineIdx] || "";
      updatedLines[activeLineIdx] = `${current} ${ts}`;
    } else {
      updatedLines.push(ts);
    }

    applyChange(updatedLines);
  };

  // Save Line Edit (Preserves timestamp prefix if present)
  const handleLineSave = (idx: number) => {
    const rawLine = (lines[idx] || "").replace(/\r$/, "");
    const { timestampPrefix } = extractTimestampPrefix(rawLine);
    const cleanEditing = editingText.replace(/\r$/, "");
    const fullLine = `${timestampPrefix}${cleanEditing}`;

    if (lines[idx] === fullLine) return;
    const updated = [...lines];
    updated[idx] = fullLine;
    applyChange(updated);
  };

  // Copy Entire Document (Safeguarded against single text messages that are too long)
  const handleCopyAll = () => {
    const MAX_SINGLE_MESSAGE_COPY = 30000;
    const hasExcessiveMessage = lines.some((l) => l.length > MAX_SINGLE_MESSAGE_COPY);
    if (hasExcessiveMessage) {
      setCopied(false);
      return;
    }
    const fullText = lines.join("\n");
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      setCopied(false);
    });
  };

  // Paste into active line / document
  const handlePasteClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText) return;

      const pastedLines = clipText.split("\n");
      let updated = [...lines];

      // Array-literal spread, not splice(idx, n, ...pastedLines) — a
      // clipboard paste can legitimately be 1,000,000+ lines, and spreading
      // that many into a function call blows past the JS engine's
      // argument-count limit and throws. Spreading into an array literal
      // has no such limit.
      if (activeLineIdx !== null && activeLineIdx < lines.length) {
        updated = [...updated.slice(0, activeLineIdx + 1), ...pastedLines, ...updated.slice(activeLineIdx + 1)];
      } else {
        updated = [...updated, ...pastedLines];
      }

      applyChange(updated);
    } catch (err) {
      console.error("Paste failed:", err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative font-mono select-text">
      {/* Sub-Header Toolbar Controls */}
      <div
        id="editor-toolbar"
        className={`px-3 py-1.5 border-b text-xs flex flex-wrap items-center justify-between gap-2 select-none z-10 ${
          darkTheme ? "bg-slate-900 border-slate-800 text-slate-300" : "bg-slate-100 border-slate-200 text-slate-700"
        }`}
      >
        <div className="flex items-center space-x-2 font-mono text-[11px] text-emerald-400">
          <Clock className="w-3.5 h-3.5" />
          <span>Line {activeLineIdx !== null ? activeLineIdx + 1 : 1} of {totalLines.toLocaleString()}</span>
        </div>

        <div className="flex items-center space-x-1 sm:space-x-2">
          {/* Undo Button */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-amber-300 border border-slate-700 text-[11px] font-semibold flex items-center space-x-1 transition-all shadow-sm"
            title="Undo last edit (Ctrl+Z)"
          >
            <Undo className="w-3.5 h-3.5 text-amber-400" />
            <span>Undo {undoStack.length > 0 ? `(${undoStack.length})` : ""}</span>
          </button>

          {/* Redo Button */}
          <button
            type="button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-teal-300 border border-slate-700 text-[11px] font-semibold flex items-center space-x-1 transition-all shadow-sm"
            title="Redo edit (Ctrl+Y / Ctrl+Shift+Z)"
          >
            <Redo className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden sm:inline">Redo</span>
          </button>
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto overflow-y-visible max-w-full pb-1 pt-0.5 scrollbar-thin touch-pan-x shrink-0">
          {/* Free Writing Finger Hover Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsFreeWritingMode(!isFreeWritingMode)}
            className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded text-[11px] font-semibold flex items-center space-x-1 border transition-all ${
              isFreeWritingMode
                ? "bg-amber-600 text-white border-amber-500 shadow-sm"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
            }`}
            title="Toggle Free Writing finger hover mode to search and place cursor anywhere"
          >
            <PenTool className="w-3.5 h-3.5 text-amber-200" />
            <span>{isFreeWritingMode ? "Free Writing Active" : "Free Writing Off"}</span>
          </button>

          {/* Vertical Messages View Toggle */}
          <button
            type="button"
            onClick={() => setViewMode(viewMode === "code" ? "vertical-messages" : "code")}
            className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded text-[11px] font-semibold flex items-center space-x-1 border transition-all ${
              viewMode === "vertical-messages"
                ? "bg-emerald-600 text-white border-emerald-500 shadow-sm"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
            }`}
            title="Toggle Vertical Text Message View"
          >
            {viewMode === "vertical-messages" ? (
              <>
                <MessageSquare className="w-3.5 h-3.5 text-teal-200" />
                <span>Vertical Messages View</span>
              </>
            ) : (
              <>
                <Code className="w-3.5 h-3.5 text-slate-400" />
                <span>Code / Raw Editor</span>
              </>
            )}
          </button>

          {/* Insert Empty Remark Line Button */}
          <button
            type="button"
            onClick={handleInsertEmptyRemarkLine}
            className="shrink-0 whitespace-nowrap px-2 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-600/70 text-[11px] font-semibold flex items-center space-x-1 transition-all shadow-sm"
            title="Insert a new empty remark line between messages and place cursor"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>+ Remark Line</span>
          </button>

          {/* Create New Line at Bottom Button */}
          <button
            type="button"
            onClick={handleCreateNewLineAtBottom}
            className="shrink-0 whitespace-nowrap px-2.5 py-1 rounded bg-teal-950/90 hover:bg-teal-900 text-teal-300 border border-teal-500/70 text-[11px] font-bold flex items-center space-x-1 transition-all shadow-sm"
            title="Create a new line at the bottom of document to start writing immediately"
          >
            <PlusCircle className="w-3.5 h-3.5 text-teal-400" />
            <span>+ New Line at Bottom</span>
          </button>

          {/* Submenu Dropdown for Smaller Android Phone Screens & Mobile Quick Access */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsSubmenuOpen((prev) => !prev)}
              className={`shrink-0 whitespace-nowrap px-3 py-1 rounded text-xs font-bold flex items-center space-x-1.5 border transition-all shadow-md ${
                isSubmenuOpen
                  ? "bg-teal-600 text-white border-teal-400 ring-2 ring-teal-400/50"
                  : darkTheme
                  ? "bg-teal-950/90 text-teal-300 border-teal-500/70 hover:bg-teal-900"
                  : "bg-teal-100 text-teal-900 border-teal-300 hover:bg-teal-200"
              }`}
              title="Open Submenu for Timestamp, Copy All, Paste, and Word Wrap"
            >
              <MoreVertical className="w-4 h-4 text-teal-400 shrink-0" />
              <span>Submenu ▾</span>
            </button>

            {isSubmenuOpen && (
              <>
                {/* Backdrop to dismiss submenu on click outside */}
                <div
                  className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                  onClick={() => setIsSubmenuOpen(false)}
                />

                <div
                  className={`absolute right-0 top-full mt-1.5 w-60 rounded-xl border shadow-2xl p-2.5 z-50 flex flex-col gap-1.5 text-xs ${
                    darkTheme
                      ? "bg-slate-900 border-slate-700 text-slate-200"
                      : "bg-white border-slate-300 text-slate-900 shadow-slate-400/50"
                  }`}
                >
                  <div
                    className={`text-[11px] font-bold uppercase tracking-wider px-2 py-1 border-b flex items-center justify-between ${
                      darkTheme ? "text-teal-400 border-slate-800" : "text-teal-700 border-slate-200"
                    }`}
                  >
                    <span>Actions Submenu</span>
                    <button
                      type="button"
                      onClick={() => setIsSubmenuOpen(false)}
                      className={`p-0.5 rounded ${
                        darkTheme ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Submenu Item 1: Insert Timestamp */}
                  <button
                    type="button"
                    onClick={() => {
                      handleInsertTimestampInline();
                      setIsSubmenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg font-semibold flex items-center justify-between transition-colors border active:scale-98 ${
                      darkTheme
                        ? "bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700/60"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-200"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Clock className="w-4 h-4 text-teal-500 shrink-0" />
                      <span>Insert Timestamp</span>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      darkTheme ? "bg-slate-900 text-teal-300 border-teal-500/50" : "bg-teal-50 text-teal-800 border-teal-200"
                    }`}>
                      +TAG
                    </span>
                  </button>

                  {/* Submenu Item 2: Copy All Text */}
                  <button
                    type="button"
                    onClick={() => {
                      handleCopyAll();
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg font-semibold flex items-center justify-between transition-colors border active:scale-98 ${
                      darkTheme
                        ? "bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700/60"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-200"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Copy className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Copy All Text</span>
                    </div>
                    {copied && (
                      <span className="text-[10px] font-bold text-emerald-500 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-600/60">
                        Copied!
                      </span>
                    )}
                  </button>

                  {/* Submenu Item 3: Paste Clipboard */}
                  <button
                    type="button"
                    onClick={() => {
                      handlePasteClipboard();
                      setIsSubmenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg font-semibold flex items-center space-x-2.5 transition-colors border active:scale-98 ${
                      darkTheme
                        ? "bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700/60"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-200"
                    }`}
                  >
                    <Clipboard className="w-4 h-4 text-teal-500 shrink-0" />
                    <span>Paste Clipboard</span>
                  </button>

                  {/* Submenu Item 4: Word Wrap Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      setWordWrap(!wordWrap);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg font-semibold flex items-center justify-between transition-colors border active:scale-98 ${
                      darkTheme
                        ? "bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700/60"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-200"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      {wordWrap ? (
                        <AlignLeft className="w-4 h-4 text-amber-500 shrink-0" />
                      ) : (
                        <Columns className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span>Word Wrap</span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        wordWrap
                          ? darkTheme
                            ? "bg-emerald-950 text-emerald-300 border-emerald-600/80"
                            : "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : darkTheme
                          ? "bg-slate-950 text-slate-400 border-slate-800"
                          : "bg-slate-200 text-slate-600 border-slate-300"
                      }`}
                    >
                      {wordWrap ? "ON" : "OFF"}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Direct Timestamp Button */}
          <button
            type="button"
            onClick={handleInsertTimestampInline}
            className="shrink-0 whitespace-nowrap px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 text-[11px] font-semibold flex items-center space-x-1"
            title="Insert timestamp tag into active line"
          >
            <Clock className="w-3 h-3 text-teal-400" />
            <span>Timestamp</span>
          </button>

          {/* Copy All Button */}
          <button
            type="button"
            onClick={handleCopyAll}
            className="shrink-0 whitespace-nowrap px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold flex items-center space-x-1"
            title="Copy entire document content"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-emerald-400" />
                <span>Copy All</span>
              </>
            )}
          </button>

          {/* Paste Clipboard Button */}
          <button
            type="button"
            onClick={handlePasteClipboard}
            className="shrink-0 whitespace-nowrap px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold flex items-center space-x-1"
            title="Paste text at cursor position"
          >
            <Clipboard className="w-3 h-3 text-teal-400" />
            <span>Paste</span>
          </button>

          {/* Word Wrap Toggle */}
          <button
            type="button"
            onClick={() => setWordWrap(!wordWrap)}
            className={`shrink-0 whitespace-nowrap px-2 py-1 rounded text-[11px] font-semibold flex items-center space-x-1 border transition-colors ${
              wordWrap
                ? "bg-emerald-600/30 text-emerald-300 border-emerald-500/50"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
            }`}
            title="Toggle word wrap mode"
          >
            {wordWrap ? <AlignLeft className="w-3 h-3 text-amber-400" /> : <Columns className="w-3 h-3 text-slate-400" />}
            <span>{wordWrap ? "Wrap On" : "Wrap Off"}</span>
          </button>
        </div>
      </div>

      {/* DUAL SCROLLBAR EDITOR CANVAS */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT SCROLLBAR: Slow Fine Precision Drag Track */}
        <div
          id="left-fine-scrollbar"
          className={`w-7 sm:w-9 shrink-0 border-r flex flex-col items-center justify-between py-1 select-none z-20 ${
            darkTheme ? "bg-slate-900/90 border-slate-800 text-slate-400" : "bg-slate-100/90 border-slate-300 text-slate-600"
          }`}
          title="Left Fine Precision Line Scrollbar"
        >
          <button
            onClick={() => scrollLines(-5)}
            className="p-1 hover:text-emerald-400 active:scale-95 transition-transform"
            title="Scroll Up 5 Lines"
          >
            <ChevronUp className="w-4 h-4 text-emerald-400" />
          </button>

          {/* Left Fine Drag Precision Track */}
          <div
            ref={leftTrackRef}
            className="flex-1 w-full flex flex-col items-center justify-center my-1 relative cursor-ns-resize touch-none"
            onPointerDown={handleLeftPointerDown}
            onPointerMove={handleLeftPointerMove}
            onPointerUp={handleLeftPointerUp}
            title="Drag vertically for slow fine precision line scrolling"
          >
            <div className="w-1.5 h-full bg-slate-800 rounded-full relative overflow-hidden border border-slate-700/50">
              <div
                className="absolute w-full bg-amber-400/90 rounded-full transition-all duration-75"
                style={{
                  top: `${scrollRatio * 80}%`,
                  height: "20%",
                }}
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
              <Sliders className="w-3 h-3 text-amber-400" />
            </div>
          </div>

          {/* Line +5 Step Button */}
          <button
            onClick={() => scrollLines(5)}
            className="p-1 hover:text-emerald-400 active:scale-95 transition-transform"
            title="Scroll Down 5 Lines"
          >
            <ChevronDown className="w-4 h-4 text-emerald-400" />
          </button>
        </div>

        {/* Center Virtualized Text Container */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          onPointerMove={handlePointerMoveCanvas}
          onPointerLeave={handlePointerLeaveCanvas}
          className={`flex-1 overflow-y-auto relative ${
            wordWrap ? "overflow-x-hidden" : "overflow-x-auto"
          } ${darkTheme ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900"}`}
        >
          {lines.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-mono text-xs italic">
              No content loaded. Open or create a file in the Android File Manager.
            </div>
          ) : !useVirtualization ? (
            /* NATURAL AUTO-HEIGHT CONTAINER FOR MESSAGES & NORMAL SIZE FILES */
            <div className={`flex flex-col relative ${wordWrap ? "w-full" : "min-w-full w-max"}`}>
              {lines.map((lineContent, actualIdx) => {
                const lineNum = actualIdx + 1;
                const isFocused =
                  focusedMatch?.lineNumber === lineNum ||
                  (activeLineIdx === actualIdx && focusedMatch !== null && focusedMatch.lineNumber === lineNum);
                const isActive = activeLineIdx === actualIdx;
                const isHovered = isFreeWritingMode && hoverCursor?.lineIdx === actualIdx;
                const cleanContent = lineContent ? lineContent.replace(/\r$/, "") : "";
                const isEmptyLine = cleanContent.trim() === "";
                const { timestampPrefix, editableText } = extractTimestampPrefix(cleanContent);

                if (viewMode === "vertical-messages") {
                  const parsed = getParsedMessage(actualIdx, cleanContent);
                  const remarkText = parseRemarkLine(parsed.text);
                  return (
                    <div
                      key={actualIdx}
                      data-line-idx={actualIdx}
                      onClick={(e) => {
                        const lineTextRect = e.currentTarget.getBoundingClientRect();
                        const leftGutter = showLineNumbers ? 44 : 12;
                        const relX = Math.max(0, e.clientX - lineTextRect.left - leftGutter);
                        const approxCharWidth = 7.5;
                        const targetCol = Math.min(cleanContent.length, Math.max(0, Math.floor(relX / approxCharWidth)));
                        handleSelectCursorLocation(actualIdx, targetCol);
                      }}
                      className={`flex items-start px-2 sm:px-3 py-1.5 text-xs transition-colors cursor-pointer box-border relative ${
                        wordWrap ? "w-full overflow-hidden" : "min-w-full w-max"
                      } ${
                        // A remark added during message-editing gets extra
                        // left indent plus its own accent border, on top of
                        // its "rem" badge — visually clearly outstanding
                        // from an ordinary user message, not just indented.
                        remarkText !== null ? "pl-8 sm:pl-10 border-l-2 border-fuchsia-500/60" : ""
                      } ${
                        isFocused
                          ? darkTheme
                            ? "bg-amber-500/30 text-amber-100 font-bold border-b border-amber-500/80 ring-2 ring-amber-400/90 shadow-lg animate-pulse"
                            : "bg-amber-300 text-amber-950 font-bold border-b border-amber-400 ring-2 ring-amber-500/90 shadow-lg animate-pulse"
                          : isActive
                          ? darkTheme
                            ? "bg-amber-950/60 text-amber-200 ring-1 ring-amber-500/60 border-b border-slate-800/30"
                            : "bg-amber-100 text-amber-950 ring-1 ring-amber-400 border-b border-amber-300"
                          : isHovered
                          ? darkTheme
                            ? "bg-amber-950/40 text-amber-200 ring-1 ring-amber-500/40 border-b border-slate-800/30"
                            : "bg-amber-50 text-amber-900 ring-1 ring-amber-300 border-b border-slate-300"
                          : darkTheme
                          ? "hover:bg-slate-900/40 border-b border-slate-800/30"
                          : "hover:bg-slate-200/60 border-b border-slate-200/80 bg-white/80"
                      }`}
                    >
                      {/* Line Number Badge */}
                      {showLineNumbers && (
                        <div
                          className={`w-8 sm:w-10 shrink-0 text-right pr-2 select-none font-mono text-[10px] border-r mr-2 pt-0.5 flex items-start justify-end ${
                            darkTheme ? "text-slate-500 border-slate-800/60" : "text-slate-400 border-slate-300"
                          }`}
                        >
                          #{lineNum}
                        </div>
                      )}

                      {/* Inline Text Input or Placeable Cursor Display */}
                      {isActive && isWritingBoxExpanded ? (
                        <div className="flex-1 flex flex-col gap-1">
                          {isFreeWritingMode || editingRemarkStartIdx !== null ? (
                            <div
                              className={`flex items-center space-x-1 font-mono text-xs px-2 py-1.5 rounded border shadow-md whitespace-pre-wrap break-all ${
                                editingRemarkStartIdx !== null
                                  ? "text-teal-200 bg-teal-950/80 border-teal-500/70"
                                  : "text-amber-200 bg-amber-950/80 border-amber-500/70"
                              }`}
                            >
                              <span
                                className={`font-semibold text-[10px] mr-1.5 select-none px-1.5 py-0.5 rounded border ${
                                  editingRemarkStartIdx !== null
                                    ? "text-teal-400 bg-teal-900/60 border-teal-700/60"
                                    : "text-amber-400 bg-amber-900/60 border-amber-700/60"
                                }`}
                              >
                                {editingRemarkStartIdx !== null ? "Remark " : ""}Cursor Line #{lineNum}, Col #{(activeColIdx || 0) + 1}
                              </span>
                              <span>{cleanContent.slice(0, activeColIdx || 0)}</span>
                              <span
                                className={`inline-block w-[3px] h-[16px] animate-pulse mx-[1px] align-middle shrink-0 border-r ${
                                  editingRemarkStartIdx !== null
                                    ? "bg-teal-400 shadow-[0_0_10px_#2dd4bf] border-teal-300"
                                    : "bg-amber-400 shadow-[0_0_10px_#f59e0b] border-amber-300"
                                }`}
                              />
                              <span>{cleanContent.slice(activeColIdx || 0)}</span>
                            </div>
                          ) : isEmptyLine ? (
                            <div className="flex items-center space-x-1.5 text-emerald-400 font-mono text-[10px] bg-emerald-950/90 px-2 py-0.5 rounded border border-emerald-500/60 animate-pulse shadow-sm">
                              <MousePointer className="w-3 h-3 text-emerald-300 shrink-0" />
                              <span className="font-bold">Placeable Cursor Active on Empty Line #{lineNum}</span>
                              <span className="text-emerald-200/80 hidden sm:inline">— Type remark below or press Send button</span>
                            </div>
                          ) : timestampPrefix ? (
                            <div className="flex items-center space-x-1.5 bg-slate-800/90 border border-teal-500/60 px-2 py-0.5 rounded shrink-0 select-none text-[11px] font-mono text-teal-300 shadow-sm w-fit">
                              <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                              <span className="font-bold text-teal-200">{timestampPrefix.trim()}</span>
                              <span className="text-[9px] font-sans text-amber-300/90 bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-800/60">
                                Protected Timestamp
                              </span>
                            </div>
                          ) : null}

                          {!isFreeWritingMode && editingRemarkStartIdx === null && (
                            <div className="flex items-center gap-1.5 w-full">
                              <span className="text-emerald-400 font-mono font-bold animate-pulse text-sm shrink-0">|</span>
                              <input
                                ref={(el) => {
                                  if (el && document.activeElement !== el) {
                                    el.focus({ preventScroll: true });
                                  }
                                }}
                                type="text"
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onBlur={() => handleLineSave(actualIdx)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleLineSave(actualIdx);
                                    setActiveLineIdx(null);
                                    setActiveColIdx(null);
                                  }
                                }}
                                placeholder={isEmptyLine ? "Type remark directly or use Send button below..." : "Type message text..."}
                                className="w-full h-[24px] bg-slate-900 text-emerald-300 font-mono text-xs px-2 rounded border border-emerald-500/80 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                              />
                            </div>
                          )}
                        </div>
                      ) : isEmptyLine ? (
                        <div className="flex-1 flex items-center justify-between group/empty cursor-pointer py-0.5 px-1.5 rounded hover:bg-amber-950/40 border border-dashed border-slate-800 hover:border-amber-500/50 transition-all">
                          <div className="flex items-center space-x-2">
                            <span className="w-1.5 h-3.5 bg-amber-500/50 group-hover/empty:bg-amber-400 rounded-sm animate-pulse" />
                            <span className="font-mono text-[11px] text-slate-500 group-hover/empty:text-amber-300 italic transition-colors">
                              [ Empty Line #{lineNum} — Click to place cursor & write ]
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-amber-400/0 group-hover/empty:text-amber-400 transition-opacity bg-amber-950 px-2 py-0.5 rounded border border-amber-800/80">
                            Place Cursor Here
                          </span>
                        </div>
                      ) : (
                        /* Continuous Vertical Text Flow: Timestamp + Sender + Formatted Text + Copy Button */
                        <div className={`flex-1 font-sans text-xs leading-relaxed select-text flex items-start justify-between gap-2 ${
                          wordWrap ? "min-w-0 max-w-full break-words break-all whitespace-pre-wrap overflow-x-auto" : "whitespace-pre pr-2"
                        }`}>
                          <div className={wordWrap ? "flex-1 min-w-0" : "flex-1 whitespace-pre"}>
                            {parsed.timestamp && (
                              <span
                                className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 border inline-flex items-center gap-1 align-baseline select-none shrink-0 ${
                                  isFocused
                                    ? "bg-amber-400 text-slate-950 border-amber-300 shadow-sm"
                                    : darkTheme
                                    ? "text-teal-400 bg-slate-900 border-slate-800"
                                    : "text-teal-900 bg-teal-100/90 border-teal-300 font-bold"
                                }`}
                              >
                                <Clock className={`w-2.5 h-2.5 inline ${isFocused ? "text-slate-950" : "text-teal-500"}`} />
                                {parsed.timestamp}
                              </span>
                            )}
                            {parsed.sender && (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-mono font-bold text-[10px] mr-1.5 select-none shrink-0 border ${
                                  isFocused
                                    ? "bg-amber-400 text-slate-950 border-amber-300 shadow-sm"
                                    : parsed.role === "user"
                                    ? darkTheme
                                      ? "bg-emerald-950/80 text-emerald-400 border-emerald-700/60"
                                      : "bg-emerald-100 text-emerald-900 border-emerald-300"
                                    : darkTheme
                                    ? "bg-teal-950/80 text-teal-300 border-teal-700/60"
                                    : "bg-teal-100 text-teal-950 border-teal-300"
                                }`}
                              >
                                {parsed.role === "user" ? (
                                  <User className="w-2.5 h-2.5 shrink-0" />
                                ) : (
                                  <Sparkles className="w-2.5 h-2.5 shrink-0" />
                                )}
                                <span>{parsed.sender}:</span>
                              </span>
                            )}
                            {remarkText !== null && (
                              <span
                                className={`inline-flex items-center px-1.5 py-0.2 rounded font-mono font-bold text-[9px] mr-1.5 select-none shrink-0 border uppercase tracking-wide ${
                                  darkTheme
                                    ? "bg-fuchsia-950/80 text-fuchsia-300 border-fuchsia-700/70"
                                    : "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300"
                                }`}
                                title="A remark added while editing a message — not the original message text"
                              >
                                rem
                              </span>
                            )}
                            <span
                              className={`${wordWrap ? "inline break-words break-all" : "inline whitespace-pre"} ${
                                isFocused
                                  ? "bg-amber-400/30 text-amber-950 dark:text-amber-100 font-semibold px-1 py-0.5 rounded border border-amber-400/60 shadow-sm"
                                  : darkTheme
                                  ? "text-slate-100"
                                  : "text-slate-900 font-medium"
                              }`}
                            >
                              {remarkText !== null
                                ? renderFormattedContent(remarkText, parsed.role, darkTheme, isFocused)
                                : renderFormattedContent(parsed.text, parsed.role, darkTheme, isFocused)}
                            </span>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => toggleMultiCopySelection(e, actualIdx)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold flex items-center transition-all select-none border ${
                                  multiCopySelection.has(actualIdx)
                                    ? "bg-indigo-600 text-white border-indigo-400 shadow-sm"
                                    : darkTheme
                                    ? "bg-slate-800/80 hover:bg-slate-700 text-slate-400 border-slate-700 hover:text-white"
                                    : "bg-slate-200 hover:bg-slate-300 text-slate-600 border-slate-300 hover:text-slate-950"
                                }`}
                                title={multiCopySelection.has(actualIdx) ? "Deselect from multi-copy" : "Select for multi-copy"}
                              >
                                {multiCopySelection.has(actualIdx) ? (
                                  <Check className="w-3 h-3 shrink-0" />
                                ) : (
                                  <span className="w-3 h-3 rounded-sm border border-current shrink-0" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={(e) => handleCopySingleLine(e, cleanContent, actualIdx)}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold flex items-center space-x-1 transition-all select-none ${
                                  copiedLineIdx === actualIdx
                                    ? darkTheme
                                      ? "bg-emerald-900/90 text-emerald-300 border border-emerald-500/80 shadow-sm"
                                      : "bg-emerald-100 text-emerald-900 border border-emerald-400 font-bold shadow-sm"
                                    : darkTheme
                                    ? "bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-white"
                                    : "bg-slate-200 hover:bg-slate-300 text-slate-800 border border-slate-300 hover:text-slate-950"
                                }`}
                                title="Copy just this one line"
                              >
                                {copiedLineIdx === actualIdx ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                    <span>Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Copy Full sits on its own row below Select/Copy, with its
                                label stacked vertically ("Copy" over "Full") instead of
                                side-by-side, so the whole action cluster stays narrow and
                                the message text next to it has room to stay readable
                                instead of being squeezed. */}
                            {parsed.timestamp && (
                              <button
                                type="button"
                                onClick={(e) => handleCopyFullMessage(e, actualIdx)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold flex flex-col items-center leading-tight transition-all select-none border ${
                                  copiedFullMessageIdx === actualIdx
                                    ? darkTheme
                                      ? "bg-emerald-900/90 text-emerald-300 border-emerald-500/80 shadow-sm"
                                      : "bg-emerald-100 text-emerald-900 border-emerald-400 font-bold shadow-sm"
                                    : darkTheme
                                    ? "bg-teal-950/80 hover:bg-teal-900 text-teal-300 border-teal-700/80"
                                    : "bg-teal-100 hover:bg-teal-200 text-teal-900 border-teal-300"
                                }`}
                                title="Copy this entire message — timestamp, name, and every one of its lines — in one click, no need to copy each line separately"
                              >
                                {copiedFullMessageIdx === actualIdx ? (
                                  <>
                                    <Check className="w-3 h-3 shrink-0" />
                                    <span>Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Clipboard className="w-3 h-3 shrink-0" />
                                    <span>Copy</span>
                                    <span>Full</span>
                                  </>
                                )}
                              </button>
                            )}

                            {/* Edit sits directly below Copy Full — thin and
                                compact rather than a third button crowding the
                                Select/Copy row above — so the action cluster
                                stays narrow and the message text keeps as much
                                width as possible for vertical reading. */}
                            {parsed.timestamp && isMessageEditable(parsed.timestamp) && (
                              <button
                                type="button"
                                onClick={(e) => handleEditRecentMessage(e, actualIdx)}
                                className={`px-1.5 py-[1px] rounded text-[9px] font-mono font-semibold flex items-center justify-center space-x-1 leading-none transition-all select-none border ${
                                  darkTheme
                                    ? "bg-amber-950/80 hover:bg-amber-900 text-amber-300 border-amber-700/80"
                                    : "bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300"
                                }`}
                                title="Edit this message (available for 15 minutes after sending)"
                              >
                                <PenTool className="w-2.5 h-2.5 shrink-0" />
                                <span>Edit</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // Raw Code / Line Mode
                return (
                  <div
                    key={actualIdx}
                    data-line-idx={actualIdx}
                    onClick={(e) => {
                      const lineTextRect = e.currentTarget.getBoundingClientRect();
                      const leftGutter = showLineNumbers ? 56 : 12;
                      const relX = Math.max(0, e.clientX - lineTextRect.left - leftGutter);
                      const approxCharWidth = 7.5;
                      const targetCol = Math.min(cleanContent.length, Math.max(0, Math.floor(relX / approxCharWidth)));
                      handleSelectCursorLocation(actualIdx, targetCol);
                    }}
                    style={{
                      height: `${LINE_HEIGHT}px`,
                      lineHeight: `${LINE_HEIGHT}px`,
                    }}
                    className={`flex items-center px-1.5 sm:px-2 text-xs transition-colors cursor-pointer border-b border-transparent h-[24px] box-border ${
                      wordWrap ? "overflow-hidden w-full" : "min-w-full w-max"
                    } ${
                      isFocused
                        ? "bg-amber-500/30 border-amber-500/50 text-amber-200 font-bold"
                        : isActive
                        ? "bg-amber-950/60 text-amber-200 ring-1 ring-amber-500/60"
                        : isHovered
                        ? "bg-amber-950/40 text-amber-200 ring-1 ring-amber-500/40"
                        : "hover:bg-slate-900/40"
                    }`}
                  >
                    {showLineNumbers && (
                      <div className="w-10 sm:w-14 shrink-0 text-right pr-1.5 sm:pr-2.5 select-none text-slate-500 font-mono text-[10px] sm:text-[11px] border-r border-slate-800/80 mr-1.5 sm:mr-2 h-[24px] leading-[24px] flex items-center justify-end overflow-hidden">
                        {lineNum}
                      </div>
                    )}

                    {isActive && isWritingBoxExpanded ? (
                      <div className="flex-1 flex items-center gap-1.5 overflow-hidden font-mono text-xs h-[24px]">
                        {isFreeWritingMode ? (
                          <div className="flex items-center overflow-x-auto whitespace-pre font-mono text-xs w-full text-amber-200 bg-amber-950/70 px-1.5 py-0.5 rounded border border-amber-500/60">
                            <span>{cleanContent.slice(0, activeColIdx || 0)}</span>
                            <span className="inline-block w-[3px] h-[15px] bg-amber-400 animate-pulse mx-[0.5px] align-middle shadow-[0_0_8px_#f59e0b] border-r border-amber-300 shrink-0" />
                            <span>{cleanContent.slice(activeColIdx || 0)}</span>
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center gap-1.5 overflow-hidden">
                            <span className="text-emerald-400 font-mono font-bold animate-pulse text-xs shrink-0">|</span>
                            {timestampPrefix && (
                              <div className="flex items-center space-x-1 bg-slate-800 border border-teal-500/60 px-1.5 py-0.5 rounded shrink-0 select-none text-[10px] font-mono text-teal-300">
                                <Lock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                                <span className="font-semibold">{timestampPrefix.trim()}</span>
                              </div>
                            )}
                            <input
                              ref={(el) => {
                                if (el && document.activeElement !== el) {
                                  el.focus({ preventScroll: true });
                                }
                              }}
                              type="text"
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onBlur={() => handleLineSave(actualIdx)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleLineSave(actualIdx);
                                  setActiveLineIdx(null);
                                  setActiveColIdx(null);
                                }
                              }}
                              placeholder="Type line content..."
                              className="w-full h-[22px] bg-slate-900 text-emerald-300 font-mono text-xs px-2 rounded border border-emerald-500/80 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                            />
                          </div>
                        )}
                      </div>
                    ) : isEmptyLine ? (
                      <div className="flex-1 font-mono text-xs h-[24px] leading-[24px] flex items-center overflow-hidden">
                        <span className="opacity-40 hover:opacity-100 italic text-[11px] truncate">
                          | &lt;empty line #{lineNum} - click to place cursor&gt;
                        </span>
                      </div>
                    ) : (
                      <div
                        className={`flex-1 font-mono text-xs h-[24px] leading-[24px] flex items-center justify-between gap-2 ${
                          wordWrap ? "overflow-hidden truncate whitespace-nowrap break-all" : "whitespace-pre pr-2"
                        }`}
                      >
                        <span className={wordWrap ? "truncate flex-1" : "whitespace-pre"}>{cleanContent}</span>
                        <button
                          type="button"
                          onClick={(e) => handleCopySingleLine(e, cleanContent, actualIdx)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center space-x-1 transition-all shrink-0 select-none ${
                            copiedLineIdx === actualIdx
                              ? "bg-emerald-900/90 text-emerald-300 border border-emerald-500/80"
                              : "bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700"
                          }`}
                          title="Copy this line"
                        >
                          {copiedLineIdx === actualIdx ? (
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                          ) : (
                            <Copy className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Dynamic Bottom Spacer for Floating Bottom Bar */}
              <div style={{ height: `${curBBarHeight + 20}px` }} className="w-full shrink-0 pointer-events-none" />
            </div>
          ) : (
            <div
              style={{ height: `${totalHeight}px`, position: "relative" }}
              onClick={(e) => {
                if (e.target === e.currentTarget && containerRef.current) {
                  const rect = containerRef.current.getBoundingClientRect();
                  const relY = e.clientY - rect.top + containerRef.current.scrollTop;
                  const targetLineIdx = Math.max(0, Math.min(lines.length - 1, Math.floor(relY / currentLineHeight)));
                  handleSelectCursorLocation(targetLineIdx, 0);
                }
              }}
            >
              <div
                style={{
                  position: "absolute",
                  // Positioned via `top`, not `transform: translateY(...)`. Large
                  // documents push this offset into the millions of pixels, and a
                  // GPU-composited transform at that scale loses precision on
                  // weaker/older GPU drivers (common on budget/rugged Android
                  // devices) — the rendered lines can flicker or vanish entirely
                  // mid-scroll. `top` goes through normal layout instead, which
                  // doesn't hit that ceiling, at the cost of not being a
                  // GPU-composited layer (irrelevant here since this only moves
                  // on scroll/state changes, never a continuous animation).
                  top: `${offsetY}px`,
                  left: 0,
                  minWidth: "100%",
                  width: wordWrap ? "100%" : "max-content",
                }}
              >
                {visibleLines.map((lineContent, idx) => {
                  const actualIdx = startIndex + idx;
                  const lineNum = actualIdx + 1;
                  const isFocused =
                    focusedMatch?.lineNumber === lineNum ||
                    (activeLineIdx === actualIdx && focusedMatch !== null && focusedMatch.lineNumber === lineNum);
                  const isActive = activeLineIdx === actualIdx;
                  const isHovered = isFreeWritingMode && hoverCursor?.lineIdx === actualIdx;
                  const cleanContent = lineContent ? lineContent.replace(/\r$/, "") : "";
                  const isEmptyLine = cleanContent.trim() === "";
                  const { timestampPrefix, editableText } = extractTimestampPrefix(cleanContent);

                  if (viewMode === "vertical-messages") {
                    const parsed = getParsedMessage(actualIdx, cleanContent);
                    const remarkText = parseRemarkLine(parsed.text);
                    return (
                      <div
                        key={actualIdx}
                        data-line-idx={actualIdx}
                        onClick={(e) => {
                          const lineTextRect = e.currentTarget.getBoundingClientRect();
                          const leftGutter = showLineNumbers ? 44 : 12;
                          const relX = Math.max(0, e.clientX - lineTextRect.left - leftGutter);
                          const approxCharWidth = 7.5;
                          const targetCol = Math.min(cleanContent.length, Math.max(0, Math.floor(relX / approxCharWidth)));
                          handleSelectCursorLocation(actualIdx, targetCol);
                        }}
                        style={{
                          minHeight: `${currentLineHeight}px`,
                        }}
                        className={`flex items-start px-2 sm:px-3 py-1 text-xs transition-colors cursor-pointer box-border relative ${
                          wordWrap ? "w-full overflow-hidden" : "min-w-full w-max"
                        } ${
                          // A remark added during message-editing gets extra
                          // left indent plus its own accent border, on top of
                          // its "rem" badge — visually clearly outstanding
                          // from an ordinary user message, not just indented.
                          remarkText !== null ? "pl-8 sm:pl-10 border-l-2 border-fuchsia-500/60" : ""
                        } ${
                          isFocused
                            ? darkTheme
                              ? "bg-amber-500/30 text-amber-100 font-bold border-b border-amber-500/80 ring-2 ring-amber-400/90 shadow-lg animate-pulse"
                              : "bg-amber-300 text-amber-950 font-bold border-b border-amber-400 ring-2 ring-amber-500/90 shadow-lg animate-pulse"
                            : isActive
                            ? darkTheme
                              ? "bg-amber-950/60 text-amber-200 ring-1 ring-amber-500/60 border-b border-slate-800/30"
                              : "bg-amber-100 text-amber-950 ring-1 ring-amber-400 border-b border-amber-300"
                            : isHovered
                            ? darkTheme
                              ? "bg-amber-950/40 text-amber-200 ring-1 ring-amber-500/40 border-b border-slate-800/30"
                              : "bg-amber-50 text-amber-900 ring-1 ring-amber-300 border-b border-slate-300"
                            : darkTheme
                            ? "hover:bg-slate-900/40 border-b border-slate-800/30"
                            : "hover:bg-slate-200/60 border-b border-slate-200/80 bg-white/80"
                        }`}
                      >
                        {/* Line Number Badge */}
                        {showLineNumbers && (
                          <div className="w-8 sm:w-10 shrink-0 text-right pr-2 select-none text-slate-500 font-mono text-[10px] border-r border-slate-800/60 mr-2 pt-0.5 flex items-start justify-end">
                            #{lineNum}
                          </div>
                        )}

                        {/* Inline Text Input or Placeable Cursor Display */}
                        {isActive && isWritingBoxExpanded ? (
                          <div className="flex-1 flex flex-col gap-1">
                            {isFreeWritingMode || editingRemarkStartIdx !== null ? (
                              <div
                                className={`flex items-center space-x-1 font-mono text-xs px-2 py-1.5 rounded border shadow-md whitespace-pre-wrap break-all ${
                                  editingRemarkStartIdx !== null
                                    ? "text-teal-200 bg-teal-950/80 border-teal-500/70"
                                    : "text-amber-200 bg-amber-950/80 border-amber-500/70"
                                }`}
                              >
                                <span
                                  className={`font-semibold text-[10px] mr-1.5 select-none px-1.5 py-0.5 rounded border ${
                                    editingRemarkStartIdx !== null
                                      ? "text-teal-400 bg-teal-900/60 border-teal-700/60"
                                      : "text-amber-400 bg-amber-900/60 border-amber-700/60"
                                  }`}
                                >
                                  {editingRemarkStartIdx !== null ? "Remark " : ""}Cursor Line #{lineNum}, Col #{(activeColIdx || 0) + 1}
                                </span>
                                <span>{cleanContent.slice(0, activeColIdx || 0)}</span>
                                <span
                                  className={`inline-block w-[3px] h-[16px] animate-pulse mx-[1px] align-middle shrink-0 border-r ${
                                    editingRemarkStartIdx !== null
                                      ? "bg-teal-400 shadow-[0_0_10px_#2dd4bf] border-teal-300"
                                      : "bg-amber-400 shadow-[0_0_10px_#f59e0b] border-amber-300"
                                  }`}
                                />
                                <span>{cleanContent.slice(activeColIdx || 0)}</span>
                              </div>
                            ) : isEmptyLine ? (
                              <div className="flex items-center space-x-1.5 text-emerald-400 font-mono text-[10px] bg-emerald-950/90 px-2 py-0.5 rounded border border-emerald-500/60 animate-pulse shadow-sm">
                                <MousePointer className="w-3 h-3 text-emerald-300 shrink-0" />
                                <span className="font-bold">Placeable Cursor Active on Empty Line #{lineNum}</span>
                                <span className="text-emerald-200/80 hidden sm:inline">— Type remark below or press Send button</span>
                              </div>
                            ) : timestampPrefix ? (
                              <div className="flex items-center space-x-1.5 bg-slate-800/90 border border-teal-500/60 px-2 py-0.5 rounded shrink-0 select-none text-[11px] font-mono text-teal-300 shadow-sm w-fit">
                                <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                                <span className="font-bold text-teal-200">{timestampPrefix.trim()}</span>
                                <span className="text-[9px] font-sans text-amber-300/90 bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-800/60">
                                  Protected Timestamp
                                </span>
                              </div>
                            ) : null}

                            {!isFreeWritingMode && editingRemarkStartIdx === null && (
                              <div className="flex items-center gap-1.5 w-full">
                                <span className="text-emerald-400 font-mono font-bold animate-pulse text-sm shrink-0">|</span>
                                <input
                                  ref={(el) => {
                                    if (el && document.activeElement !== el) {
                                      el.focus({ preventScroll: true });
                                    }
                                  }}
                                  type="text"
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  onBlur={() => handleLineSave(actualIdx)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleLineSave(actualIdx);
                                      setActiveLineIdx(null);
                                      setActiveColIdx(null);
                                    }
                                  }}
                                  placeholder={isEmptyLine ? "Type remark directly or use Send button below..." : "Type message text..."}
                                  className="w-full h-[24px] bg-slate-900 text-emerald-300 font-mono text-xs px-2 rounded border border-emerald-500/80 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                />
                              </div>
                            )}
                          </div>
                        ) : isEmptyLine ? (
                          <div className="flex-1 flex items-center justify-between group/empty cursor-pointer py-0.5 px-1.5 rounded hover:bg-amber-950/40 border border-dashed border-slate-800 hover:border-amber-500/50 transition-all">
                            <div className="flex items-center space-x-2">
                              <span className="w-1.5 h-3.5 bg-amber-500/50 group-hover/empty:bg-amber-400 rounded-sm animate-pulse" />
                              <span className="font-mono text-[11px] text-slate-500 group-hover/empty:text-amber-300 italic transition-colors">
                                [ Empty Line #{lineNum} — Click to place cursor & write ]
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-amber-400/0 group-hover/empty:text-amber-400 transition-opacity bg-amber-950 px-2 py-0.5 rounded border border-amber-800/80">
                              Place Cursor Here
                            </span>
                          </div>
                        ) : (
                          /* Continuous Vertical Text Flow: Timestamp + Sender + Formatted Text + Copy Button */
                          <div className={`flex-1 font-sans text-xs leading-relaxed select-text flex items-start justify-between gap-2 ${
                            wordWrap ? "min-w-0 max-w-full break-words break-all whitespace-pre-wrap overflow-x-auto" : "whitespace-pre pr-2"
                          }`}>
                            <div className={wordWrap ? "flex-1 min-w-0" : "flex-1 whitespace-pre"}>
                              {parsed.timestamp && (
                                <span
                                  className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 border inline-flex items-center gap-1 align-baseline select-none shrink-0 ${
                                    isFocused
                                      ? "bg-amber-400 text-slate-950 border-amber-300 shadow-sm"
                                      : darkTheme
                                      ? "text-teal-400 bg-slate-900 border-slate-800"
                                      : "text-teal-900 bg-teal-100/90 border-teal-300 font-bold"
                                  }`}
                                >
                                  <Clock className={`w-2.5 h-2.5 inline ${isFocused ? "text-slate-950" : "text-teal-500"}`} />
                                  {parsed.timestamp}
                                </span>
                              )}
                              {parsed.sender && (
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-mono font-bold text-[10px] mr-1.5 select-none shrink-0 border ${
                                    isFocused
                                      ? "bg-amber-400 text-slate-950 border-amber-300 shadow-sm"
                                      : parsed.role === "user"
                                      ? darkTheme
                                        ? "bg-emerald-950/80 text-emerald-400 border-emerald-700/60"
                                        : "bg-emerald-100 text-emerald-900 border-emerald-300"
                                      : darkTheme
                                      ? "bg-teal-950/80 text-teal-300 border-teal-700/60"
                                      : "bg-teal-100 text-teal-950 border-teal-300"
                                  }`}
                                >
                                  {parsed.role === "user" ? (
                                    <User className="w-2.5 h-2.5 shrink-0" />
                                  ) : (
                                    <Sparkles className="w-2.5 h-2.5 shrink-0" />
                                  )}
                                  <span>{parsed.sender}:</span>
                                </span>
                              )}
                              {remarkText !== null && (
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.2 rounded font-mono font-bold text-[9px] mr-1.5 select-none shrink-0 border uppercase tracking-wide ${
                                    darkTheme
                                      ? "bg-fuchsia-950/80 text-fuchsia-300 border-fuchsia-700/70"
                                      : "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300"
                                  }`}
                                  title="A remark added while editing a message — not the original message text"
                                >
                                  rem
                                </span>
                              )}
                              <span
                                className={`${wordWrap ? "inline break-words break-all" : "inline whitespace-pre"} ${
                                  isFocused
                                    ? "bg-amber-400/30 text-amber-950 dark:text-amber-100 font-semibold px-1 py-0.5 rounded border border-amber-400/60 shadow-sm"
                                    : darkTheme
                                    ? "text-slate-100"
                                    : "text-slate-900 font-medium"
                                }`}
                              >
                                {remarkText !== null
                                  ? renderFormattedContent(remarkText, parsed.role, darkTheme, isFocused)
                                  : renderFormattedContent(parsed.text, parsed.role, darkTheme, isFocused)}
                              </span>
                            </div>

                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => toggleMultiCopySelection(e, actualIdx)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold flex items-center transition-all select-none border ${
                                    multiCopySelection.has(actualIdx)
                                      ? "bg-indigo-600 text-white border-indigo-400 shadow-sm"
                                      : darkTheme
                                      ? "bg-slate-800/80 hover:bg-slate-700 text-slate-400 border-slate-700 hover:text-white"
                                      : "bg-slate-200 hover:bg-slate-300 text-slate-600 border-slate-300 hover:text-slate-950"
                                  }`}
                                  title={multiCopySelection.has(actualIdx) ? "Deselect from multi-copy" : "Select for multi-copy"}
                                >
                                  {multiCopySelection.has(actualIdx) ? (
                                    <Check className="w-3 h-3 shrink-0" />
                                  ) : (
                                    <span className="w-3 h-3 rounded-sm border border-current shrink-0" />
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => handleCopySingleLine(e, cleanContent, actualIdx)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium flex items-center space-x-1 transition-all select-none ${
                                    copiedLineIdx === actualIdx
                                      ? "bg-emerald-900/90 text-emerald-300 border border-emerald-500/80 shadow-sm"
                                      : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-white"
                                  }`}
                                  title="Copy just this one line"
                                >
                                  {copiedLineIdx === actualIdx ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                      <span>Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              </div>

                              {parsed.timestamp && (
                                <button
                                  type="button"
                                  onClick={(e) => handleCopyFullMessage(e, actualIdx)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold flex flex-col items-center leading-tight transition-all select-none border ${
                                    copiedFullMessageIdx === actualIdx
                                      ? "bg-emerald-900/90 text-emerald-300 border-emerald-500/80 shadow-sm"
                                      : "bg-teal-950/80 hover:bg-teal-900 text-teal-300 border-teal-700/80"
                                  }`}
                                  title="Copy this entire message — timestamp, name, and every one of its lines — in one click, no need to copy each line separately"
                                >
                                  {copiedFullMessageIdx === actualIdx ? (
                                    <>
                                      <Check className="w-3 h-3 shrink-0" />
                                      <span>Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Clipboard className="w-3 h-3 shrink-0" />
                                      <span>Copy</span>
                                      <span>Full</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {/* Edit sits directly below Copy Full — thin and
                                  compact rather than a third button crowding
                                  the Select/Copy row above — so the action
                                  cluster stays narrow and the message text
                                  keeps as much width as possible for vertical
                                  reading. */}
                              {parsed.timestamp && isMessageEditable(parsed.timestamp) && (
                                <button
                                  type="button"
                                  onClick={(e) => handleEditRecentMessage(e, actualIdx)}
                                  className="px-1.5 py-[1px] rounded text-[9px] font-mono font-semibold flex items-center justify-center space-x-1 leading-none transition-all select-none border bg-amber-950/80 hover:bg-amber-900 text-amber-300 border-amber-700/80"
                                  title="Edit this message (available for 15 minutes after sending)"
                                >
                                  <PenTool className="w-2.5 h-2.5 shrink-0" />
                                  <span>Edit</span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Raw Code / Line Mode
                  return (
                    <div
                      key={actualIdx}
                      data-line-idx={actualIdx}
                      onClick={(e) => {
                        const lineTextRect = e.currentTarget.getBoundingClientRect();
                        const leftGutter = showLineNumbers ? 56 : 12;
                        const relX = Math.max(0, e.clientX - lineTextRect.left - leftGutter);
                        const approxCharWidth = 7.5;
                        const targetCol = Math.min(cleanContent.length, Math.max(0, Math.floor(relX / approxCharWidth)));
                        handleSelectCursorLocation(actualIdx, targetCol);
                      }}
                      style={{
                        height: `${LINE_HEIGHT}px`,
                        lineHeight: `${LINE_HEIGHT}px`,
                      }}
                      className={`flex items-center px-1.5 sm:px-2 text-xs transition-colors cursor-pointer border-b border-transparent h-[24px] box-border ${
                        wordWrap ? "overflow-hidden w-full" : "min-w-full w-max"
                      } ${
                        isFocused
                          ? "bg-amber-500/30 border-amber-500/50 text-amber-200 font-bold"
                          : isActive
                          ? "bg-amber-950/60 text-amber-200 ring-1 ring-amber-500/60"
                          : isHovered
                          ? "bg-amber-950/40 text-amber-200 ring-1 ring-amber-500/40"
                          : "hover:bg-slate-900/40"
                      }`}
                    >
                      {/* Always Visible Continuous Line Numbers Column */}
                      {showLineNumbers && (
                        <div className="w-10 sm:w-14 shrink-0 text-right pr-1.5 sm:pr-2.5 select-none text-slate-500 font-mono text-[10px] sm:text-[11px] border-r border-slate-800/80 mr-1.5 sm:mr-2 h-[24px] leading-[24px] flex items-center justify-end overflow-hidden">
                          {lineNum}
                        </div>
                      )}

                      {/* Line Content Display or Editable Line Input with Placed Cursor Caret */}
                      {isActive && isWritingBoxExpanded ? (
                        <div className="flex-1 flex items-center gap-1.5 overflow-hidden font-mono text-xs h-[24px]">
                          {isFreeWritingMode ? (
                            <div className="flex items-center overflow-x-auto whitespace-pre font-mono text-xs w-full text-amber-200 bg-amber-950/70 px-1.5 py-0.5 rounded border border-amber-500/60">
                              <span>{cleanContent.slice(0, activeColIdx || 0)}</span>
                              <span className="inline-block w-[3px] h-[15px] bg-amber-400 animate-pulse mx-[0.5px] align-middle shadow-[0_0_8px_#f59e0b] border-r border-amber-300 shrink-0" />
                              <span>{cleanContent.slice(activeColIdx || 0)}</span>
                            </div>
                          ) : (
                            <div className="flex-1 flex items-center gap-1.5 overflow-hidden">
                              <span className="text-emerald-400 font-mono font-bold animate-pulse text-xs shrink-0">|</span>
                              {timestampPrefix && (
                                <div className="flex items-center space-x-1 bg-slate-800 border border-teal-500/60 px-1.5 py-0.5 rounded shrink-0 select-none text-[10px] font-mono text-teal-300">
                                  <Lock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                                  <span className="font-semibold">{timestampPrefix.trim()}</span>
                                </div>
                              )}
                              <input
                                ref={(el) => {
                                  if (el && document.activeElement !== el) {
                                    el.focus({ preventScroll: true });
                                  }
                                }}
                                type="text"
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onBlur={() => handleLineSave(actualIdx)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleLineSave(actualIdx);
                                    setActiveLineIdx(null);
                                    setActiveColIdx(null);
                                  }
                                }}
                                className="w-full h-[20px] leading-[20px] bg-slate-900 text-emerald-300 font-mono text-xs px-1 rounded border border-emerald-500/50 focus:outline-none whitespace-nowrap overflow-x-auto"
                              />
                            </div>
                          )}
                        </div>
                      ) : isEmptyLine ? (
                        <div className="flex-1 font-mono text-xs h-[24px] leading-[24px] flex items-center overflow-hidden text-slate-500 hover:text-amber-400 transition-colors">
                          <span className="w-1 h-3 bg-slate-600 hover:bg-amber-400 rounded-sm inline-block mr-2 animate-pulse shrink-0" />
                          <span className="opacity-40 hover:opacity-100 italic text-[11px] truncate">
                            | &lt;empty line #{lineNum} - click to place cursor&gt;
                          </span>
                        </div>
                      ) : (
                        <div
                          className={`flex-1 font-mono text-xs h-[24px] leading-[24px] flex items-center justify-between gap-2 ${
                            wordWrap ? "overflow-hidden truncate whitespace-nowrap break-all" : "whitespace-pre pr-2"
                          }`}
                        >
                          <span className={wordWrap ? "truncate flex-1" : "whitespace-pre"}>{cleanContent}</span>
                          <button
                            type="button"
                            onClick={(e) => handleCopySingleLine(e, cleanContent, actualIdx)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center space-x-1 transition-all shrink-0 select-none ${
                              copiedLineIdx === actualIdx
                                ? "bg-emerald-900/90 text-emerald-300 border border-emerald-500/80"
                                : "bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700"
                            }`}
                            title="Copy this line"
                          >
                            {copiedLineIdx === actualIdx ? (
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-400 shrink-0" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT SCROLLBAR: Coarse Instant Fast Document Scrollbar */}
        <div
          id="right-fast-scrollbar"
          className={`w-7 sm:w-9 shrink-0 border-l flex flex-col items-center justify-between py-1 select-none z-20 ${
            darkTheme ? "bg-slate-900/90 border-slate-800 text-slate-400" : "bg-slate-100/90 border-slate-300 text-slate-600"
          }`}
          title="Right Coarse Fast Document Scrollbar"
        >
          <button
            onClick={jumpTop}
            className="p-1 hover:text-emerald-400 active:scale-95 transition-transform"
            title="Jump to Top (Line 1)"
          >
            <ArrowUp className="w-4 h-4 text-emerald-400" />
          </button>

          {/* Right Fast Drag Track */}
          <div
            ref={rightTrackRef}
            className="flex-1 w-full flex flex-col items-center justify-center my-1 relative cursor-pointer touch-none"
            onPointerDown={handleRightPointerDown}
            onPointerMove={handleRightPointerMove}
            onPointerUp={handleRightPointerUp}
            title="Touch or drag anywhere on right scrollbar to scroll instantly"
          >
            <div className="w-2 h-full bg-slate-800 rounded-full relative overflow-hidden border border-slate-700/50">
              <div
                className="absolute w-full bg-emerald-500 rounded-full transition-all duration-75 shadow-md"
                style={{
                  top: `${scrollRatio * 85}%`,
                  height: "15%",
                }}
              />
            </div>
          </div>

          <button
            onClick={jumpBottom}
            className="p-1 hover:text-emerald-400 active:scale-95 transition-transform"
            title="Jump to Bottom"
          >
            <ArrowDown className="w-4 h-4 text-emerald-400" />
          </button>
        </div>
      </div>

      {/* FLOATING FREE WRITING FINGER HOVER INDICATOR */}
      {isFreeWritingMode && hoverCursor && (
        <div
          className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full mb-3 bg-amber-950/95 text-amber-200 border border-amber-500/90 px-3 py-1.5 rounded-lg text-[11px] font-mono shadow-2xl backdrop-blur-md flex items-center space-x-2 animate-pulse"
          style={{
            left: `${hoverCursor.clientX}px`,
            top: `${hoverCursor.clientY - 8}px`,
          }}
        >
          <Pointer className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-white">
              Free Cursor: Line #{hoverCursor.lineIdx + 1}, Col #{hoverCursor.colIdx + 1}
            </span>
            <span className="text-[10px] text-amber-300/90">
              Tap finger to set cursor & write plain text here
            </span>
          </div>
        </div>
      )}

      {/* FLOATING MULTI-MESSAGE COPY BAR — appears once one or more text
          messages are marked with their "Select" toggle, letting all of
          them be copied together as one clipboard write in document order. */}
      {multiCopySelection.size > 0 && (
        <div className="fixed bottom-6 left-6 z-40 flex items-center gap-2 px-3 py-2 rounded-lg shadow-2xl border bg-indigo-950/95 border-indigo-500/70 backdrop-blur-md text-xs font-mono">
          <span className="text-indigo-200 font-semibold whitespace-nowrap">
            {multiCopySelection.size} message{multiCopySelection.size === 1 ? "" : "s"} selected
          </span>
          <button
            type="button"
            onClick={handleCopyMultiSelected}
            className={`px-2.5 py-1 rounded-md font-semibold flex items-center space-x-1.5 transition-all shrink-0 ${
              multiCopyDone
                ? "bg-emerald-700 text-emerald-100 border border-emerald-400"
                : "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400"
            }`}
            title="Copy all selected messages, in order, as one clipboard write"
          >
            {multiCopyDone ? (
              <>
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 shrink-0" />
                <span>Copy Selected</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={clearMultiCopySelection}
            className="p-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors shrink-0"
            title="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* FLOATING BOTTOM TEXT WRITING BOX (MINIATURE BY DEFAULT FOR FULL READING VISIBILITY) */}
      {!isWritingBoxExpanded ? (
        <div
          ref={bottomBarRef}
          onClick={expandWritingBox}
          className="absolute bottom-0 left-0 right-0 z-30 shadow-2xl cursor-pointer select-none transition-all duration-200"
        >
          <div
            className={`px-3 py-2 border-t flex items-center justify-between gap-2 backdrop-blur-md ${
              darkTheme
                ? "bg-slate-950/95 border-slate-800 text-slate-200 hover:bg-slate-900"
                : "bg-slate-50/95 border-slate-300 text-slate-800 hover:bg-slate-100"
            }`}
          >
            <div className="flex items-center space-x-2 truncate flex-1">
              <MessageSquarePlus className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
              <div className="flex items-center space-x-1.5 truncate text-xs font-mono">
                <span className="font-bold text-emerald-400 truncate">
                  [{userName}]:
                </span>
                <span className="text-slate-400 truncate italic">
                  {chatInput ? chatInput : "Touch text writing box to expand & write..."}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateNewLineAtBottom();
                  expandWritingBox();
                }}
                className="px-2.5 py-1 rounded bg-teal-950/90 hover:bg-teal-900 text-teal-300 border border-teal-500/70 text-[11px] font-bold flex items-center space-x-1 transition-all shadow-sm active:scale-95"
                title="Create new line at bottom and start writing"
              >
                <PlusCircle className="w-3.5 h-3.5 text-teal-400" />
                <span className="hidden sm:inline">+ New Line</span>
              </button>

              <div
                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center space-x-1 shadow-sm transition-all"
                title="Touch to expand text writing box"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Touch to Write</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={bottomBarRef}
          className="absolute left-0 right-0 z-30 shadow-2xl transition-all duration-200"
          style={{ bottom: keyboardInset }}
        >
          {/* Expanded Top Header Handle Bar with Android Back Key Control */}
          <div
            className={`px-3 py-1.5 border-t border-b flex items-center justify-between gap-2 text-xs font-mono select-none backdrop-blur-md ${
              darkTheme ? "bg-slate-900/95 border-slate-800 text-slate-200" : "bg-slate-100/95 border-slate-300 text-slate-800"
            }`}
          >
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  collapseWritingBox();
                  if (window.history.state?.textWritingBoxOpen) {
                    try { window.history.back(); } catch (_) {}
                  }
                }}
                className="px-2.5 py-1 rounded-md bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/60 font-semibold text-[11px] flex items-center space-x-1 transition-all shadow-sm active:scale-95"
                title="Press Android Back key or tap here to close writing box and return to reading flow"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
                <span>Android Back / Close</span>
              </button>
              <span className="text-[10px] text-slate-400 hidden md:inline">
                (Press Android menu back key or Esc to close writing window)
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-emerald-400 font-bold truncate hidden sm:inline">
                [{new Date().toISOString().slice(0, 10)}] {userName}
              </span>
              <button
                type="button"
                onClick={() => {
                  collapseWritingBox();
                  if (window.history.state?.textWritingBoxOpen) {
                    try { window.history.back(); } catch (_) {}
                  }
                }}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                title="Minimize writing box"
              >
                <ChevronDown className="w-4 h-4 text-amber-400" />
              </button>
            </div>
          </div>

          <form
            onSubmit={(e) => handleSendChat(e)}
            className={`p-1.5 sm:p-2 flex flex-row items-stretch gap-1.5 backdrop-blur-md ${
              darkTheme ? "bg-slate-950/95 border-slate-800" : "bg-slate-50/95 border-slate-300"
            }`}
          >
            <div className={`px-1.5 py-1 rounded font-mono text-[10px] shrink-0 border hidden md:block self-center ${
              isFreeWritingMode
                ? "bg-amber-950/80 text-amber-300 border-amber-700/80"
                : "bg-slate-800 text-emerald-400 border-slate-700"
            }`}>
              [{new Date().toISOString().slice(0, 10)}] {userName}:
            </div>

            <textarea
              ref={chatInputRef}
              value={chatInput}
              rows={keyboardInset > 0 ? 3 : 6}
              maxLength={MAX_CHAT_INPUT_CHARS}
              onChange={(e) => {
                const next = e.target.value;
                // Same upper limit for typing AND pasting — a paste that would push
                // past it is simply clamped here too, since paste fires this same
                // onChange with the already-merged value.
                const clamped = next.length > MAX_CHAT_INPUT_CHARS ? next.slice(0, MAX_CHAT_INPUT_CHARS) : next;
                setChatInput(clamped);
                // Only follow the box's own scroll down to its bottom when the
                // caret is already at (or right at) the end — i.e. this change
                // is normal continued typing/pasting onto the end. Doing this
                // unconditionally used to snap the view to the bottom even
                // while typing or pasting into an earlier line the user had
                // scrolled up to edit, making it look like the cursor had
                // jumped away from where it actually was.
                if (chatInputRef.current && isCaretNearEnd(e.target, clamped)) {
                  chatInputRef.current.scrollTop = chatInputRef.current.scrollHeight;
                }
              }}
              onFocus={() => {
                if (chatInputRef.current && forceFollowBottomRef.current) {
                  chatInputRef.current.scrollTop = chatInputRef.current.scrollHeight;
                }
                forceFollowBottomRef.current = false;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSendChat(e);
                }
              }}
              placeholder={
                isFreeWritingMode
                  ? "Type free writing entry to insert at cursor position..."
                  : "Type timestamped remark to send into document..."
              }
              className={`flex-1 px-3 py-2 text-base sm:text-sm ${
                // Shrink a little while the on-screen keyboard's emoji panel (or
                // any taller keyboard layout) is open, so the box as a whole fits
                // above it and its first line stays visible instead of being
                // pushed underneath.
                keyboardInset > 0 ? "min-h-[90px] sm:min-h-[70px]" : "min-h-[150px] sm:min-h-[110px]"
              } rounded-lg font-mono focus:outline-none focus:ring-2 resize-none overflow-y-auto leading-relaxed whitespace-pre-wrap break-words transition-all duration-200 ${
                isFreeWritingMode ? "focus:ring-amber-500" : "focus:ring-emerald-500"
              } ${
                darkTheme ? "bg-slate-900 text-slate-100 border border-slate-700" : "bg-white text-slate-900 border border-slate-300"
              }`}
            />

            <div className="flex flex-col justify-end gap-1 shrink-0">
              <button
                type="button"
                onClick={handleCreateNewLineAtTop}
                className="px-2 py-1 text-[10px] sm:text-xs font-medium rounded-md bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 border border-indigo-600/80 shadow-sm flex items-center justify-center space-x-1 transition-colors"
                title="Create a new line at the very top (Line 1) and start writing"
              >
                <PlusCircle className="w-3 h-3 text-indigo-400 shrink-0" />
                <span className="truncate">+ Top</span>
              </button>

              <button
                type="button"
                onClick={handleCreateNewLineAtBottom}
                className="px-2 py-1 text-[10px] sm:text-xs font-medium rounded-md bg-teal-900/80 hover:bg-teal-800 text-teal-200 border border-teal-600/80 shadow-sm flex items-center justify-center space-x-1 transition-colors"
                title="Create a new line at the very bottom and start writing"
              >
                <PlusCircle className="w-3 h-3 text-teal-400 shrink-0" />
                <span className="truncate">+ Bottom</span>
              </button>

              <button
                type="submit"
                disabled={!chatInput}
                className={`px-2.5 py-1.5 text-[11px] sm:text-xs font-bold rounded-md text-white disabled:opacity-40 shadow-md flex items-center justify-center space-x-1 transition-colors ${
                  isFreeWritingMode
                    ? "bg-amber-600 hover:bg-amber-500"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
                title={isFreeWritingMode ? "Send timestamped free writing entry directly at cursor" : "Send timestamped remark"}
              >
                <span>Send</span>
                <Send className="w-3 h-3 shrink-0" />
              </button>
            </div>
          </form>

          {activeLineIdx !== null && activeLineIdx < lines.length && (
            <div className={`px-3 py-1.5 border-t text-[11px] font-mono flex items-center justify-between gap-2 shadow-inner ${
              isFreeWritingMode
                ? "bg-amber-950/95 border-amber-800/80 text-amber-300"
                : "bg-slate-900 border-slate-800 text-emerald-300"
            }`}>
              <div className="flex items-center space-x-2 truncate">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                <span className="truncate">
                  {isFreeWritingMode ? (
                    <>
                      Free Writing Cursor at <strong className="text-amber-200">Line #{activeLineIdx + 1}</strong>
                      {activeColIdx !== null ? `, Col #${activeColIdx + 1}` : ""} — Timestamped message will insert at cursor target
                    </>
                  ) : (
                    <>
                      Remark Target on <strong className="text-emerald-200">Line #{activeLineIdx + 1}</strong> — Press Send to insert timestamped remark
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setCursorVerticalView((prev) => !prev)}
                  className={`px-2 py-0.5 rounded border text-[10px] font-semibold flex items-center space-x-1 transition-all ${
                    cursorVerticalView
                      ? "bg-amber-600/40 text-amber-200 border-amber-500/80 font-bold shadow-sm"
                      : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                  }`}
                  title="Toggle Vertical View alignment for cursor insertions (aligns newly inserted line at bottom of view with earlier lines above it)"
                >
                  <ArrowDown className="w-3 h-3 text-amber-400" />
                  <span>Vertical View: {cursorVerticalView ? "ON" : "OFF"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveLineIdx(null);
                    setActiveColIdx(null);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[10px] flex items-center space-x-1 transition-colors shrink-0"
                  title="Clear active cursor target and send to end of document"
                >
                  <X className="w-3 h-3 text-slate-400" />
                  <span className="hidden sm:inline">Clear Target</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
