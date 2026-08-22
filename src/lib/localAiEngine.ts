import { AiMatchResult } from "../types";

/**
 * High-performance local AI / semantic scanner for large .txt / .dat documents up to 1,000,000+ lines.
 * Processes chunked line arrays asynchronously without blocking the main UI thread.
 */
export async function runLocalAiAnalysis(
  lines: string[],
  query: string,
  onProgress?: (processed: number, total: number) => void
): Promise<AiMatchResult[]> {
  if (!query.trim() || lines.length === 0) return [];

  const lowerQuery = query.toLowerCase().trim();
  const tokens = lowerQuery.split(/\s+/).filter((t) => t.length > 0);

  // Check if query looks like a regex or special log search
  let regexPattern: RegExp | null = null;
  try {
    if (query.startsWith("/") && query.endsWith("/")) {
      regexPattern = new RegExp(query.slice(1, -1), "gi");
    } else if (tokens.length > 0) {
      // Escape special characters for multi-word fuzzy match
      const escapedTokens = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      regexPattern = new RegExp(escapedTokens.join("|"), "gi");
    }
  } catch {
    regexPattern = null;
  }

  const results: AiMatchResult[] = [];
  const total = lines.length;
  const chunkSize = 25000;

  for (let i = 0; i < total; i += chunkSize) {
    const end = Math.min(i + chunkSize, total);

    for (let lineIdx = i; lineIdx < end; lineIdx++) {
      const lineText = lines[lineIdx];
      if (!lineText) continue;

      // Fast pre-filter: skip empty lines or lines shorter than any query token
      if (lineText.length === 0) continue;

      const lowerLine = lineText.toLowerCase();
      let matchScore = 0;
      const matchedTokens: string[] = [];

      // 1. Exact phrase match
      if (lowerLine.includes(lowerQuery)) {
        matchScore += 10;
        matchedTokens.push(`Exact phrase "${query}"`);
      } else {
        // 2. Multi-token match
        for (const token of tokens) {
          if (lowerLine.includes(token)) {
            matchScore += 2;
            matchedTokens.push(token);
          }
        }
      }

      // 3. Regex match
      if (regexPattern) {
        const matches = lineText.match(regexPattern);
        if (matches && matches.length > 0) {
          matchScore += matches.length * 1.5;
        }
      }

      // 4. Heuristic semantic checks (timestamps, error codes, log levels)
      if (lowerQuery.includes("error") || lowerQuery.includes("fehler")) {
        if (/error|fail|exception|fatal|bug|err/i.test(lineText)) {
          matchScore += 3;
          matchedTokens.push("Error Keyword");
        }
      }

      if (lowerQuery.includes("timestamp") || lowerQuery.includes("datum") || lowerQuery.includes("zeit")) {
        if (/\[?\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}/.test(lineText)) {
          matchScore += 2;
          matchedTokens.push("Timestamp Format");
        }
      }

      if (matchScore > 0) {
        const confidence = Math.min(1.0, matchScore / 10);
        results.push({
          lineNumber: lineIdx + 1, // 1-based index
          matchedContent: lineText,
          reason: `Matched: ${matchedTokens.join(", ")}`,
          confidence: Number(confidence.toFixed(2)),
        });

        // Cap max matches up to 100,000
        if (results.length >= 100000) break;
      }
    }

    if (results.length >= 100000) break;

    if (onProgress) {
      onProgress(end, total);
    }

    // Yield control to UI thread every chunk
    await new Promise((r) => setTimeout(r, 0));
  }

  // Sort results by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  return results.slice(0, 100000); // Return up to 100,000 best matches
}
