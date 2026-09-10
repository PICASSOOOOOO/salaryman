import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  private hmrDispose?: () => void;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidMount() {
    const hot = (import.meta as ImportMeta & {
      hot?: { on: (event: string, callback: () => void) => void; off: (event: string, callback: () => void) => void };
    }).hot;
    if (!hot) return;

    const onUpdate = () => {
      if (this.state.hasError) this.setState({ hasError: false, error: null });
    };
    hot.on("vite:afterUpdate", onUpdate);
    this.hmrDispose = () => hot.off("vite:afterUpdate", onUpdate);
  }

  componentWillUnmount() {
    this.hmrDispose?.();
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleClearData = () => {
    try { localStorage.clear(); } catch { /* ignore */ }
    try { sessionStorage.clear(); } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 flex items-center justify-center border border-black/20">
              <AlertTriangle className="w-6 h-6 text-black" />
            </div>
          </div>
          <h2 className="text-lg font-bold text-black uppercase tracking-wider font-mono">
            {this.props.fallbackTitle || "SOMETHING WENT WRONG"}
          </h2>
          <p className="text-sm text-black/60 font-mono">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-2 px-4 py-2 text-sm font-mono uppercase tracking-wider bg-black text-white hover:bg-black/80 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              RETRY
            </button>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 text-sm font-mono uppercase tracking-wider border border-black text-black hover:bg-black/5 transition-colors"
            >
              RELOAD PAGE
            </button>
            <button
              onClick={this.handleClearData}
              className="px-4 py-2 text-sm font-mono uppercase tracking-wider border border-black/20 text-black/60 hover:text-black hover:bg-black/5 transition-colors"
              title="Clears saved data and reloads"
            >
              CLEAR DATA
            </button>
          </div>
        </div>
      </div>
    );
  }
}