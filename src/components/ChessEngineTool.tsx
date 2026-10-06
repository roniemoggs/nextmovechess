import { Component, useState, useEffect, type ReactNode, type ErrorInfo } from 'react';
import Home from './page';
import type { SupportedLanguage } from '../i18n/ui';

interface ErrorBoundaryProps {
  children: ReactNode;
  lang?: SupportedLanguage;
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
        <div className="w-full max-w-5xl mx-auto my-6 p-8 rounded-2xl bg-[#060818] border border-rose-500/30 shadow-2xl text-center flex flex-col items-center justify-center min-h-[450px]">
          <div className="w-14 h-14 rounded-2xl bg-rose-950/60 border border-rose-800 flex items-center justify-center text-rose-400 text-2xl mb-4">
            ⚠️
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Chess Engine Tool Initializing</h3>
          <p className="text-sm text-[#a1a1aa] max-w-md mb-6">
            The board encountered a temporary reload state. Click below to load the interactive board.
          </p>
          <button
            onClick={this.handleReset}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            Load Chess Board
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export interface ChessEngineToolProps {
  initialFen?: string;
  isEmbedded?: boolean;
  lang?: SupportedLanguage;
  children?: ReactNode;
}

export default function ChessEngineTool(props: ChessEngineToolProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={`w-full text-slate-100 flex flex-col items-center font-sans select-none ${props.isEmbedded ? 'py-1 sm:py-2' : 'min-h-screen bg-[#030612] py-8'}`}>
        <div className="w-full max-w-6xl rounded-[28px] sm:rounded-[32px] border border-white/[0.08] bg-[#050715]/90 backdrop-blur-2xl p-4 sm:p-6 lg:p-7 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_25px_60px_-15px_rgba(0,0,0,0.7)] relative overflow-hidden flex flex-col lg:flex-row gap-6 lg:gap-8 min-h-[580px]">
          {/* Skeleton Board Side */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-full max-w-[530px] aspect-square rounded-2xl bg-[#040612] border border-white/[0.12] flex flex-col items-center justify-center p-6 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#141419] border border-[#27272a] flex items-center justify-center text-[#00dfd8] shadow-inner">
                <svg className="animate-spin h-7 w-7 text-[#00dfd8]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
              </div>
              <div className="text-center space-y-1">
                <div className="text-[16px] font-bold text-[#f4f4f5]">Stockfish NNUE Engine</div>
                <div className="text-[13px] text-[#71717a] font-mono">Loading Interactive Board...</div>
              </div>
            </div>
          </div>

          {/* Skeleton Controls Side */}
          <div className="w-full lg:w-[380px] xl:w-[420px] rounded-2xl bg-[#060818]/60 border border-white/[0.08] p-5 flex flex-col space-y-4">
            <div className="h-7 w-40 bg-white/10 rounded-xl animate-pulse"></div>
            <div className="h-24 bg-white/[0.04] rounded-2xl animate-pulse"></div>
            <div className="h-32 bg-white/[0.04] rounded-2xl animate-pulse"></div>
            <div className="h-20 bg-white/[0.04] rounded-2xl animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ChessToolErrorBoundary lang={props.lang}>
      <Home {...props} />
    </ChessToolErrorBoundary>
  );
}

export * from './page';
