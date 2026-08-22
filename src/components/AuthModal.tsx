import React, { useState } from "react";
import {
  LogIn,
  Mail,
  Lock,
  ShieldCheck,
  ArrowRight,
  X,
  LogOut,
  CheckCircle2,
  Key,
  Sparkles,
  Globe,
  Loader2,
  AlertCircle,
  Info,
} from "lucide-react";
import { isGoogleSignInConfigured, signInWithGoogle } from "../lib/googleAuth";
import { apiUrl } from "../lib/apiBase";

export interface UserAccount {
  username: string;
  email: string;
  authProvider: "email" | "google" | "openai" | "claude";
  isLoggedIn: boolean;
  apiKey?: string;
  avatarUrl?: string;
}

interface AuthModalProps {
  darkTheme: boolean;
  userAccount: UserAccount | null;
  onLoginSuccess: (account: UserAccount) => void;
  onLogout: () => void;
  onClose: () => void;
  // Pushes a verified provider API key into the app's shared AI credentials so
  // logging in here also wires up AI Analysis without re-entering the key there.
  onVerifiedApiKey?: (provider: "openai" | "claude", apiKey: string) => void;
}

type ApiKeyProvider = "openai" | "claude";

export const AuthModal: React.FC<AuthModalProps> = ({
  darkTheme,
  userAccount,
  onLoginSuccess,
  onLogout,
  onClose,
  onVerifiedApiKey,
}) => {
  const [activeTab, setActiveTab] = useState<"sso" | "credentials">("sso");
  const [isRegistering, setIsRegistering] = useState(false);

  // Custom Email / Password State (local-only account, not a real backend)
  const [usernameInput, setUsernameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");

  // API-key based provider linking (OpenAI / Claude)
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [claudeKeyInput, setClaudeKeyInput] = useState("");
  const [verifyingProvider, setVerifyingProvider] = useState<ApiKeyProvider | null>(null);

  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const googleConfigured = isGoogleSignInConfigured();

  // Email / Username + Password Login Handler (local account only — no server)
  const handleEmailAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const identifier = emailInput.trim() || usernameInput.trim();
    if (!identifier) {
      setErrorMsg("Bitte gib deinen Benutzernamen oder deine E-Mail-Adresse ein.");
      return;
    }

    if (!passwordInput || passwordInput.length < 4) {
      setErrorMsg("Das Passwort muss mindestens 4 Zeichen lang sein.");
      return;
    }

    const isEmail = identifier.includes("@");
    const resolvedUsername = isEmail
      ? identifier.split("@")[0]
      : usernameInput.trim() || identifier;
    const resolvedEmail = isEmail ? identifier : `${resolvedUsername.toLowerCase()}@binarycore.app`;

    const account: UserAccount = {
      username: resolvedUsername,
      email: resolvedEmail,
      authProvider: "email",
      isLoggedIn: true,
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(resolvedUsername)}`,
    };

    setSuccessMsg(`Erfolgreich angemeldet als ${resolvedUsername}!`);
    setTimeout(() => {
      onLoginSuccess(account);
      onClose();
    }, 400);
  };

  // Real Google Sign-In (Google Identity Services on web, native plugin in the packaged app)
  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsGoogleSigningIn(true);

    try {
      const profile = await signInWithGoogle();
      const account: UserAccount = {
        username: profile.name || profile.email.split("@")[0],
        email: profile.email,
        authProvider: "google",
        isLoggedIn: true,
        avatarUrl: profile.picture,
      };
      setSuccessMsg(`Google Konto '${profile.email}' erfolgreich verbunden!`);
      setTimeout(() => {
        onLoginSuccess(account);
        onClose();
      }, 400);
    } catch (err: any) {
      setErrorMsg(err?.message || "Google Sign-In fehlgeschlagen.");
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  // Shared handler for OpenAI / Claude: verify the key server-side, then link the account.
  const handleApiKeyAuth = async (provider: ApiKeyProvider) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const keyInput = provider === "openai" ? openaiKeyInput.trim() : claudeKeyInput.trim();
    if (!keyInput) {
      setErrorMsg(`Bitte gib deinen ${provider === "openai" ? "OpenAI" : "Anthropic (Claude)"} API Key ein.`);
      return;
    }

    setVerifyingProvider(provider);
    try {
      const res = await fetch(apiUrl("/api/auth/verify-key"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: keyInput }),
      });
      const data = await res.json();

      if (!data.ok) {
        setErrorMsg(data.error || "Der API Key konnte nicht verifiziert werden.");
        return;
      }

      const username = provider === "openai" ? "OpenAI Developer" : "Claude Developer";
      const email = provider === "openai" ? "openai.developer@app.local" : "claude.developer@app.local";

      const account: UserAccount = {
        username,
        email,
        authProvider: provider,
        isLoggedIn: true,
        apiKey: keyInput,
        avatarUrl:
          provider === "openai" ? "https://openai.com/favicon.ico" : "https://claude.ai/favicon.ico",
      };

      onVerifiedApiKey?.(provider, keyInput);
      setSuccessMsg(`${provider === "openai" ? "OpenAI" : "Claude"} API Key verifiziert & verbunden!`);
      setTimeout(() => {
        onLoginSuccess(account);
        onClose();
      }, 400);
    } catch (err: any) {
      setErrorMsg(err?.message || "Verifizierung fehlgeschlagen (Netzwerkfehler).");
    } finally {
      setVerifyingProvider(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-fade-in font-sans">
      <div
        className={`w-full max-w-md rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
          darkTheme
            ? "bg-slate-900 border-slate-800 text-slate-100"
            : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <LogIn className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg tracking-tight">
                Anmeldung & Konto
              </h2>
              <p className="text-[11px] text-slate-400">
                Google, OpenAI & Claude verbinden
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Active Logged-In User Profile */}
          {userAccount?.isLoggedIn ? (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xl shadow-md border border-emerald-400/50 overflow-hidden">
                  {userAccount.avatarUrl ? (
                    <img src={userAccount.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    userAccount.username.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <div className="font-bold text-sm text-emerald-300 flex items-center gap-1.5">
                    <span>{userAccount.username}</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-xs text-slate-300 font-mono">
                    {userAccount.email}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider mt-0.5 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-emerald-400" />
                    <span>Auth Provider: {userAccount.authProvider}</span>
                  </div>
                </div>
              </div>

              {userAccount.apiKey && (
                <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-emerald-300 font-mono flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">API Key: {userAccount.apiKey.slice(0, 10)}...</span>
                </div>
              )}

              <button
                onClick={() => {
                  onLogout();
                  setSuccessMsg("Erfolgreich abgemeldet.");
                }}
                className="w-full py-2 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Abmelden (Sign Out)</span>
              </button>
            </div>
          ) : (
            <>
              {/* Messages */}
              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {successMsg && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Tab Selector */}
              <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-semibold">
                <button
                  onClick={() => setActiveTab("sso")}
                  className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
                    activeTab === "sso"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Google / OpenAI / Claude</span>
                </button>
                <button
                  onClick={() => setActiveTab("credentials")}
                  className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
                    activeTab === "credentials"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Benutzername & PW</span>
                </button>
              </div>

              {activeTab === "sso" && (
                <div className="space-y-3 pt-1">
                  {/* Google Sign-In */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.2 9 5 12 5z" />
                          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z" />
                          <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9c-.8-1.5-1.3-3.2-1.3-5z" />
                          <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.2-6.4-5.2L1.9 16C3.7 19.7 7.5 22.3 12 23z" />
                        </svg>
                        <span>Google Konto Login (echtes OAuth)</span>
                      </span>
                    </div>

                    {!googleConfigured && (
                      <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-start gap-1.5">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                          Nicht konfiguriert: Setze <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> (siehe README) mit deiner Google Cloud OAuth Client ID.
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={!googleConfigured || isGoogleSigningIn}
                      className="w-full py-2 px-3 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center space-x-2 shadow-sm transition-all"
                    >
                      {isGoogleSigningIn ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <span>Mit Google anmelden</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>

                  {/* OpenAI API Key Linking */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-[9px] font-bold text-slate-950">
                        AI
                      </div>
                      <span>OpenAI API Key verbinden</span>
                    </span>
                    <p className="text-[11px] text-slate-500">
                      OpenAI bietet kein öffentliches "Sign in with OpenAI" für Drittanbieter-Apps &mdash; wir verifizieren stattdessen deinen API Key direkt.
                    </p>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="password"
                        value={openaiKeyInput}
                        onChange={(e) => setOpenaiKeyInput(e.target.value)}
                        placeholder="sk-..."
                        className="flex-1 px-2.5 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleApiKeyAuth("openai")}
                        disabled={verifyingProvider === "openai"}
                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                      >
                        {verifyingProvider === "openai" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <span>Verbinden</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Claude API Key Linking */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center text-[9px] font-bold text-slate-950">
                        C
                      </div>
                      <span>Claude (Anthropic) API Key verbinden</span>
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Nutzt deinen Anthropic API Key für serverseitige AI Textanalyse mit Claude.
                    </p>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="password"
                        value={claudeKeyInput}
                        onChange={(e) => setClaudeKeyInput(e.target.value)}
                        placeholder="sk-ant-..."
                        className="flex-1 px-2.5 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleApiKeyAuth("claude")}
                        disabled={verifyingProvider === "claude"}
                        className="px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                      >
                        {verifyingProvider === "claude" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <span>Verbinden</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "credentials" && (
                <form onSubmit={handleEmailAuth} className="space-y-3 pt-1">
                  <div className="p-2 rounded-lg bg-slate-800/40 border border-slate-700/60 text-[11px] text-slate-400 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>Lokales Konto ohne Server &mdash; nur für Anzeigenamen bei Timestamps, keine echte Authentifizierung.</span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Benutzername oder E-Mail-Adresse:</span>
                    </label>
                    <input
                      type="text"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="z.B. max.mustermann oder max@email.de"
                      required
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Passwort:</span>
                    </label>
                    <input
                      type="password"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="Dein sicheres Passwort"
                      required
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-md transition-colors mt-2"
                  >
                    <span>
                      {isRegistering ? "Konto erstellen" : "Anmelden mit Passwort"}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => setIsRegistering(!isRegistering)}
                      className="text-[11px] text-teal-400 hover:underline font-medium"
                    >
                      {isRegistering
                        ? "Bereits ein Konto? Hier anmelden."
                        : "Noch kein Konto? Jetzt registrieren."}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-800 text-[11px] text-slate-500 bg-slate-950/70 flex items-center justify-between font-mono">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Direct In-App Auth
          </span>
          <span>binarycore v3.0</span>
        </div>
      </div>
    </div>
  );
};
