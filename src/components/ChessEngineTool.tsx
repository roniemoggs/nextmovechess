import { Component, createElement, type ReactNode, type ErrorInfo } from 'react';
import Home from './page';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ChessToolErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('NextMoveChess Tool Error caught by boundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full max-w-6xl mx-auto my-6 p-8 rounded-2xl bg-[#060818] border border-rose-500/30 shadow-2xl text-center flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-14 h-14 rounded-2xl bg-rose-950/60 border border-rose-800 flex items-center justify-center text-rose-400 text-2xl mb-4">
            ⚠️
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Chess Engine Tool Encountered an Issue</h3>
          <p className="text-sm text-[#a1a1aa] max-w-md mb-6">
            The board encountered an unexpected state. Click below to reload the board and continue analyzing.
          </p>
          <button
            onClick={this.handleReset}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            Reload Chess Tool
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function ChessEngineTool(props: any) {
  return createElement(ChessToolErrorBoundary, null, createElement(Home, props));
}

export * from './page';

