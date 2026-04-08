import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
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
            <div className="flex items-center justify-center gap-3 pt-2">
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
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
