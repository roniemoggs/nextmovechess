import { getOpeningBookResult } from './opening-book';

export interface EngineMoveData {
  move: string;
  rawScore: number;
  scoreType: 'cp' | 'mate' | string;
  scoreStr: string;
  evalWhiteStr: string;
  numericScore: number;
  multiPvIndex: number;
  pv: string[];
  rank?: number;
}

export interface EngineEvalResult {
  best: EngineMoveData[];
  worst: EngineMoveData[];
  positionEval: {
    scoreStr: string;
    evalWhiteStr: string;
    numericScore: number;
    scoreType: string;
    rawScore: number;
  };
}

export interface EvaluateOptions {
  fen: string;
  depth?: number;
  limit?: number;
  includeWorst?: boolean;
  onProgress?: (result: EngineEvalResult) => void;
  signal?: AbortSignal;
}

/**
 * Validates whether a given UCI move string (e.g. 'e2e4', 'd8f6') belongs to the active side to move in the FEN.
 * This prevents stale moves from prior turns or previous positions from ever polluting results.
 */
export function isMoveValidForFen(fen: string, move: string): boolean {
  if (!move || move.length < 4 || !fen) return false;
  const fromSquare = move.substring(0, 2);
  const file = fromSquare.charCodeAt(0) - 97; // 0..7 for 'a'..'h'
  const rank = parseInt(fromSquare[1], 10);   // 1..8
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return false;

  const fenParts = fen.trim().split(/\s+/);
  const boardPart = fenParts[0];
  const activeColor = fenParts[1] || 'w';

  const ranks = boardPart.split('/');
  if (ranks.length !== 8) return false;

  // Ranks in FEN are listed from rank 8 down to rank 1
  const rankStr = ranks[8 - rank];
  let col = 0;
  let pieceChar: string | null = null;
  for (const char of rankStr) {
    if (char >= '1' && char <= '8') {
      col += parseInt(char, 10);
    } else {
      if (col === file) {
        pieceChar = char;
        break;
      }
      col++;
    }
  }

  if (!pieceChar) return false;
  const isWhitePiece = pieceChar >= 'A' && pieceChar <= 'Z';
  const isBlackPiece = pieceChar >= 'a' && pieceChar <= 'z';

  return activeColor === 'w' ? isWhitePiece : isBlackPiece;
}

class StockfishClient {
  private worker: Worker | null = null;
  private currentSessionId: number = 0;
  private isSearching: boolean = false;
  private isSyncing: boolean = false;
  private readyResolvers: Array<() => void> = [];

  // Active session state
  private activeResolve: ((result: EngineEvalResult) => void) | null = null;
  private activeReject: ((reason?: any) => void) | null = null;
  private activeOnProgress: ((result: EngineEvalResult) => void) | null = null;
  private activeFen: string = '';
  private activeLimit: number = 5;
  private activeIncludeWorst: boolean = false;
  private activeBookResult: EngineEvalResult | null = null;
  private activeCacheKey: string = '';
  private activeAllMoves: Record<number, { depth: number; data: EngineMoveData }> = {};
  private activeLastProgressTime: number = 0;
  private activeProgressThrottleTimeout: any = null;

  // WASM for 3x-5x native speed, falling back to ASM.js if WASM is unavailable
  private wasmScriptPath: string = '/stockfish.wasm.js';
  private asmScriptPath: string = '/stockfish/stockfish-19-asm.js';
  private activeScriptPath: string = '/stockfish.wasm.js';
  private hasWasmFailed: boolean = false;

  // In-memory LRU cache for 0ms instant response on repeated/explored positions
  private cache: Map<string, EngineEvalResult> = new Map();
  private maxCacheSize: number = 300;

  constructor() {
    if (typeof window !== 'undefined' && typeof window.WebAssembly !== 'object') {
      this.activeScriptPath = this.asmScriptPath;
    }
  }

  private getCacheKey(fen: string, depth: number, limit: number, includeWorst: boolean): string {
    return `${fen}__d${depth}__l${limit}__w${includeWorst ? 1 : 0}`;
  }

