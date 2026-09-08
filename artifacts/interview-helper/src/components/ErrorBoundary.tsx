import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Send, Check } from 'lucide-react';
import { captureError, sendReport } from '@/lib/errorReporter';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  reportNote: string;
  reportSent: boolean;
  reportBusy: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  private hmrDispose?: () => void;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null, reportNote: '', reportSent: false, reportBusy: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, componentStack: null, reportNote: '', reportSent: false, reportBusy: false };
  }

  componentDidMount() {
    // Dev-only self-heal. Vite Fast Refresh momentarily violates the Rules of
    // Hooks whenever an edited module adds/removes a hook (e.g. a new useRef in
    // a custom hook), throwing a hook-order error this boundary catches. The
    // keep-alive subtrees (the always-mounted Console "terminal", the home
    // panel) would then stay stuck on the fallback for the rest of the session
    // even once the code is valid again — looking like a persistent crash.
    // Resetting on every HMR update lets those transient edit-time errors clear
    // themselves. `import.meta.hot` is undefined in production, so this no-ops
    // there.
    const hot = (import.meta as ImportMeta & {
      hot?: { on: (e: string, cb: () => void) => void; off: (e: string, cb: () => void) => void };
    }).hot;
    if (hot) {
      const onUpdate = () => {
        if (this.state.hasError) {
          this.setState({ hasError: false, error: null, componentStack: null, reportNote: '', reportSent: false, reportBusy: false });
        }
      };
      hot.on('vite:afterUpdate', onUpdate);
      this.hmrDispose = () => hot.off('vite:afterUpdate', onUpdate);
    }
  }

  componentWillUnmount() {
    this.hmrDispose?.();
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
    // Auto-fire to the global reporter so the toast appears AND the technical
    // payload reaches the server even if the user just reloads without
    // touching the in-fallback "Send" button.
    captureError({
      source: 'react',
      message: error.message || 'React render error',
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    });
  }

  handleSendReport = async () => {
    const { error, componentStack, reportNote } = this.state;
    if (!error) return;
    this.setState({ reportBusy: true });
    const ok = await sendReport({
      source: 'react',
      message: error.message || 'React render error',
      stack: error.stack,
      componentStack: componentStack ?? undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      userNote: reportNote.trim() || undefined,
    });
    this.setState({ reportBusy: false, reportSent: ok });
  };

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
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
            </div>
            <h2 className="text-lg font-bold text-foreground uppercase tracking-wider font-mono">
              {this.props.fallbackTitle || 'SOMETHING WENT WRONG'}
            </h2>
            <p className="text-sm text-muted-foreground font-mono">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <p className="text-[11px] text-zinc-500 font-mono">
              The technical details have been auto-reported. Add context below if you can.
            </p>
            <div className="text-left">
              <textarea
                value={this.state.reportNote}
                onChange={(e) => this.setState({ reportNote: e.target.value.slice(0, 1000) })}
                placeholder="What were you doing right before this happened?"
                rows={3}
                disabled={this.state.reportSent}
                className="w-full text-xs font-mono bg-black/40 border border-white/10 rounded px-2 py-1.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-sky-500/40 resize-none disabled:opacity-50"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-zinc-600 font-mono">{this.state.reportNote.length}/1000</span>
                <button
                  onClick={this.handleSendReport}
                  disabled={this.state.reportBusy || this.state.reportSent}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider bg-red-500/10 border border-red-500/20 text-red-200 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded"
                >
                  {this.state.reportSent ? (<><Check className="w-3 h-3" /> SENT</>) : (<><Send className="w-3 h-3" /> SEND REPORT</>)}
                </button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <button
                onClick={this.handleRetry}
                className="flex items-center gap-2 px-4 py-2 text-sm font-mono uppercase tracking-wider bg-sky-500/10 border border-sky-500/20 text-sky-300 hover:bg-sky-500/20 transition-colors rounded-lg"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                RETRY
              </button>
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-4 py-2 text-sm font-mono uppercase tracking-wider bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition-colors rounded-lg"
              >
                RELOAD PAGE
              </button>
              <button
                onClick={this.handleClearData}
                className="flex items-center gap-2 px-4 py-2 text-sm font-mono uppercase tracking-wider bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20 transition-colors rounded-lg"
                title="Clears saved game data and reloads — use if the page keeps crashing"
              >
                CLEAR DATA & RESTART
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
