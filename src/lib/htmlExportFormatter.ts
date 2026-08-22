// Google Chrome HTML Viewer & ChatGPT Export Formatter
// Converts document lines into a standalone, styled HTML viewer document compatible with Google Chrome & Android browsers.

export function formatAsChromeHtmlViewer(filename: string, lines: string[]): string {
  const lineCount = lines.length;
  const nowStr = new Date().toLocaleString();

  // Escape HTML helper
  const escapeHtml = (str: string): string => {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // Convert inline Markdown to HTML (bold, inline code, headers)
  const formatMarkdownInline = (str: string): string => {
    if (!str) return "";
    let safe = escapeHtml(str);

    // Code block line ```
    if (safe.trim().startsWith("```")) {
      const lang = safe.trim().slice(3);
      return `<div class="code-block-banner"><span>CODE BLOCK ${lang ? "(" + lang.toUpperCase() + ")" : ""}</span></div>`;
    }

    // Bold **text**
    safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Inline code `code`
    safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Bullet points
    if (/^\s*[\*\-\+]\s+/.test(str)) {
      safe = safe.replace(/^\s*[\*\-\+]\s+/, '<span class="bullet">•</span> ');
    }

    return safe;
  };

  // Detect if lines are timestamped messages or ChatGPT export logs
  const sample = lines.slice(0, 100);
  let messageCount = 0;
  for (const l of sample) {
    const trimmed = l.trim().toLowerCase();
    if (
      l.trim().startsWith("[") ||
      l.includes(" - ") ||
      (l.indexOf(":") > 0 && l.indexOf(":") < 35) ||
      trimmed.startsWith("### user") ||
      trimmed.startsWith("### assistant") ||
      trimmed.startsWith("### chatgpt")
    ) {
      messageCount++;
    }
  }
  const isChatMessageLog = messageCount > 5;

  // Process lines into HTML body content
  const processedBody: string[] = [];

  if (isChatMessageLog) {
    let currentSender = "";
    let currentRole: "user" | "assistant" | "system" = "assistant";

    // Render as ChatGPT / Message Cards
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Extract timestamp/sender if present
      let timestamp = "";
      let sender = "";
      let text = line;

      // Bracketed timestamp [2026-08-12 10:00] User: ...
      if (line.startsWith("[")) {
        const cb = line.indexOf("]");
        if (cb > 1 && cb < 60) {
          timestamp = line.slice(1, cb).trim();
          const rest = line.slice(cb + 1).trim();
          const col = rest.indexOf(":");
          if (col > 0 && col < 40) {
            sender = rest.slice(0, col).trim();
            text = rest.slice(col + 1);
          } else {
            text = rest;
          }
        }
      } else {
        const col = line.indexOf(":");
        if (col > 0 && col < 40) {
          const possible = line.slice(0, col).trim();
          const lower = possible.toLowerCase();
          if (
            lower === "user" ||
            lower === "chatgpt" ||
            lower === "assistant" ||
            lower === "you" ||
            lower === "system" ||
            !possible.includes(" ")
          ) {
            sender = possible;
            text = line.slice(col + 1);
          }
        }
      }

      if (!sender && line.trim().startsWith("### ")) {
        sender = line.trim().replace(/^###\s*/, "");
        text = "";
      }

      if (sender) {
        currentSender = sender;
        const lower = sender.toLowerCase();
        if (lower.includes("user") || lower.includes("chris") || lower.includes("human") || lower.includes("you")) {
          currentRole = "user";
        } else if (lower.includes("system")) {
          currentRole = "system";
        } else {
          currentRole = "assistant";
        }
      }

      const isUser = currentRole === "user";
      const isSystem = currentRole === "system";

      const avatarBg = isUser ? "#238636" : isSystem ? "#8957e5" : "#0d9488";
      const avatarLabel = isUser ? "U" : isSystem ? "SYS" : "AI";
      const displayName = currentSender || (isUser ? "User" : "ChatGPT / Assistant");

      const formattedContent = formatMarkdownInline(text);

      processedBody.push(`
        <div class="msg-card ${isUser ? "user-msg" : "ai-msg"}" data-line="${i + 1}">
          <div class="msg-header">
            <div class="avatar" style="background:${avatarBg}">${avatarLabel}</div>
            <div class="sender-info">
              <span class="sender-name">${escapeHtml(displayName)}</span>
              ${timestamp ? `<span class="timestamp">${escapeHtml(timestamp)}</span>` : ""}
            </div>
            <span class="line-num">#${i + 1}</span>
          </div>
          <div class="msg-content">${formattedContent || "&nbsp;"}</div>
        </div>
      `);
    }
  } else {
    // Render as Chrome Code / Text Line Viewer
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const safeLine = escapeHtml(line || "");
      processedBody.push(`
        <div class="code-line" data-line="${i + 1}">
          <span class="ln">${i + 1}</span>
          <span class="lc">${safeLine || "&nbsp;"}</span>
        </div>
      `);
    }
  }

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(filename)} - Google Chrome HTML Viewer</title>
  <style>
    :root {
      --bg-color: #0d1117;
      --card-bg: #161b22;
      --header-bg: #161b22f0;
      --border-color: #30363d;
      --text-main: #e6edf3;
      --text-muted: #8b949e;
      --accent-blue: #58a6ff;
      --accent-green: #3fb950;
      --accent-teal: #2dd4bf;
      --accent-amber: #d29922;
      --code-line-hover: #1f242c;
      --font-mono: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, "Liberation Mono", monospace;
    }

    [data-theme="light"] {
      --bg-color: #f6f8fa;
      --card-bg: #ffffff;
      --header-bg: #fffffff0;
      --border-color: #d0d7de;
      --text-main: #1f2328;
      --text-muted: #656d76;
      --accent-blue: #0969da;
      --accent-green: #1a7f37;
      --accent-teal: #0d9488;
      --accent-amber: #9a6700;
      --code-line-hover: #f3f4f6;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-color);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      padding-top: 60px;
    }

    /* Sticky Chrome Header Toolbar */
    .chrome-toolbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 56px;
      background: var(--header-bg);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .toolbar-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-icon {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #0d9488, #059669);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 13px;
    }

    .filename-title {
      font-weight: 700;
      font-size: 15px;
      color: var(--text-main);
    }

    .meta-badge {
      font-size: 11px;
      font-family: var(--font-mono);
      padding: 2px 8px;
      border-radius: 12px;
      background: var(--border-color);
      color: var(--text-muted);
    }

    .toolbar-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .search-box {
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      outline: none;
      width: 180px;
      transition: width 0.2s;
    }
    .search-box:focus { width: 260px; border-color: var(--accent-teal); }

    .btn {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
    }
    .btn:hover { background: var(--border-color); }
    .btn-primary { background: var(--accent-green); color: white; border: none; }
    .btn-primary:hover { opacity: 0.9; }

    /* Main Container */
    .viewer-container {
      max-width: 1200px;
      margin: 16px auto;
      padding: 0 16px;
    }

    /* Message Cards Mode */
    .msg-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 8px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
      content-visibility: auto;
      contain-intrinsic-size: 1px 50px;
    }

    .msg-card.user-msg {
      border-left: 4px solid var(--accent-green);
      background: rgba(63, 185, 80, 0.04);
    }

    .msg-card.ai-msg {
      border-left: 4px solid var(--accent-teal);
    }

    .msg-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }

    .avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      color: white;
      font-weight: bold;
      font-size: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      shrink: 0;
    }

    .sender-info { display: flex; align-items: center; gap: 8px; flex: 1; }
    .user-msg .sender-name { font-weight: 700; font-size: 13px; color: var(--accent-green); }
    .ai-msg .sender-name { font-weight: 700; font-size: 13px; color: var(--accent-teal); }
    .timestamp { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
    .line-num { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); }
    .msg-content { font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; }
    .msg-content strong { color: var(--accent-amber); font-weight: 700; }
    .msg-content code {
      background: var(--border-color);
      color: var(--accent-teal);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 11px;
    }
    .bullet { color: var(--accent-amber); font-bold: true; margin-right: 4px; }
    .code-block-banner {
      background: #161b22;
      color: var(--accent-amber);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: bold;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--border-color);
      margin: 4px 0;
    }

    /* Code Line Viewer Mode */
    .code-viewer {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 22px;
    }

    .code-line {
      display: flex;
      padding: 0 8px;
      content-visibility: auto;
      contain-intrinsic-size: 1px 22px;
    }
    .code-line:hover { background-color: var(--code-line-hover); }

    .ln {
      width: 60px;
      text-align: right;
      padding-right: 12px;
      color: var(--text-muted);
      user-select: none;
      border-right: 1px solid var(--border-color);
      margin-right: 12px;
      shrink: 0;
    }

    .lc { flex: 1; white-space: pre; word-break: normal; }
  </style>
