import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support large text payloads for processing large .txt / .dat chunks
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", app: "binarycore" });
  });

  // Server-side AI text analysis API
  app.post("/api/ai/analyze", async (req, res) => {
    try {
      const { provider, apiKey, query, textSnippet, lineOffset = 0, sampleLines = [] } = req.body;

      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "A search/analysis query is required." });
      }

      // 1. Google Gemini AI Provider
      if (provider === "gemini" || !provider) {
        const key = apiKey || process.env.GEMINI_API_KEY;
        if (!key) {
          return res.status(400).json({
            error: "Gemini API key is required. Please set it in Settings > Secrets or provide it in the AI Credentials menu.",
          });
        }

        const ai = new GoogleGenAI({
          apiKey: key,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        const prompt = `You are binarycore AI Engine, an advanced text & log analyzer for large .txt/.dat files.
Search and identify the most relevant line numbers and matching text sections for this query: "${query}".

Document snippet provided:
---
${sampleLines.map((l: any, i: number) => typeof l === "object" && l.lineNumber ? `Line ${l.lineNumber}: ${l.content}` : `Line ${lineOffset + i + 1}: ${l}`).join("\n")}
---

Identify up to 20 best matching lines. Return JSON array with objects containing:
- "lineNumber" (number: use the exact line number specified after 'Line ' in the snippet)
- "matchedContent" (string)
- "reason" (string concise explanation of match)
- "confidence" (number 0.0 - 1.0)
`;

        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        });

        let results = [];
        try {
          results = JSON.parse(response.text || "[]");
        } catch {
          results = [];
        }

        return res.json({ provider: "gemini", query, matches: results });
      }

      // 2. OpenAI Provider
      if (provider === "openai") {
        if (!apiKey) {
          return res.status(400).json({ error: "OpenAI API Key is required." });
        }

        const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: "You analyze text files and return JSON object with property 'matches': array of { lineNumber, matchedContent, reason, confidence }",
              },
              {
                role: "user",
                content: `Find matches for: "${query}". Sample document lines:\n${sampleLines.map((l: any, i: number) => typeof l === "object" && l.lineNumber ? `Line ${l.lineNumber}: ${l.content}` : `Line ${lineOffset + i + 1}: ${l}`).join("\n")}`,
              },
            ],
          }),
        });

        if (!openAiRes.ok) {
          const errText = await openAiRes.text();
          return res.status(openAiRes.status).json({ error: `OpenAI error: ${errText}` });
        }

        const openAiData = await openAiRes.json();
        let parsed = { matches: [] };
        try {
          parsed = JSON.parse(openAiData.choices?.[0]?.message?.content || "{}");
        } catch {}

        return res.json({ provider: "openai", query, matches: parsed.matches || [] });
      }

      // 3. Anthropic Claude Provider
      if (provider === "claude" || provider === "anthropic") {
        if (!apiKey) {
          return res.status(400).json({ error: "Anthropic (Claude) API Key is required." });
        }

        const claudeModel = process.env.ANTHROPIC_MODEL || "claude-opus-5";
        const anthropic = new Anthropic({ apiKey });

        let claudeMessage;
        try {
          claudeMessage = await anthropic.messages.create({
            model: claudeModel,
            max_tokens: 4096,
            system:
              "You analyze text/log files and respond with ONLY a JSON array (no prose, no markdown fences) of objects: { lineNumber, matchedContent, reason, confidence }.",
            messages: [
              {
                role: "user",
                content: `Find up to 20 best matching lines for: "${query}".\n\nDocument snippet:\n---\n${sampleLines.map((l: any, i: number) => typeof l === "object" && l.lineNumber ? `Line ${l.lineNumber}: ${l.content}` : `Line ${lineOffset + i + 1}: ${l}`).join("\n")}\n---`,
              },
            ],
          });
        } catch (err: any) {
          if (err instanceof Anthropic.AuthenticationError) {
            return res.status(401).json({ error: "Anthropic rejected this API key." });
          }
          if (err instanceof Anthropic.RateLimitError) {
            return res.status(429).json({ error: "Anthropic rate limit reached. Try again shortly." });
          }
          if (err instanceof Anthropic.APIError) {
            return res.status(err.status || 500).json({ error: `Claude error: ${err.message}` });
          }
          throw err;
        }

        const rawText = claudeMessage.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");

        let claudeResults = [];
        try {
          // Strip accidental markdown fences before parsing, just in case
          const cleaned = rawText.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
          claudeResults = JSON.parse(cleaned || "[]");
        } catch {
          claudeResults = [];
        }

        return res.json({ provider: "claude", query, matches: claudeResults });
      }

      // 4. Custom Hosted AI Key Proxy
      if (provider === "custom_hosted") {
        if (!apiKey) {
          return res.status(400).json({ error: "Hosted API Key is required." });
        }
        // Fallback to Gemini with custom hosted key or basic analysis
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { "User-Agent": "aistudio-build" } },
        });

        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: `Analyze document for query: "${query}". Lines sample starting at line ${lineOffset + 1}:\n${sampleLines.map((l: any, i: number) => `Line ${lineOffset + i + 1}: ${l}`).join("\n")}`,
          config: { responseMimeType: "application/json" },
        });

        let results = [];
        try {
          results = JSON.parse(response.text || "[]");
        } catch {}

        return res.json({ provider: "custom_hosted", query, matches: results });
      }

      return res.status(400).json({ error: "Unsupported AI provider." });
    } catch (error: any) {
      console.error("AI Analysis error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze text." });
    }
  });

  // Verify a provider API key is real & working, without doing a full analysis call.
  // Used by the Login modal so "connecting" an account actually proves the key works
  // instead of just trusting whatever the user typed.
  app.post("/api/auth/verify-key", async (req, res) => {
    try {
      const { provider, apiKey } = req.body;

      if (!apiKey || typeof apiKey !== "string") {
        return res.status(400).json({ ok: false, error: "API key is required." });
      }

      if (provider === "openai") {
        const r = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!r.ok) {
          const body = await r.text();
          return res.status(200).json({ ok: false, error: `OpenAI rejected this key: ${r.status} ${body.slice(0, 200)}` });
        }
        return res.json({ ok: true, provider: "openai" });
      }

      if (provider === "claude" || provider === "anthropic") {
        try {
          const anthropic = new Anthropic({ apiKey });
          await anthropic.models.list();
          return res.json({ ok: true, provider: "claude" });
        } catch (err: any) {
          if (err instanceof Anthropic.AuthenticationError) {
            return res.status(200).json({ ok: false, error: "Anthropic rejected this key: invalid or revoked." });
          }
          if (err instanceof Anthropic.APIError) {
            return res.status(200).json({ ok: false, error: `Anthropic rejected this key: ${err.status} ${err.message}` });
          }
          throw err;
        }
      }

      if (provider === "gemini") {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
        );
        if (!r.ok) {
          const body = await r.text();
          return res.status(200).json({ ok: false, error: `Gemini rejected this key: ${r.status} ${body.slice(0, 200)}` });
        }
        return res.json({ ok: true, provider: "gemini" });
      }

      return res.status(400).json({ ok: false, error: "Unsupported provider for key verification." });
    } catch (error: any) {
      console.error("Key verification error:", error);
      res.status(500).json({ ok: false, error: error.message || "Failed to verify key." });
    }
  });

  // Vite middleware setup for dev, static serving for prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`binarycore server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
