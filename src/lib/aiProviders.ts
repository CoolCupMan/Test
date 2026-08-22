/**
 * Direct-from-client calls to OpenAI, Anthropic (Claude), and Gemini.
 *
 * The packaged Android app has no on-device server, so anything that used to
 * go through this repo's own Express server (/api/auth/verify-key,
 * /api/ai/analyze) would fail there — the WebView's local asset server
 * answers unknown paths with index.html, and trying to res.json() that HTML
 * is exactly the "Unexpected token '<', <!doctype... is not valid JSON"
 * error. Calling the providers' own APIs directly from the client sidesteps
 * that entirely: verifying or using your own key never needs our server.
 *
 * Anthropic requires opting in to client-side use explicitly, which also
 * sends the header their API needs to allow a browser-origin request:
 * `dangerouslyAllowBrowser: true` (see @anthropic-ai/sdk's client.mjs) sets
 * `anthropic-dangerous-direct-browser-access: true` automatically. This is
 * safe here because the key is the device's own user-supplied key, typed in
 * by the same person running the app — not a key shared across visitors of a
 * public website.
 */
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { AiMatchResult } from "../types";

export interface VerifyResult {
  ok: boolean;
  error?: string;
}

const ANTHROPIC_MODEL = "claude-opus-5";

export async function verifyApiKeyDirect(
  provider: "openai" | "claude" | "gemini",
  apiKey: string
): Promise<VerifyResult> {
  try {
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        return { ok: false, error: `OpenAI rejected this key (HTTP ${res.status}).` };
      }
      return { ok: true };
    }

    if (provider === "claude") {
      const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
      await anthropic.models.list();
      return { ok: true };
    }

    if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
      );
      if (!res.ok) {
        return { ok: false, error: `Gemini rejected this key (HTTP ${res.status}).` };
      }
      return { ok: true };
    }

    return { ok: false, error: "Unsupported provider." };
  } catch (err: any) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "Anthropic rejected this key: invalid or revoked." };
    }
    if (err instanceof Anthropic.APIError) {
      return { ok: false, error: `Anthropic error: ${err.message}` };
    }
    return {
      ok: false,
      error: err?.message || "Network error while verifying the key — check your internet connection.",
    };
  }
}

function buildSampleText(
  sampleLines: { lineNumber: number; content: string }[],
  lineOffset: number
): string {
  return sampleLines
    .map((l: any, i: number) =>
      typeof l === "object" && l.lineNumber ? `Line ${l.lineNumber}: ${l.content}` : `Line ${lineOffset + i + 1}: ${l}`
    )
    .join("\n");
}

export async function analyzeWithProviderDirect(
  provider: "openai" | "claude" | "gemini",
  apiKey: string,
  query: string,
  sampleLines: { lineNumber: number; content: string }[],
  lineOffset: number
): Promise<AiMatchResult[]> {
  const sampleText = buildSampleText(sampleLines, lineOffset);

  if (provider === "gemini") {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are binarycore AI Engine, an advanced text & log analyzer for large .txt/.dat files.
Search and identify the most relevant line numbers and matching text sections for this query: "${query}".

Document snippet provided:
---
${sampleText}
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
      config: { responseMimeType: "application/json" },
    });
    try {
      return JSON.parse(response.text || "[]");
    } catch {
      return [];
    }
  }

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You analyze text files and return JSON object with property 'matches': array of { lineNumber, matchedContent, reason, confidence }",
          },
          { role: "user", content: `Find matches for: "${query}". Sample document lines:\n${sampleText}` },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI error: ${errText}`);
    }
    const data = await res.json();
    try {
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
      return parsed.matches || [];
    } catch {
      return [];
    }
  }

  if (provider === "claude") {
    const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const message = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system:
        "You analyze text/log files and respond with ONLY a JSON array (no prose, no markdown fences) of objects: { lineNumber, matchedContent, reason, confidence }.",
      messages: [
        { role: "user", content: `Find up to 20 best matching lines for: "${query}".\n\nDocument snippet:\n---\n${sampleText}\n---` },
      ],
    });
    const rawText = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    try {
      const cleaned = rawText.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
      return JSON.parse(cleaned || "[]");
    } catch {
      return [];
    }
  }

  throw new Error("Unsupported AI provider.");
}