</head>
<body>

  <!-- Chrome Header Toolbar -->
  <div class="chrome-toolbar">
    <div class="toolbar-left">
      <div class="brand-icon">GPT</div>
      <div>
        <div class="filename-title">${escapeHtml(filename)}</div>
      </div>
      <span class="meta-badge">${lineCount.toLocaleString()} lines</span>
      <span class="meta-badge">Exported ${escapeHtml(nowStr)}</span>
    </div>

    <div class="toolbar-right">
      <input type="text" id="filterInput" class="search-box" placeholder="Search ChatGPT content..." oninput="filterViewerContent()" />
      <button class="btn" onclick="toggleTheme()">Theme</button>
      <button class="btn btn-primary" onclick="copyAllText()">Copy All</button>
    </div>
  </div>

  <!-- Main Viewer Content -->
  <div class="viewer-container">
    ${
      isChatMessageLog
        ? processedBody.join("\n")
        : `<div class="code-viewer" id="codeContainer">${processedBody.join("\n")}</div>`
    }
  </div>

  <script>
    function toggleTheme() {
      const html = document.documentElement;
      const cur = html.getAttribute('data-theme');
      html.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
    }

    function filterViewerContent() {
      const query = document.getElementById('filterInput').value.toLowerCase();
      const codeLines = document.querySelectorAll('.code-line, .msg-card');
      codeLines.forEach(el => {
        if (!query) {
          el.style.display = '';
        } else {
          const txt = el.textContent || '';
          if (txt.toLowerCase().includes(query)) {
            el.style.display = '';
          } else {
            el.style.display = 'none';
          }
        }
      });
    }

    function copyAllText() {
      const container = document.querySelector('.viewer-container');
      if (container) {
        navigator.clipboard.writeText(container.innerText);
        alert('Copied all text to clipboard!');
      }
    }
  </script>
</body>
</html>`;
}

