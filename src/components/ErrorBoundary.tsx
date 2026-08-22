import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleResetState = () => {
    try {
      localStorage.removeItem("binarycore_editor_session");
    } catch (_) {}
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 text-slate-100 font-mono select-none z-50">
          <div className="max-w-md w-full bg-slate-900 border border-amber-500/60 rounded-xl p-6 shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/40 animate-pulse">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-amber-300">
                {this.props.fallbackTitle || "Application Recovered"}
              </h2>
              <p className="text-xs text-slate-400">
                A transient rendering exception occurred. The app prevented a blank screen crash.
              </p>
            </div>

            {this.state.error && (
              <div className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-amber-200/90 text-left font-mono overflow-x-auto max-h-32">
                <span className="font-bold text-red-400">Error: </span>
                {this.state.error.message || "Unknown rendering exception"}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-2 w-full pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center space-x-2 transition-colors shadow-md"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetState}
                className="w-full py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition-colors"
              >
                <span>Reset Temp State</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