  public getCachedResult(options: EvaluateOptions): EngineEvalResult | null {
    const { fen, depth = 10, limit = 5, includeWorst = false } = options;
    const key = this.getCacheKey(fen, depth, limit, includeWorst);
    const cached = this.cache.get(key);
    if (cached) {
      return JSON.parse(JSON.stringify(cached));
    }
    return null;
  }

  public clearCache() {
    this.cache.clear();
  }

  private clearActiveSession() {
    if (this.activeProgressThrottleTimeout) {
      clearTimeout(this.activeProgressThrottleTimeout);
      this.activeProgressThrottleTimeout = null;
    }
    this.activeResolve = null;
    this.activeReject = null;
    this.activeOnProgress = null;
    this.activeFen = '';
    this.activeCacheKey = '';
    this.activeAllMoves = {};
    this.activeBookResult = null;
  }

  public stopCurrent() {
    if (this.activeReject) {
      this.activeReject(new Error('Evaluation cancelled'));
    }
    this.clearActiveSession();

    if (this.worker && this.isSearching) {
      this.isSearching = false;
      this.isSyncing = true;
      try {
        this.worker.postMessage('stop');
        this.worker.postMessage('isready');
      } catch (e) {}
    }
  }

  public terminateCurrent() {
    this.stopCurrent();
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (e) {}
      this.worker = null;
    }
    this.isSearching = false;
    this.isSyncing = false;
    this.readyResolvers = [];
  }

  private initWorkerSettings(worker: Worker) {
    try {
      worker.postMessage('uci');
      // Set transposition table hash to 32MB for faster branch lookups and deeper search accuracy
      worker.postMessage('setoption name Hash value 32');
      worker.postMessage('setoption name Move Overhead value 10');
      worker.postMessage('isready');
    } catch (e) {}
  }

  private waitForReady(worker: Worker): Promise<void> {
    return new Promise<void>((resolve) => {
      this.readyResolvers.push(resolve);
      try {
        worker.postMessage('isready');
      } catch {
        resolve();
      }
    });
  }

  private getOrCreateWorker(): Worker {
    if (!this.worker) {
      try {
        this.worker = new Worker(this.activeScriptPath);
        this.worker.addEventListener('message', this.handleWorkerMessage.bind(this));
        this.worker.addEventListener('error', this.handleWorkerError.bind(this));
        this.initWorkerSettings(this.worker);
      } catch (err) {
        if (!this.hasWasmFailed && this.activeScriptPath !== this.asmScriptPath) {
          console.warn('[Stockfish] WASM worker failed to initialize, falling back to ASM.js:', err);
          this.hasWasmFailed = true;
          this.activeScriptPath = this.asmScriptPath;
          this.worker = new Worker(this.activeScriptPath);
          this.worker.addEventListener('message', this.handleWorkerMessage.bind(this));
          this.worker.addEventListener('error', this.handleWorkerError.bind(this));
          this.initWorkerSettings(this.worker);
        } else {
          throw err;
        }
      }
    }
    return this.worker;
  }

  private buildActiveResult(): EngineEvalResult {
    const moveEntries = Object.values(this.activeAllMoves);
    // Discard any moves that do not match the current position's active turn
    const validEntries = moveEntries
      .map(e => e.data)
      .filter(m => isMoveValidForFen(this.activeFen, m.move));

    // Sort by MultiPV rank order (#1, #2, #3, ...)
    validEntries.sort((a, b) => a.multiPvIndex - b.multiPvIndex);

    const best = this.activeBookResult
      ? this.activeBookResult.best
      : validEntries.slice(0, this.activeLimit).map((m, i) => ({ ...m, rank: i + 1 }));

    const worst = this.activeIncludeWorst
      ? validEntries.slice(-this.activeLimit).reverse().map((m, i) => ({ ...m, rank: i + 1 }))
      : [];

    const topMove = best[0];
    const positionEval = this.activeBookResult
      ? this.activeBookResult.positionEval
      : (topMove ? {
          scoreStr: topMove.scoreStr,
          evalWhiteStr: topMove.evalWhiteStr,
          numericScore: topMove.numericScore,
          scoreType: topMove.scoreType,
          rawScore: topMove.rawScore
        } : {
          scoreStr: '0.00',
          evalWhiteStr: '0.00',
          numericScore: 0,
          scoreType: 'cp',
          rawScore: 0
        });

    return { best, worst, positionEval };
  }

  private triggerProgress() {
    if (!this.activeOnProgress || !this.isSearching) return;
    const now = Date.now();
    if (now - this.activeLastProgressTime > 120) {
      this.activeLastProgressTime = now;
      if (this.activeProgressThrottleTimeout) {
        clearTimeout(this.activeProgressThrottleTimeout);
        this.activeProgressThrottleTimeout = null;
      }
      this.activeOnProgress(this.buildActiveResult());
    } else if (!this.activeProgressThrottleTimeout) {
      this.activeProgressThrottleTimeout = setTimeout(() => {
        this.activeProgressThrottleTimeout = null;
        if (this.isSearching && this.activeOnProgress) {
          this.activeLastProgressTime = Date.now();
          this.activeOnProgress(this.buildActiveResult());
        }
      }, 120);
    }
  }

  private handleWorkerMessage(e: MessageEvent) {
    const line = typeof e.data === 'string' ? e.data.trim() : '';
    if (!line) return;

    if (line === 'readyok') {
      this.isSyncing = false;
      const resolvers = [...this.readyResolvers];
      this.readyResolvers = [];
      resolvers.forEach(r => r());
      return;
    }

    // Ignore all output if syncing (waiting for worker to stop previous search) or not searching
    if (this.isSyncing || !this.isSearching) {
      return;
    }

    if (line.includes('info') && line.includes('multipv')) {
      const depthMatch = line.match(/\bdepth (\d+)\b/);
      const multiPvMatch = line.match(/\bmultipv (\d+)\b/);
      const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)\b/);
      const pvMatch = line.match(/\bpv (.+)/);

      if (depthMatch && multiPvMatch && scoreMatch && pvMatch) {
        const lineDepth = parseInt(depthMatch[1]);
        const multiPvIndex = parseInt(multiPvMatch[1]);
        const scoreType = scoreMatch[1];
        const scoreVal = parseInt(scoreMatch[2]);
        const pv = pvMatch[1].trim().split(/\s+/);

        if (pv.length > 0 && pv[0]) {
          const moveUci = pv[0];

          // Validate that the move originates from a piece belonging to the active color in activeFen
          if (!isMoveValidForFen(this.activeFen, moveUci)) {
            return;
          }

          const existing = this.activeAllMoves[multiPvIndex];
          if (!existing || lineDepth >= existing.depth) {
            let numericScore = 0;
            if (scoreType === 'mate') {
              numericScore = scoreVal > 0 ? 100000 - scoreVal : -100000 - scoreVal;
            } else {
              numericScore = scoreVal;
            }

            const activeColor = this.activeFen.split(' ')[1] || 'w';
            let evalWhiteStr = '';
            if (scoreType === 'mate') {
              const whiteMate = activeColor === 'b' ? -scoreVal : scoreVal;
              evalWhiteStr = whiteMate > 0 ? `#M${whiteMate}` : whiteMate < 0 ? `-#M${Math.abs(whiteMate)}` : '#M0';
            } else {
              const whiteCp = activeColor === 'b' ? -scoreVal : scoreVal;
              const val = whiteCp / 100;
              evalWhiteStr = val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
            }

            this.activeAllMoves[multiPvIndex] = {
              depth: lineDepth,
              data: {
                move: moveUci,
                rawScore: scoreVal,
                scoreType: scoreType,
                scoreStr: scoreType === 'mate' ? `Mate in ${Math.abs(scoreVal)}` : `${(scoreVal / 100).toFixed(2)}`,
                evalWhiteStr: evalWhiteStr,
                numericScore: numericScore,
                multiPvIndex: multiPvIndex,
                pv: pv
              }
            };

            this.triggerProgress();
          }
        }
      }
    }

    if (line.includes('bestmove')) {
      this.isSearching = false;
      const finalResult = this.buildActiveResult();

      // Save to LRU cache
      if (this.activeCacheKey) {
        if (this.cache.size >= this.maxCacheSize) {
          const oldestKey = this.cache.keys().next().value;
          if (oldestKey) this.cache.delete(oldestKey);
        }
        this.cache.set(this.activeCacheKey, JSON.parse(JSON.stringify(finalResult)));
      }

      const resolver = this.activeResolve;
      this.clearActiveSession();
      if (resolver) {
        resolver(finalResult);
      }
    }
  }

  private handleWorkerError(err: ErrorEvent) {
    this.terminateCurrent();
    if (!this.hasWasmFailed && this.activeScriptPath !== this.asmScriptPath) {
      console.warn('[Stockfish] WASM worker runtime error, switching to ASM.js fallback:', err);
      this.hasWasmFailed = true;
      this.activeScriptPath = this.asmScriptPath;
    }
    if (this.activeReject) {
      this.activeReject(err.error || new Error('Worker evaluation error'));
    }
    this.clearActiveSession();
  }

  public async evaluate(options: EvaluateOptions): Promise<EngineEvalResult> {
    const { fen, depth = 14, limit = 5, includeWorst = false, onProgress, signal } = options;
    const cacheKey = this.getCacheKey(fen, depth, limit, includeWorst);

    // 1. Instant Cache Return
    const cachedResult = this.getCachedResult(options);
    if (cachedResult) {
      if (onProgress) {
        onProgress(cachedResult);
      }
      return cachedResult;
    }

    // 2. Instant Opening Book Return
    const bookResult = getOpeningBookResult(fen, limit);
    if (bookResult && !includeWorst) {
      if (this.cache.size >= this.maxCacheSize) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) this.cache.delete(oldestKey);
      }
      this.cache.set(cacheKey, JSON.parse(JSON.stringify(bookResult)));
      if (onProgress) {
        onProgress(bookResult);
      }
      // Stop background search cleanly if any was in progress
      this.stopCurrent();
      return bookResult;
    }

    // If opening book is present and worst moves are also requested, provide instant progressive feedback
    if (bookResult && onProgress) {
      onProgress(bookResult);
    }

    const sessionId = ++this.currentSessionId;

    let worker: Worker;
    try {
      worker = this.getOrCreateWorker();
    } catch (err) {
      this.terminateCurrent();
      throw err;
    }

    // If worker was already actively calculating a previous position, cancel cleanly and wait for readyok
    if (this.isSearching) {
      if (this.activeReject) {
        this.activeReject(new Error('Evaluation cancelled'));
      }
      this.clearActiveSession();
      this.isSearching = false;
      this.isSyncing = true;
      try {
        worker.postMessage('stop');
      } catch (e) {}
      await this.waitForReady(worker);
    }

    // If another evaluate request arrived while waiting for ready, cancel this request
    if (sessionId !== this.currentSessionId) {
      throw new Error('Evaluation cancelled');
    }

    if (signal?.aborted) {
      throw new Error('Evaluation cancelled');
    }

    const moveCount = typeof limit === 'number' && limit > 0 ? limit : 5;
    const multiPvValue = includeWorst ? 10 : moveCount;

    return new Promise<EngineEvalResult>((resolve, reject) => {
      this.activeResolve = resolve;
      this.activeReject = reject;
      this.activeOnProgress = onProgress || null;
      this.activeFen = fen;
      this.activeLimit = moveCount;
      this.activeIncludeWorst = includeWorst;
      this.activeBookResult = bookResult;
      this.activeCacheKey = cacheKey;
      this.activeAllMoves = {};
      this.activeLastProgressTime = 0;
      this.isSearching = true;

      const abortHandler = () => {
        if (this.currentSessionId === sessionId) {
          this.stopCurrent();
          reject(new Error('Evaluation cancelled'));
        }
      };

      if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      try {
        worker.postMessage(`setoption name MultiPV value ${multiPvValue}`);
        worker.postMessage(`position fen ${fen}`);
        worker.postMessage(`go depth ${depth}`);
      } catch (err) {
        this.clearActiveSession();
        this.isSearching = false;
        reject(err);
      }
    });
  }
}

export const stockfishClient = new StockfishClient();
