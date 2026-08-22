export interface VirtualFile {
  path: string; // e.g. /storage/emulated/0/Documents/notes.txt
  name: string; // e.g. notes.txt
  content: string; // File text content
  size: number; // File size in bytes
  updatedAt: number; // Timestamp
  createdAt: number;
  mimeType: string;
  extension: string;
  isDirectory: boolean;
  parentPath: string; // e.g. /storage/emulated/0/Documents
}

export interface SearchMatch {
  lineNumber: number; // 1-based index
  lineContent: string;
  matchIndex: number;
  length: number;
  timestamp?: number;
}

export interface AiMatchResult {
  lineNumber: number; // 1-based index
  matchedContent: string;
  reason: string;
  confidence: number;
}

export type AiProvider = "local" | "gemini" | "openai" | "claude" | "custom_hosted";

export interface AiCredentials {
  provider: AiProvider;
  geminiKey: string;
  openaiKey: string;
  claudeKey: string;
  customKey: string;
  customEndpoint?: string;
}

export interface EditorSession {
  lastOpenedPath: string | null;
  lastDirPath: string;
  autoOpenLastDoc: boolean;
  userName: string;
  darkTheme: boolean;
  wordWrap: boolean; // Vertical reading mode default vs horizontal scrolling
  isHorizontalMode: boolean; // Toggle for horizontal scrolling with all characters on line
  showLineNumbers: boolean;
  slowScrollRatio: number; // e.g. 0.1 for 10x slower precision scroll
}
