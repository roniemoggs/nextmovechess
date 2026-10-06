import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard, ChessboardProvider, SparePiece, type ChessboardOptions } from 'react-chessboard';
import { stockfishClient } from '../lib/stockfish-client';
import { ChessPiece } from './chess/ChessPiece';
import { getChessToolTranslations, type ChessToolTranslations } from '../i18n/chessTool';
import { getLangFromUrl } from '../i18n/utils';
import { type SupportedLanguage, defaultLang } from '../i18n/ui';

type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
type PieceColor = 'w' | 'b';
type PaletteTool = 'k' | 'q' | 'r' | 'b' | 'n' | 'p' | 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'delete' | null;

export interface BoardThemeConfig {
  id: string;
  name: string;
  darkSquare: string;
  lightSquare: string;
  previewBgDark: string;
  previewBgLight: string;
}

export const BOARD_THEMES: BoardThemeConfig[] = [
  { id: 'ocean', name: 'Ocean Blue', darkSquare: '#4e7399', lightSquare: '#c3d7ec', previewBgDark: '#4e7399', previewBgLight: '#c3d7ec' },
  { id: 'slate', name: 'Modern Slate', darkSquare: '#334155', lightSquare: '#94a3b8', previewBgDark: '#334155', previewBgLight: '#94a3b8' },
  { id: 'emerald', name: 'Emerald Green', darkSquare: '#769656', lightSquare: '#eeeed2', previewBgDark: '#769656', previewBgLight: '#eeeed2' },
  { id: 'wood', name: 'Classic Wood', darkSquare: '#b58863', lightSquare: '#f0d9b5', previewBgDark: '#b58863', previewBgLight: '#f0d9b5' },
  { id: 'midnight', name: 'Midnight Obsidian', darkSquare: '#1e293b', lightSquare: '#475569', previewBgDark: '#1e293b', previewBgLight: '#475569' },
  { id: 'walnut', name: 'Tournament Walnut', darkSquare: '#8c5836', lightSquare: '#e6cfa8', previewBgDark: '#8c5836', previewBgLight: '#e6cfa8' },
];

const AUDIO_CACHE: Record<string, HTMLAudioElement> = {};

function getAudio(src: string): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!AUDIO_CACHE[src]) {
    try {
      const audio = new Audio(src);
      audio.preload = 'auto';
      AUDIO_CACHE[src] = audio;
    } catch (e) {
      return null;
    }
  }
  return AUDIO_CACHE[src];
}

function playMoveSound(type: 'move' | 'capture' | 'check' | 'checkmate' | 'castle' | 'promote' | 'reset' = 'move') {
  if (typeof window === 'undefined') return;
  try {
    const soundFile = `/sounds/${type}.mp3`;
    const audio = getAudio(soundFile);
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {
        try {
          const fresh = new Audio(soundFile);
          fresh.play().catch(() => {});
        } catch (e) {}
      });
    }
  } catch (e) {}
}

const BLACK_PALETTE: ('k' | 'q' | 'r' | 'b' | 'n' | 'p')[] = ['k', 'q', 'r', 'b', 'n', 'p'];
const WHITE_PALETTE: ('K' | 'Q' | 'R' | 'B' | 'N' | 'P')[] = ['K', 'Q', 'R', 'B', 'N', 'P'];

function getPieceFullName(pieceChar: string, t?: ChessToolTranslations): string {
  const map: Record<string, string> = {
    'k': t ? t.king : 'King',
    'q': t ? t.queen : 'Queen',
    'r': t ? t.rook : 'Rook',
    'b': t ? t.bishop : 'Bishop',
    'n': t ? t.knight : 'Knight',
    'p': t ? t.pawn : 'Pawn',
    'K': t ? t.king : 'King',
    'Q': t ? t.queen : 'Queen',
    'R': t ? t.rook : 'Rook',
    'B': t ? t.bishop : 'Bishop',
    'N': t ? t.knight : 'Knight',
    'P': t ? t.pawn : 'Pawn',
    'delete': t ? t.eraserTool : 'Eraser Tool'
  };
  return map[pieceChar] || pieceChar;
}

function getDifficultyLabel(cat: 'Obvious' | 'Easy' | 'Normal' | 'Tricky' | 'Hard' | string, t: ChessToolTranslations): string {
  switch (cat) {
    case 'Obvious': return t.diffObvious;
    case 'Easy': return t.diffEasy;
    case 'Normal': return t.diffNormal;
    case 'Tricky': return t.diffTricky;
    case 'Hard': return t.diffHard;
    default: return cat;
  }
}

function getPieceSymbol(pieceChar: string): string {
  const map: Record<string, string> = {
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'delete': '✕'
  };
  return map[pieceChar] || pieceChar;
}

function pieceCharToSparePieceType(char: string): string {
  const isWhite = char === char.toUpperCase();
  const lower = char.toLowerCase();
  const colorPrefix = isWhite ? 'w' : 'b';
  const pieceUpper = lower.toUpperCase();
  return `${colorPrefix}${pieceUpper}`;
}

function getKingSquareFromGame(gameInstance: Chess, color: 'w' | 'b'): string | null {
  try {
    const board = gameInstance.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === color) {
          const file = String.fromCharCode(97 + c);
          const rank = 8 - r;
          return `${file}${rank}`;
        }
      }
    }
  } catch (e) {}
  return null;
}

function boardToFen(
  board: Record<string, { type: PieceType; color: PieceColor } | null>,
  turn: PieceColor,
  castling: { K: boolean; Q: boolean; k: boolean; q: boolean },
  enPassant: string = '-'
): string {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
  const fenRanks: string[] = [];

  for (const rank of ranks) {
    let emptyCount = 0;
    let rankStr = '';
    for (const file of files) {
      const square = `${file}${rank}`;
      const piece = board[square];
      if (!piece) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          rankStr += emptyCount;
          emptyCount = 0;
        }
        const char = piece.type;
        rankStr += piece.color === 'w' ? char.toUpperCase() : char.toLowerCase();
      }
    }
    if (emptyCount > 0) {
      rankStr += emptyCount;
    }
    fenRanks.push(rankStr || '8');
  }

  let castlingStr = '';
  if (castling.K) castlingStr += 'K';
  if (castling.Q) castlingStr += 'Q';
  if (castling.k) castlingStr += 'k';
  if (castling.q) castlingStr += 'q';
  if (!castlingStr) castlingStr = '-';

  return `${fenRanks.join('/')} ${turn} ${castlingStr} ${enPassant} 0 1`;
}

function fenToBoard(fen: string): {
  board: Record<string, { type: PieceType; color: PieceColor } | null>;
  turn: PieceColor;
  castling: { K: boolean; Q: boolean; k: boolean; q: boolean };
} {
  const parts = fen.trim().split(/\s+/);
  const placement = parts[0] || '8/8/8/8/8/8/8/8';
  const turn = (parts[1] === 'b' ? 'b' : 'w') as PieceColor;
  const castlingStr = parts[2] || '-';
  const castling = {
    K: castlingStr.includes('K'),
    Q: castlingStr.includes('Q'),
    k: castlingStr.includes('k'),
    q: castlingStr.includes('q'),
  };

  const board: Record<string, { type: PieceType; color: PieceColor } | null> = {};
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

  for (const r of ranks) {
    for (const f of files) {
      board[`${f}${r}`] = null;
    }
  }

  const rows = placement.split('/');
  for (let rIdx = 0; rIdx < Math.min(rows.length, 8); rIdx++) {
    const rank = ranks[rIdx];
    const rowStr = rows[rIdx];
    let fileIdx = 0;
    for (let i = 0; i < rowStr.length; i++) {
      const char = rowStr[i];
      if (char >= '1' && char <= '8') {
        fileIdx += parseInt(char, 10);
      } else {
        const file = files[fileIdx];
        if (file) {
          const isWhite = char === char.toUpperCase();
          const type = char.toLowerCase() as PieceType;
          board[`${file}${rank}`] = { type, color: isWhite ? 'w' : 'b' };
        }
        fileIdx++;
      }
    }
  }

  return { board, turn, castling };
}

function validatePositionBeforeDone(
  board: Record<string, { type: PieceType; color: PieceColor } | null>,
  turn: PieceColor,
  castling: { K: boolean; Q: boolean; k: boolean; q: boolean }
): { valid: boolean; error?: string; fen?: string } {
  let whiteKings = 0;
  let blackKings = 0;
  let whiteKingSquare = '';
  let blackKingSquare = '';
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];

  for (const f of files) {
    for (const r of ranks) {
      const sq = `${f}${r}`;
      const p = board[sq];
      if (!p) continue;
      if (p.type === 'k') {
        if (p.color === 'w') {
          whiteKings++;
          whiteKingSquare = sq;
        } else {
          blackKings++;
          blackKingSquare = sq;
        }
      }
      if (p.type === 'p') {
        if (r === '1' || r === '8') {
          return { valid: false, error: `Pawns cannot be placed on the 1st or 8th rank (${sq.toUpperCase()}).` };
        }
      }
    }
  }

  if (whiteKings === 0) {
    return { valid: false, error: 'White King (♔) is missing! Please place a White King on the board.' };
  }
  if (whiteKings > 1) {
    return { valid: false, error: `Position has ${whiteKings} White Kings. Only 1 White King is allowed.` };
  }
  if (blackKings === 0) {
    return { valid: false, error: 'Black King (♚) is missing! Please place a Black King on the board.' };
  }
  if (blackKings > 1) {
    return { valid: false, error: `Position has ${blackKings} Black Kings. Only 1 Black King is allowed.` };
  }

  // Check adjacent kings
  const wFile = whiteKingSquare.charCodeAt(0) - 97;
  const wRank = parseInt(whiteKingSquare[1], 10);
  const bFile = blackKingSquare.charCodeAt(0) - 97;
  const bRank = parseInt(blackKingSquare[1], 10);

  if (Math.abs(wFile - bFile) <= 1 && Math.abs(wRank - bRank) <= 1) {
    return { valid: false, error: 'White and Black Kings cannot be placed adjacent to each other.' };
  }

  // Auto-adjust impossible castling rights if kings or rooks moved
  const safeCastling = { ...castling };
  if (board['e1']?.type !== 'k' || board['e1']?.color !== 'w') {
    safeCastling.K = false;
    safeCastling.Q = false;
  } else {
    if (board['h1']?.type !== 'r' || board['h1']?.color !== 'w') safeCastling.K = false;
    if (board['a1']?.type !== 'r' || board['a1']?.color !== 'w') safeCastling.Q = false;
  }
  if (board['e8']?.type !== 'k' || board['e8']?.color !== 'b') {
    safeCastling.k = false;
    safeCastling.q = false;
  } else {
    if (board['h8']?.type !== 'r' || board['h8']?.color !== 'b') safeCastling.k = false;
    if (board['a8']?.type !== 'r' || board['a8']?.color !== 'b') safeCastling.q = false;
  }

  const fen = boardToFen(board, turn, safeCastling);

  try {
    const testGame = new Chess(fen);
    return { valid: true, fen: testGame.fen() };
  } catch (err: any) {
    return { valid: false, error: `Invalid chess position: ${err.message || "Opponent's king cannot be in check."}` };
  }
}

interface CustomArrowData {
  id: string;
  startSquare: string;
  endSquare: string;
  color: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  label: string;
  type: 'best' | 'worst';
  moveString: string;
}

type DifficultyCategory = 'Obvious' | 'Easy' | 'Normal' | 'Tricky' | 'Hard';

interface DifficultyPresetRange {
  min: number;
  max: number;
}

type DifficultyPresetsMap = Record<DifficultyCategory, DifficultyPresetRange>;

const DEFAULT_DIFFICULTY_PRESETS: DifficultyPresetsMap = {
  Obvious: { min: 0, max: 3 },
  Easy: { min: 0, max: 5 },
  Normal: { min: 8, max: 30 },
  Tricky: { min: 3, max: 15 },
  Hard: { min: 9, max: 30 },
};

function getEffectiveDifficultyPreset(
  cat: DifficultyCategory,
  currentPresets: DifficultyPresetsMap,
  gameInstance?: any
): DifficultyPresetRange {
  const current = currentPresets[cat] || DEFAULT_DIFFICULTY_PRESETS[cat] || { min: 0, max: 5 };
  if (cat === 'Easy') {
    const plyCount = typeof gameInstance?.history === 'function' ? gameInstance.history().length : 0;
    const isFirst10Moves = Math.floor(plyCount / 2) < 10;
    const isDefault = (current.min === 0 && (current.max === 5 || current.max === 10)) || (current.min === 3 && current.max === 10);
    if (isDefault) {
      return isFirst10Moves ? { min: 0, max: 5 } : { min: 0, max: 10 };
    }
  }
  return current;
}



const CustomChessArrows = memo(function CustomChessArrows({
  arrows,
  hoveredMove,
  orientation = 'white',
}: {
  arrows: CustomArrowData[];
  hoveredMove: string | null;
  orientation?: 'white' | 'black';
}) {
  if (!arrows || arrows.length === 0) return null;

  function getSquareCenter(sq: string) {
    const file = sq.charCodeAt(0) - 97; // 'a' -> 0, 'h' -> 7
    const rank = parseInt(sq[1], 10);   // 1 to 8

    let col = file;
    let row = 8 - rank;

    if (orientation === 'black') {
      col = 7 - file;
      row = rank - 1;
    }

    return {
      x: (col + 0.5) * 12.5,
      y: (row + 0.5) * 12.5,
    };
  }

  // Pre-calculate geometry for all arrows
  const arrowGeometries = arrows.map((arrow) => {
    const start = getSquareCenter(arrow.startSquare);
    const end = getSquareCenter(arrow.endSquare);

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return null;

    const ux = dx / dist;
    const uy = dy / dist;
    const nx = -uy;
    const ny = ux;

    const isHovered = hoveredMove === arrow.moveString;
    // Translucent shafts by default (0.55 opacity), bright on hover (0.95), dim when non-hovered (0.18)
    const shaftOpacity = hoveredMove ? (isHovered ? 0.95 : 0.18) : 0.55;
    const badgeOpacity = hoveredMove ? (isHovered ? 1 : 0.3) : 0.95;

    const sx = start.x + ux * 2.2;
    const sy = start.y + uy * 2.2;

    const ex = end.x - ux * 2.2;
    const ey = end.y - uy * 2.2;

    const headLength = Math.min(4.0, dist * 0.35);
    const headWidth = 3.8;

    const bx = ex - ux * headLength;
    const by = ey - uy * headLength;

    const hx1 = bx + nx * (headWidth / 2);
    const hy1 = by + ny * (headWidth / 2);
    const hx2 = bx - nx * (headWidth / 2);
    const hy2 = by - ny * (headWidth / 2);

    const badgeRadius = isHovered ? 3.1 : 2.5;

    const badgeOffsetFromTip = Math.min(dist * 0.65, headLength + badgeRadius + 0.5);
    const badgeX = ex - ux * badgeOffsetFromTip;
    const badgeY = ey - uy * badgeOffsetFromTip;

    return {
      arrow,
      isHovered,
      shaftOpacity,
      badgeOpacity,
      sx, sy, ex, ey, bx, by,
      hx1, hy1, hx2, hy2,
      badgeX, badgeY, badgeRadius
    };
  }).filter(Boolean);

  // Sort so lower-ranked moves (e.g. #5, #4, #3, #2) are drawn first at the bottom layer,
  // and the #1 (top move) is drawn last (topmost on the z-stack).
  // If an arrow is actively hovered, it is drawn very last on top of everything.
  const sortedGeometries = [...arrowGeometries].sort((a: any, b: any) => {
    if (a.isHovered && !b.isHovered) return 1;
    if (!a.isHovered && b.isHovered) return -1;

    const rankA = parseInt(a.arrow.label, 10) || 0;
    const rankB = parseInt(b.arrow.label, 10) || 0;
    if (rankA !== rankB) {
      return rankB - rankA; // Higher numbers (e.g. 5) render first (bottom), #1 renders last (top)
    }

    return 0;
  });

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ pointerEvents: 'none' }}
    >
      {/* PASS 1: All Arrow Shafts & Arrowheads (Translucent) */}
      <g style={{ pointerEvents: 'none' }}>
        {sortedGeometries.map((geo: any) => (
          <g key={`shaft-${geo.arrow.id}`} style={{ transition: 'opacity 0.15s ease-in-out', pointerEvents: 'none' }}>
            {/* Arrow shaft line */}
            <line
              x1={geo.sx}
              y1={geo.sy}
              x2={geo.bx}
              y2={geo.by}
              stroke={geo.arrow.color}
              strokeWidth={geo.isHovered ? '2.5' : '1.9'}
              strokeLinecap="round"
              opacity={geo.shaftOpacity}
              style={{ pointerEvents: 'none' }}
            />

            {/* Arrowhead polygon */}
            <polygon
              points={`${geo.ex},${geo.ey} ${geo.hx1},${geo.hy1} ${geo.hx2},${geo.hy2}`}
              fill={geo.arrow.color}
              opacity={geo.shaftOpacity}
              style={{ pointerEvents: 'none' }}
            />
          </g>
        ))}
      </g>

      {/* PASS 2: All Number Badges (Rendered ON TOP of all shafts) */}
      <g style={{ pointerEvents: 'none' }}>
        {sortedGeometries.map((geo: any) => (
          <g
            key={`badge-${geo.arrow.id}`}
            transform={`translate(${geo.badgeX}, ${geo.badgeY})`}
            opacity={geo.badgeOpacity}
            style={{ transition: 'opacity 0.15s ease-in-out', pointerEvents: 'none' }}
          >
            {/* Outer stroke ring */}
            <circle
              r={geo.badgeRadius + 0.35}
              fill={geo.isHovered ? '#ffffff' : geo.arrow.badgeBorder}
              style={{ pointerEvents: 'none' }}
            />
            {/* Main badge circle */}
            <circle
              r={geo.badgeRadius}
              fill={geo.isHovered ? (geo.arrow.type === 'best' ? '#15803d' : '#991b1b') : geo.arrow.badgeBg}
              style={{ pointerEvents: 'none' }}
            />
            {/* Number Label */}
            <text
              x="0"
              y="0.1"
              fill={geo.arrow.badgeText}
              fontSize={geo.isHovered ? (geo.arrow.label.length > 1 ? '2.3' : '2.8') : (geo.arrow.label.length > 1 ? '1.9' : '2.4')}
              fontWeight="900"
              fontFamily="system-ui, -apple-system, sans-serif"
              textAnchor="middle"
              dominantBaseline="central"
              style={{ pointerEvents: 'none' }}
            >
              {geo.arrow.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
});

export default function Home({
  initialFen,
  isEmbedded = false,
  lang,
}: {
  initialFen?: string;
  isEmbedded?: boolean;
  lang?: SupportedLanguage;
} = {}) {
  const activeLang: SupportedLanguage = lang || (typeof window !== 'undefined' ? getLangFromUrl(window.location.pathname) : defaultLang);
  const t = useMemo(() => getChessToolTranslations(activeLang), [activeLang]);

  const [game, setGame] = useState(() => {
    if (initialFen) {
      try {
        return new Chess(initialFen);
      } catch (e) {
        console.warn('Invalid initial FEN, defaulting to standard starting position:', e);
      }
    }
    return new Chess();
  });
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [stockfishEnabled, setStockfishEnabled] = useState(true);
  const [moveLimit, setMoveLimit] = useState<5 | 10>(5);
  const [gameMode, setGameMode] = useState<'standard' | 'random' | 'human'>('standard');
  const [humanSkillLevel, setHumanSkillLevel] = useState<'club' | 'intermediate' | 'advanced' | 'master'>('intermediate');
  const [evaluating, setEvaluating] = useState(false);
  const [bestMoves, setBestMoves] = useState<any[]>([]);
  const [randomGoodMoves, setRandomGoodMoves] = useState<any[]>([]);
  const [worstMoves, setWorstMoves] = useState<any[]>([]);
  const [positionEval, setPositionEval] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  // Reset Board Confirmation Modal state
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [redoStack, setRedoStack] = useState<any[]>([]);

  // Theme & Customization state
  const [boardTheme, setBoardTheme] = useState<string>('ocean');
  const [showCoordinates, setShowCoordinates] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [copiedShareUrl, setCopiedShareUrl] = useState<boolean>(false);

  // FEN interaction state
  const [copiedFen, setCopiedFen] = useState(false);
  const [showLoadFenModal, setShowLoadFenModal] = useState(false);
  const [fenInput, setFenInput] = useState('');
  const [fenLoadError, setFenLoadError] = useState<string | null>(null);

  // Initial URL hydration & local storage settings load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 1. Hydrate from URL query parameter ?fen=...
      try {
        const params = new URLSearchParams(window.location.search);
        const urlFen = params.get('fen');
        if (urlFen && urlFen.trim()) {
          const testGame = new Chess(urlFen.trim());
          setGame(testGame);
        }
      } catch (e) {
        console.warn('Could not parse FEN from URL param:', e);
      }

      // 2. Load stored preferences from localStorage
      try {
        const saved = localStorage.getItem('nmc_board_settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.theme && BOARD_THEMES.some(t => t.id === parsed.theme)) {
            setBoardTheme(parsed.theme);
          }
          if (parsed.showCoordinates !== undefined) {
            setShowCoordinates(Boolean(parsed.showCoordinates));
          }
          if (parsed.soundEnabled !== undefined) {
            setSoundEnabled(Boolean(parsed.soundEnabled));
          }
        }
      } catch (e) {}
    }
  }, []);

  // Save settings when changed
  const updateBoardTheme = (themeId: string) => {
    setBoardTheme(themeId);
    try {
      const current = JSON.parse(localStorage.getItem('nmc_board_settings') || '{}');
      localStorage.setItem('nmc_board_settings', JSON.stringify({ ...current, theme: themeId }));
    } catch (e) {}
  };

  const updateShowCoordinates = (show: boolean) => {
    setShowCoordinates(show);
    try {
      const current = JSON.parse(localStorage.getItem('nmc_board_settings') || '{}');
      localStorage.setItem('nmc_board_settings', JSON.stringify({ ...current, showCoordinates: show }));
    } catch (e) {}
  };

  const updateSoundEnabled = (sound: boolean) => {
    setSoundEnabled(sound);
    try {
      const current = JSON.parse(localStorage.getItem('nmc_board_settings') || '{}');
      localStorage.setItem('nmc_board_settings', JSON.stringify({ ...current, soundEnabled: sound }));
    } catch (e) {}
  };

  // Edit Position Feature state
  const [isEditingPosition, setIsEditingPosition] = useState(false);
  const [editBoard, setEditBoard] = useState<Record<string, { type: PieceType; color: PieceColor } | null>>({});
  const [editTurn, setEditTurn] = useState<PieceColor>('w');
  const [editCastling, setEditCastling] = useState({ K: true, Q: true, k: true, q: true });
  const [selectedPaletteTool, setSelectedPaletteTool] = useState<PaletteTool>(null);
  const [editValidationWarning, setEditValidationWarning] = useState<string | null>(null);
  const [savedFenBeforeEdit, setSavedFenBeforeEdit] = useState<string | null>(null);

  // Synchronize URL search params with current board position
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const currentFen = isEditingPosition ? boardToFen(editBoard, editTurn, editCastling) : game.fen();
        const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        const url = new URL(window.location.href);
        if (currentFen === startFen) {
          url.searchParams.delete('fen');
        } else {
          url.searchParams.set('fen', currentFen);
        }
        window.history.replaceState(null, '', url.pathname + url.search);
      } catch (e) {}
    }
  }, [game, editBoard, editTurn, editCastling, isEditingPosition]);

  // Random Good Moves Feature state (Full Control Mode)
  const [randomGoodMovesEnabled, setRandomGoodMovesEnabled] = useState(true);

  // Random Bad Move Feature state
  const [randomBadMoveEnabled, setRandomBadMoveEnabled] = useState(false);
  const [consecutiveGoodMoves, setConsecutiveGoodMoves] = useState(0);
  const [isBadMoveActive, setIsBadMoveActive] = useState(false);
  const [activeBadMove, setActiveBadMove] = useState<any>(null);

  // Opponent Move Suggestions state (Full Control Mode Only)
  const [showOpponentMoves, setShowOpponentMoves] = useState(true);

  // Timing Feature state for Move Suggestions in Random & Human Mode
  const [timingEnabled, setTimingEnabled] = useState(true);
  const [thinkOurTurnOnly, setThinkOurTurnOnly] = useState(true);
  const [connectDifficultyDelay, setConnectDifficultyDelay] = useState(true);
  const [difficultyPresets, setDifficultyPresets] = useState<DifficultyPresetsMap>(DEFAULT_DIFFICULTY_PRESETS);
  const [showDifficultyPresetsEditor, setShowDifficultyPresetsEditor] = useState(false);
  const [minDelay, setMinDelay] = useState(5);
  const [maxDelay, setMaxDelay] = useState(15);
  const [isDelaying, setIsDelaying] = useState(false);
  const [delayRemaining, setDelayRemaining] = useState(0);
  const [totalDelay, setTotalDelay] = useState(0);

  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleMinDelayChange = (val: number) => {
    const clamped = Math.max(0, Math.min(60, val));
    setMinDelay(clamped);
    if (clamped > maxDelay) {
      setMaxDelay(clamped);
    }
  };

  const handleMaxDelayChange = (val: number) => {
    const clamped = Math.max(0, Math.min(60, val));
    setMaxDelay(clamped);
    if (clamped < minDelay) {
      setMinDelay(clamped);
    }
  };

  const handleDifficultyPresetChange = (
    cat: DifficultyCategory,
    field: 'min' | 'max',
    value: number
  ) => {
    const val = Math.max(0, Math.min(60, isNaN(value) ? 0 : value));
    setDifficultyPresets((prev) => {
      const current = prev[cat];
      let newMin = field === 'min' ? val : current.min;
      let newMax = field === 'max' ? val : current.max;

      if (field === 'min' && newMin > newMax) {
        newMax = newMin;
      } else if (field === 'max' && newMax < newMin) {
        newMin = newMax;
      }

      return {
        ...prev,
        [cat]: { min: newMin, max: newMax },
      };
    });
  };

  const handleResetDifficultyPresets = () => {
    setDifficultyPresets(DEFAULT_DIFFICULTY_PRESETS);
  };

  function clearDelayTimers() {
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    if (delayIntervalRef.current) {
      clearInterval(delayIntervalRef.current);
      delayIntervalRef.current = null;
    }
    setIsDelaying(false);
    setDelayRemaining(0);
  }

  function triggerSuggestionDelay(overrideMin?: number, overrideMax?: number, movesOverride?: any[]) {
    clearDelayTimers();

    if (gameMode !== 'random' && gameMode !== 'human') {
      setIsDelaying(false);
      return;
    }

    const ourColor = boardOrientation === 'white' ? 'w' : 'b';
    if ((gameMode === 'human' || gameMode === 'random') && thinkOurTurnOnly && game.turn() !== ourColor) {
      setIsDelaying(false);
      return;
    }

    let minSec = overrideMin !== undefined ? overrideMin : minDelay;
    let maxSec = overrideMax !== undefined ? overrideMax : maxDelay;

    if (overrideMin === undefined && overrideMax === undefined && (connectDifficultyDelay || gameMode === 'human')) {
      const movesToUse = movesOverride || bestMoves;
      const diff = getPositionDifficulty(movesToUse);
      const cat: DifficultyCategory = diff?.catName || 'Normal';
      const preset = getEffectiveDifficultyPreset(cat, difficultyPresets, game);
      minSec = preset.min;
      maxSec = preset.max;
    }

    const safeMin = Math.max(0, Math.min(60, minSec));
    const safeMax = Math.max(safeMin, Math.min(60, maxSec));

    const randomSec = safeMin + Math.random() * (safeMax - safeMin);
    const chosenDelaySec = Math.min(60, Math.max(0, Math.round(randomSec)));

    if (chosenDelaySec <= 0) {
      setIsDelaying(false);
      return;
    }

    setIsDelaying(true);
    setTotalDelay(chosenDelaySec);
    setDelayRemaining(chosenDelaySec);

    const startTime = Date.now();
    const endTime = startTime + chosenDelaySec * 1000;

    delayIntervalRef.current = setInterval(() => {
      const remainingMs = endTime - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setDelayRemaining(remainingSec);

      if (remainingMs <= 0) {
        if (delayIntervalRef.current) {
          clearInterval(delayIntervalRef.current);
          delayIntervalRef.current = null;
        }
        setIsDelaying(false);
      }
    }, 200);

    delayTimerRef.current = setTimeout(() => {
      clearDelayTimers();
    }, chosenDelaySec * 1000);
  }

  useEffect(() => {
    return () => {
      clearDelayTimers();
    };
  }, []);

  // Arrow filters & hover state
  const [showBest, setShowBest] = useState(true);
  const [showWorst, setShowWorst] = useState(false);
  const [hoveredMove, setHoveredMove] = useState<string | null>(null);

  // Click-to-move & move preview state
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, any>>({});

  const reqIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Helper to determine good move pool size based on exception conditions
  function getGoodMovePoolLimit(historyCount?: number): { limit: number; condition: string } {
    const hCount = typeof historyCount === 'number' ? historyCount : game.history().length;
    const ourMovesCount = Math.floor(hCount / 2);

    // Condition 1 — First 3 Moves: Select suggestions only from Top 1–2 moves
    if (ourMovesCount < 3) {
      return {
        limit: 2,
        condition: `Condition 1 (Move ${ourMovesCount + 1}/3): Top 1–2`,
      };
    }

    // Standard Rule 2: Top 1–5
    return {
      limit: 5,
      condition: 'Rule 2: Top 1–5',
    };
  }

  // Good Move Selection Logic (supports Condition 2: Forced Mate in <= 3 or Obvious positions, Condition 1: First 3 moves, and Rule 2)
  function pickTwoRandomGoodMoves(moves: any[], historyCount?: number) {
    if (!moves || moves.length === 0) return [];

    // Ensure moves are unique by UCI move string
    const uniqueMoves = moves.filter((m, index, self) => index === self.findIndex((t) => t.move === m.move));

    const topMove = uniqueMoves[0];
    // Condition 2 — Forced Checkmate in 3 or Less (Highest Priority)
    if (topMove && topMove.scoreType === 'mate' && topMove.rawScore > 0 && topMove.rawScore <= 3) {
      return [topMove];
    }

    // Obvious Position Exception — strictly suggest only Top 1 move when position is Obvious
    const diff = getPositionDifficulty(uniqueMoves);
    if (diff && diff.catName === 'Obvious') {
      return [topMove];
    }

    const { limit } = getGoodMovePoolLimit(historyCount);
    const pool = uniqueMoves.slice(0, limit);

    if (pool.length <= 2) {
      return [...pool].sort((a, b) => (a.rank || 0) - (b.rank || 0));
    }

    const idx1 = Math.floor(Math.random() * pool.length);
    let idx2 = Math.floor(Math.random() * (pool.length - 1));
    if (idx2 >= idx1) idx2++;

    return [pool[idx1], pool[idx2]].sort((a, b) => (a.rank || 0) - (b.rank || 0));
  }

  // Selection logic for Random Bad Move Feature
  function selectMoveSuggestions(
    best: any[],
    worst: any[],
    goodCount: number,
    featureEnabled: boolean,
    historyCount?: number
  ) {
    if (!best || best.length === 0) {
      return { moves: [], isBadMove: false, badMove: null };
    }

    if (featureEnabled) {
      // Rule 1: High probability (~95% good moves, 5% bad moves) for 1–17 consecutive good moves
      // Rule 2: After 18 consecutive good moves, 50% probability of selecting a random bad move
      const triggerProb = goodCount >= 18 ? 0.50 : 0.05;
      const shouldTriggerBad = Math.random() < triggerProb;

      if (shouldTriggerBad && worst && worst.length > 0) {
        // Triggered Bad Move Pool Range: strictly select from the 9th or 10th move (or fallback to last 2 moves)
        const badPool = worst.length >= 10
          ? worst.slice(8, 10)
          : worst.slice(Math.max(0, worst.length - 2));
        const randomIdx = Math.floor(Math.random() * badPool.length);
        const badMoveObj = { ...badPool[randomIdx], isTriggeredBadMove: true };
        return { moves: [badMoveObj], isBadMove: true, badMove: badMoveObj };
      }
    }

    const goodMoves = pickTwoRandomGoodMoves(best, historyCount);
    return { moves: goodMoves, isBadMove: false, badMove: null };
  }

  // Helper to generate rich human-like move categorization, reasoning, and intuition scores
  function getHumanMoveDetails(moveUci: string, gameInstance: Chess, rankIndex: number) {
    if (!moveUci || moveUci.length < 4) {
      return {
        san: moveUci,
        pieceName: 'Piece',
        category: 'General',
        styleTag: '♟️ Positional',
        badgeColor: 'bg-sky-950 text-sky-300 border-sky-800',
        explanation: 'Natural practical candidate move.',
        humanScore: 85,
      };
    }

    const from = moveUci.substring(0, 2);
    const to = moveUci.substring(2, 4);
    const promo = moveUci.length > 4 ? moveUci[4] : undefined;

    const legalMoves = gameInstance.moves({ verbose: true });
    const matched = legalMoves.find(
      (m) => m.from === from && m.to === to && (!promo || m.promotion === promo)
    );

    const san = matched ? matched.san : moveUci;
    const pieceType = matched ? matched.piece : 'p';
    const isCapture = Boolean(matched && matched.captured);
    const isCheck = Boolean(san.includes('+') || san.includes('#'));
    const isCastle = Boolean(matched && (matched.flags.includes('k') || matched.flags.includes('q')));

    let pieceName = 'Pawn';
    if (pieceType === 'n') pieceName = 'Knight';
    else if (pieceType === 'b') pieceName = 'Bishop';
    else if (pieceType === 'r') pieceName = 'Rook';
    else if (pieceType === 'q') pieceName = 'Queen';
    else if (pieceType === 'k') pieceName = 'King';

    let category = 'Positional Move';
    let styleTag = '🛡️ Solid & Safe';
    let badgeColor = 'bg-blue-950 text-blue-300 border-blue-800';
    let explanation = 'Natural practical move maintaining solid coordination and board stability.';
    let baseHumanScore = Math.max(75, 98 - rankIndex * 4);

    if (isCastle) {
      category = 'King Safety';
      styleTag = '🏰 King Safety';
      badgeColor = 'bg-indigo-950 text-indigo-300 border-indigo-800';
      explanation = 'Castles king to safety while connecting rooks for the middlegame.';
      baseHumanScore = 99;
    } else if (isCheck) {
      category = 'Tactical Check';
      styleTag = '⚡ Forcing Check';
      badgeColor = 'bg-rose-950 text-rose-300 border-rose-800';
      explanation = 'Forcing check that disrupts opponent king safety and piece coordination.';
      baseHumanScore = 96;
    } else if (isCapture) {
      category = 'Tactical Capture';
      styleTag = '⚔️ Tactical Threat';
      badgeColor = 'bg-amber-950 text-amber-300 border-amber-800';
      explanation = `Tactical capture winning or trading ${matched?.captured ? matched.captured.toUpperCase() : 'material'} with active initiative.`;
      baseHumanScore = 94;
    } else if (pieceType === 'n') {
      category = 'Piece Development';
      styleTag = '⚡ Active Development';
      badgeColor = 'bg-emerald-950 text-emerald-300 border-emerald-800';
      explanation = 'Develops the knight towards the center to control vital key outposts.';
      baseHumanScore = 95;
    } else if (pieceType === 'b') {
      category = 'Piece Development';
      styleTag = '⚡ Active Development';
      badgeColor = 'bg-emerald-950 text-emerald-300 border-emerald-800';
      explanation = 'Develops the bishop along an active diagonal to control open lines.';
      baseHumanScore = 93;
    } else if (pieceType === 'p' && ['e4', 'd4', 'c4', 'e5', 'd5', 'c5'].includes(to)) {
      category = 'Center Control';
      styleTag = '♟️ Central Strike';
      badgeColor = 'bg-cyan-950 text-cyan-300 border-cyan-800';
      explanation = 'Pushes central pawn to seize space and contest critical central squares.';
      baseHumanScore = 97;
    } else if (pieceType === 'r') {
      category = 'Rook Activity';
      styleTag = '🛡️ Open File';
      badgeColor = 'bg-purple-950 text-purple-300 border-purple-800';
      explanation = 'Activates the rook onto an open or semi-open file for piece pressure.';
      baseHumanScore = 90;
    } else if (pieceType === 'q') {
      category = 'Queen Maneuver';
      styleTag = '⚔️ Dynamic Pressure';
      badgeColor = 'bg-pink-950 text-pink-300 border-pink-800';
      explanation = 'Centralizes or coordinates the queen to exert multi-directional threats.';
      baseHumanScore = 91;
    }

    return {
      san,
      pieceName,
      category,
      styleTag,
      badgeColor,
      explanation,
      humanScore: baseHumanScore,
    };
  }

  // Helper to compute position difficulty index (Obvious, Easy, Normal, Tricky, Hard)
  function getPositionDifficulty(moves: any[]) {
    if (!moves || moves.length === 0) return null;

    const topMove = moves[0];
    const secondMove = moves[1];
    const topScore = topMove?.numericScore || 0;
    const secondScore = secondMove ? secondMove.numericScore : null;
    const gapToSecond = secondScore !== null ? Math.abs(topScore - secondScore) : 9999;
    const goodMovesCount = moves.filter((m) => Math.abs(topScore - m.numericScore) <= 50).length;

    let catName: 'Obvious' | 'Easy' | 'Normal' | 'Tricky' | 'Hard' = 'Normal';
    let subLabel = '';
    let bBg = 'bg-amber-950/90';
    let bTxt = 'text-amber-300';
    let bBdr = 'border-amber-600/80';
    let iconTag = '🟡';
    let detailText = '';

    // Rule 1: Obvious — Forced move, short checkmate, OR High-Eval Win (+4.0+) where you either have multiple winning moves or capture a free major piece
    if (
      moves.length === 1 ||
      (topMove.scoreType === 'mate' && Math.abs(topMove.rawScore) <= 3) ||
      (topScore >= 400 && secondScore !== null && secondScore >= 250) || // Blowout win (+4.0+ eval, 2nd move also winning)
      (topScore >= 400 && gapToSecond >= 300) // Winning capture (+4.0+ eval with 3.0+ pts drop = free hanging piece/rook/queen)
    ) {
      catName = 'Obvious';
      subLabel = topScore >= 400 ? 'Overwhelming Lead / Free Piece Capture' : 'Automatic / Forced Move';
      bBg = 'bg-emerald-950/90';
      bTxt = 'text-emerald-300';
      bBdr = 'border-emerald-600/80';
      iconTag = '⚡';
      detailText = topScore >= 400
        ? `Position is completely winning (${(topScore / 100).toFixed(2)}). Taking hanging piece or simple winning line is straightforward.`
        : 'Only 1 natural or forced move exists in this position. Zero chance to blunder.';
    }
    // Rule 2: Easy — Solid advantage (+2.5+) with multiple good options
    else if (
      goodMovesCount >= 3 ||
      gapToSecond <= 35 ||
      (topScore >= 250 && secondScore !== null && secondScore >= 150)
    ) {
      catName = 'Easy';
      subLabel = topScore >= 250 ? 'Crushing Advantage / High Room for Error' : 'Forgiving / Multiple Good Moves';
      bBg = 'bg-green-950/90';
      bTxt = 'text-green-300';
      bBdr = 'border-green-600/80';
      iconTag = '🟢';
      detailText = `${goodMovesCount > 1 ? goodMovesCount : 'Multiple'} candidate moves maintain a comfortable advantage. Low risk of error.`;
    }
    // Rule 3: Normal — Standard middle-game calculation
    else if (gapToSecond > 35 && gapToSecond < 130) {
      catName = 'Normal';
      subLabel = 'Standard Calculation';
      bBg = 'bg-amber-950/90';
      bTxt = 'text-amber-300';
      bBdr = 'border-amber-600/80';
      iconTag = '🟡';
      detailText = '1 to 2 clear candidate moves exist. Standard tactical and positional calculation required.';
    }
    // Rule 4: Tricky — Sharp "Only Move" in tight positions
    else if (gapToSecond >= 130 && gapToSecond < 280) {
      catName = 'Tricky';
      subLabel = 'Sharp / Only 1 Good Move';
      bBg = 'bg-rose-950/90';
      bTxt = 'text-rose-300';
      bBdr = 'border-rose-600/80';
      iconTag = '🔴';
      detailText = `Razor-thin precision needed! Only #1 move works; 2nd best drops eval by ${(gapToSecond / 100).toFixed(2)} pts.`;
    }
    // Rule 5: Hard — Deep tactic / tightrope in tight positions
    else {
      catName = 'Hard';
      subLabel = 'Deep Tactic / Tightrope';
      bBg = 'bg-purple-950/90';
      bTxt = 'text-purple-300';
      bBdr = 'border-purple-600/80';
      iconTag = '🟣';
      detailText = `Extreme tightrope line. Missing the best move results in a severe blunder (drop of ${(gapToSecond / 100).toFixed(2)} pts).`;
    }

    let oppCatName = 'Normal';
    let oppBadgeClass = 'bg-amber-950 text-amber-300 border-amber-800';
    if (catName === 'Tricky' || catName === 'Hard') {
      oppCatName = 'Tricky';
      oppBadgeClass = 'bg-rose-950 text-rose-300 border-rose-800';
    } else if (catName === 'Easy' || catName === 'Obvious') {
      oppCatName = 'Easy';
      oppBadgeClass = 'bg-green-950 text-green-300 border-green-800';
    }

    return {
      catName,
      subLabel,
      bBg,
      bTxt,
      bBdr,
      iconTag,
      detailText,
      gapToSecond,
      goodMovesCount,
      oppCatName,
      oppBadgeClass,
    };
  }

  // Helper to compute side-specific difficulty badges for White and Black
  function getSideDifficultyInfo(targetSide: 'w' | 'b') {
    if (!stockfishEnabled || !bestMoves || bestMoves.length === 0) {
      return {
        label: evaluating ? t.thinking : t.off,
        bg: 'bg-gray-900/90',
        txt: 'text-gray-400',
        bdr: 'border-gray-800',
        icon: evaluating ? '⚙️' : '⚪',
        subLabel: evaluating ? t.stockfishAnalyzing : t.stockfishOff,
      };
    }

    const diff = getPositionDifficulty(bestMoves);
    if (!diff) return null;

    const isActiveSide = game.turn() === targetSide;

    if (isActiveSide) {
      return {
        label: getDifficultyLabel(diff.catName, t).toUpperCase(),
        bg: diff.bBg,
        txt: diff.bTxt,
        bdr: diff.bBdr,
        icon: diff.iconTag,
        subLabel: diff.subLabel,
      };
    } else {
      const isTricky = diff.oppCatName === 'Tricky';
      const isEasy = diff.oppCatName === 'Easy';
      return {
        label: getDifficultyLabel(diff.oppCatName, t).toUpperCase(),
        bg: isTricky ? 'bg-rose-950/90' : isEasy ? 'bg-green-950/90' : 'bg-amber-950/90',
        txt: isTricky ? 'text-rose-300' : isEasy ? 'text-green-300' : 'text-amber-300',
        bdr: isTricky ? 'border-rose-600/80' : isEasy ? 'border-green-600/80' : 'border-amber-600/80',
        icon: isTricky ? '🔴' : isEasy ? '🟢' : '🟡',
        subLabel: isTricky ? 'High Pressure' : isEasy ? 'Comfortable' : 'Standard',
      };
    }
  }

  function makeAMoveFromUCI(uciMoveStr: string) {
    if (!uciMoveStr || uciMoveStr.length < 4) return;
    const from = uciMoveStr.substring(0, 2);
    const to = uciMoveStr.substring(2, 4);
    const promotion = uciMoveStr.length > 4 ? uciMoveStr[4] : 'q';
    makeAMove({ from, to, promotion });
  }

  // Re-evaluate or re-run move selection when Random Bad Move Feature state changes
  useEffect(() => {
    if (stockfishEnabled && !game.isGameOver()) {
      evaluatePosition();
    } else if (bestMoves.length > 0) {
      if (!randomBadMoveEnabled) setWorstMoves([]);
      const selection = selectMoveSuggestions(
        bestMoves,
        randomBadMoveEnabled ? worstMoves : [],
        consecutiveGoodMoves,
        randomBadMoveEnabled
      );
      setRandomGoodMoves(selection.moves);
      setIsBadMoveActive(selection.isBadMove);
      setActiveBadMove(selection.badMove);
    }
  }, [randomBadMoveEnabled]);

  // Auto-evaluate when game state, Stockfish toggle, game mode, move limit, or bad moves toggle changes
  useEffect(() => {
    if (stockfishEnabled && !game.isGameOver()) {
      evaluatePosition(game.fen());
    } else if (!stockfishEnabled) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      reqIdRef.current++;
      setBestMoves([]);
      setRandomGoodMoves([]);
      setWorstMoves([]);
      setPositionEval(null);
      setEvaluating(false);
      clearDelayTimers();
    }
  }, [game, stockfishEnabled, gameMode, boardOrientation, moveLimit, showWorst, showOpponentMoves]);

  // Synchronize randomGoodMoves when entering random mode
  useEffect(() => {
    if (gameMode === 'random' && randomGoodMovesEnabled && bestMoves.length > 0 && randomGoodMoves.length === 0) {
      setRandomGoodMoves(pickTwoRandomGoodMoves(bestMoves));
    }
  }, [gameMode, randomGoodMovesEnabled, bestMoves, randomGoodMoves.length]);

  // Helper to get legal moves for highlighting
  const getMoveOptions = useCallback((square: Square) => {
    const moves = game.moves({
      square,
      verbose: true,
    });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: Record<string, any> = {};
    moves.forEach((move) => {
      const isCapture = game.get(move.to as Square);
      newSquares[move.to] = {
        background: isCapture
          ? 'radial-gradient(circle, rgba(239, 68, 68, 0.8) 85%, transparent 85%)'
          : 'radial-gradient(circle, rgba(34, 197, 94, 0.7) 25%, transparent 25%)',
        borderRadius: '50%',
      };
    });
    newSquares[square] = {
      background: 'rgba(234, 179, 8, 0.5)',
    };
    setOptionSquares(newSquares);
    return true;
  }, [game]);

  function cloneGame(gameInstance: Chess): Chess {
    const copy = new Chess();
    try {
      if (gameInstance.history().length > 0) {
        copy.loadPgn(gameInstance.pgn());
      } else {
        copy.load(gameInstance.fen());
      }
    } catch {
      copy.load(gameInstance.fen());
    }
    return copy;
  }

  // Core move execution logic
  const makeAMove = useCallback((move: { from: string; to: string; promotion?: string }) => {
    const gameCopy = cloneGame(game);
    try {
      const result = gameCopy.move(move);
      if (result) {
        if (soundEnabled) {
          let soundType: 'move' | 'capture' | 'check' | 'checkmate' | 'castle' | 'promote' = 'move';
          if (gameCopy.isCheckmate()) {
            soundType = 'checkmate';
          } else if (gameCopy.inCheck()) {
            soundType = 'check';
          } else if (result.captured) {
            soundType = 'capture';
          } else if (result.flags && (result.flags.includes('k') || result.flags.includes('q'))) {
            soundType = 'castle';
          } else if (result.promotion) {
            soundType = 'promote';
          }
          playMoveSound(soundType);
        }
        setRedoStack([]);
        setGame(gameCopy);
        setErrorMessage('');
        setMoveFrom(null);
        setOptionSquares({});
        setHoveredMove(null);
        clearDelayTimers();
        setBestMoves([]);
        setRandomGoodMoves([]);
        setWorstMoves([]);

        if (gameMode === 'random' && randomBadMoveEnabled) {
          if (isBadMoveActive) {
            setConsecutiveGoodMoves(0);
            setIsBadMoveActive(false);
            setActiveBadMove(null);
          } else {
            setConsecutiveGoodMoves((prev) => prev + 1);
          }
        }

        return result;
      }
    } catch (e: any) {
      // Catch invalid move silently
    }
    return null;
  }, [game, soundEnabled, gameMode, randomBadMoveEnabled, isBadMoveActive]);

  // Position Editor Methods
  function startEditingPosition() {
    clearDelayTimers();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    reqIdRef.current++;
    setEvaluating(false);
    setHoveredMove(null);
    setMoveFrom(null);
    setOptionSquares({});
    setSavedFenBeforeEdit(game.fen());

    const { board, turn, castling } = fenToBoard(game.fen());
    setEditBoard(board);
    setEditTurn(turn);
    setEditCastling(castling);
    setSelectedPaletteTool(null);
    setEditValidationWarning(null);
    setIsEditingPosition(true);
  }

  function cancelEditingPosition() {
    setIsEditingPosition(false);
    setSelectedPaletteTool(null);
    setEditValidationWarning(null);
    if (savedFenBeforeEdit) {
      evaluatePosition(savedFenBeforeEdit);
    }
  }

  function finishEditingPosition() {
    const result = validatePositionBeforeDone(editBoard, editTurn, editCastling);
    if (!result.valid || !result.fen) {
      setEditValidationWarning(result.error || 'Invalid chess position. Please check kings and piece placement.');
      return;
    }

    try {
      const newGame = new Chess(result.fen);
      setGame(newGame);
      setIsEditingPosition(false);
      setSelectedPaletteTool(null);
      setEditValidationWarning(null);
      setRedoStack([]);
      setErrorMessage('');
      clearDelayTimers();
      evaluatePosition(result.fen);
    } catch (err: any) {
      setEditValidationWarning(`Invalid position: ${err.message || 'Could not load position'}`);
    }
  }

  function clearEditBoard() {
    const emptyBoard: Record<string, { type: PieceType; color: PieceColor } | null> = {};
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
    for (const f of files) {
      for (const r of ranks) {
        emptyBoard[`${f}${r}`] = null;
      }
    }
    setEditBoard(emptyBoard);
    setEditCastling({ K: false, Q: false, k: false, q: false });
    setEditValidationWarning(null);
  }

  function resetEditStartingPosition() {
    const { board, turn, castling } = fenToBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    setEditBoard(board);
    setEditTurn(turn);
    setEditCastling(castling);
    setEditValidationWarning(null);
  }

  const onSquareRightClick = useCallback(({ square }: { square: string }) => {
    if (isEditingPosition) {
      const sq = square as Square;
      if (sq) {
        setEditBoard((prev) => ({ ...prev, [sq]: null }));
        setEditValidationWarning(null);
      }
    }
  }, [isEditingPosition]);

  // Handle drag and drop (for regular moves, spare pieces, and board editing)
  const onDrop = useCallback(({
    piece,
    sourceSquare,
    targetSquare,
  }: {
    piece?: any;
    sourceSquare: string;
    targetSquare: string | null;
  }) => {
    if (isEditingPosition) {
      // 1. Dropped off-board: delete piece if it was dragged from a square on the board
      if (!targetSquare) {
        if (sourceSquare && sourceSquare.length === 2 && sourceSquare in editBoard) {
          setEditBoard((prev) => ({
            ...prev,
            [sourceSquare]: null,
          }));
          setEditValidationWarning(null);
        }
        return true;
      }

      // 2. Dragged from SparePiece (palette) onto a board square
      const isSpare = piece?.isSparePiece || /^[wb][kqrnba-z]$/i.test(sourceSquare);
      const pieceTypeStr = (piece?.pieceType || sourceSquare) as string;
      if (isSpare && pieceTypeStr && pieceTypeStr.length >= 2) {
        const colorChar = pieceTypeStr[0].toLowerCase();
        const typeChar = pieceTypeStr[1].toLowerCase();
        if ((colorChar === 'w' || colorChar === 'b') && ['k', 'q', 'r', 'b', 'n', 'p'].includes(typeChar)) {
          setEditBoard((prev) => ({
            ...prev,
            [targetSquare]: {
              type: typeChar as PieceType,
              color: colorChar as PieceColor,
            },
          }));
          setEditValidationWarning(null);
          return true;
        }
      }

      // 3. Dragged from one board square to another board square
      if (sourceSquare && sourceSquare.length === 2) {
        setEditBoard((prev) => {
          const pieceOnBoard = prev[sourceSquare];
          if (!pieceOnBoard) return prev;
          const next = { ...prev, [sourceSquare]: null, [targetSquare]: pieceOnBoard };
          return next;
        });
        setEditValidationWarning(null);
        return true;
      }

      return false;
    }

    if (!sourceSquare || !targetSquare) return false;

    const move = makeAMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    });

    return move !== null;
  }, [isEditingPosition, editBoard, makeAMove]);

  const onPieceClick = useCallback(({
    isSparePiece,
    piece,
    square,
  }: {
    isSparePiece?: boolean;
    piece?: { pieceType?: string };
    square?: string | null;
  }) => {
    if (isEditingPosition && (isSparePiece || (square && square.length !== 2))) {
      const pt = piece?.pieceType || square;
      if (pt && pt.length >= 2) {
        const color = pt[0];
        const type = pt[1];
        const toolChar = color === 'w' ? type.toUpperCase() : type.toLowerCase();
        setSelectedPaletteTool((prev) => (prev === toolChar ? null : (toolChar as PaletteTool)));
      }
    }
  }, [isEditingPosition]);

  // Handle click to move
  const onSquareClick = useCallback(({ square }: { square: string }) => {
    const sq = square as Square;
    if (!sq) return;

    if (isEditingPosition) {
      if (selectedPaletteTool === 'delete') {
        setEditBoard((prev) => ({ ...prev, [sq]: null }));
        setEditValidationWarning(null);
        return;
      }

      if (selectedPaletteTool) {
        const isWhite = selectedPaletteTool === selectedPaletteTool.toUpperCase();
        const type = selectedPaletteTool.toLowerCase() as PieceType;
        setEditBoard((prev) => ({
          ...prev,
          [sq]: { type, color: isWhite ? 'w' : 'b' },
        }));
        setEditValidationWarning(null);
        return;
      }
      return;
    }

    if (!moveFrom) {
      const hasMoves = getMoveOptions(sq);
      if (hasMoves) setMoveFrom(sq);
      return;
    }

    if (moveFrom === sq) {
      setMoveFrom(null);
      setOptionSquares({});
      return;
    }

    const move = makeAMove({
      from: moveFrom,
      to: sq,
      promotion: 'q',
    });

    if (move) return;

    const hasMoves = getMoveOptions(sq);
    if (hasMoves) {
      setMoveFrom(sq);
    } else {
      setMoveFrom(null);
      setOptionSquares({});
    }
  }, [isEditingPosition, selectedPaletteTool, moveFrom, getMoveOptions, makeAMove]);

  async function evaluatePosition(fenToEval?: string) {
    const reqId = ++reqIdRef.current;
    const fen = fenToEval || game.fen();

    // Abort previous in-flight engine request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Stop previous in-flight evaluation without destroying the warm worker thread
    stockfishClient.stopCurrent();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setEvaluating(true);
    setErrorMessage('');
    setHoveredMove(null);
    setBestMoves([]);
    setRandomGoodMoves([]);
    setWorstMoves([]);

    const shouldCalculateWorst = (gameMode !== 'human' && showWorst) || (gameMode === 'random' && randomBadMoveEnabled);
    const isEffectiveRandomBadMove = gameMode === 'random' && randomBadMoveEnabled;
    const effectiveLimit = (moveLimit === 5 && !shouldCalculateWorst) ? 5 : 10;

    const handleDataUpdate = (data: any, isFinal: boolean = false) => {
      if (reqId !== reqIdRef.current) return;
      if (game.fen() !== fen) return;

      if (data.best) {
        setBestMoves(data.best);
        const worstList = shouldCalculateWorst ? (data.worst || []) : [];
        setWorstMoves(worstList);

        const ourColor = boardOrientation === 'white' ? 'w' : 'b';
        const isOurTurn = game.turn() === ourColor;
        const isSuggestionActive = gameMode !== 'random' || isOurTurn || showOpponentMoves;

        if (isSuggestionActive) {
          const selection = selectMoveSuggestions(
            data.best,
            worstList,
            consecutiveGoodMoves,
            isEffectiveRandomBadMove
          );
          setRandomGoodMoves(selection.moves);
          setIsBadMoveActive(selection.isBadMove);
          setActiveBadMove(selection.badMove);

          if ((gameMode === 'random' || gameMode === 'human') && timingEnabled) {
            const ourColor = boardOrientation === 'white' ? 'w' : 'b';
            if (thinkOurTurnOnly && game.turn() !== ourColor) {
              clearDelayTimers();
            } else {
              triggerSuggestionDelay(undefined, undefined, data.best);
            }
          } else {
            clearDelayTimers();
          }
        } else {
          setRandomGoodMoves([]);
          setIsBadMoveActive(false);
          setActiveBadMove(null);
          clearDelayTimers();
        }
      } else if (data.worst) {
        setWorstMoves(shouldCalculateWorst ? data.worst : []);
      }

      // Update position evaluation score & eval bar smoothly
      if (data.positionEval) {
        setPositionEval(data.positionEval);
      }
    };

    try {
      // 1. Primary: Fast Client-Side WebWorker Stockfish (like Lichess)
      try {
        const clientData = await stockfishClient.evaluate({
          fen,
          depth: 14,
          limit: effectiveLimit,
          includeWorst: shouldCalculateWorst,
          signal: controller.signal,
          onProgress: (progressiveData) => {
            handleDataUpdate(progressiveData, false);
          }
        });
        handleDataUpdate(clientData, true);
        return;
      } catch (clientErr: any) {
        if (clientErr.message === 'Evaluation cancelled' || controller.signal.aborted) {
          return;
        }
        console.warn('Client-side Stockfish Worker unavailable, falling back to server API:', clientErr);
      }

      // 2. Secondary Fallback: Server API
      const response = await fetch('/api/engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, depth: 10, limit: effectiveLimit, includeWorst: shouldCalculateWorst }),
        signal: controller.signal,
      });

      if (reqId !== reqIdRef.current) return;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 499 || errorData.aborted) {
          return;
        }
        throw new Error(errorData.details || errorData.error || `Engine error: HTTP ${response.status}`);
      }

      const data = await response.json();
      handleDataUpdate(data, true);
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'Evaluation cancelled') {
        return;
      }
      if (reqId === reqIdRef.current) {
        console.error('Failed to evaluate position', error);
        setErrorMessage('Failed to evaluate position: ' + error.message);
      }
    } finally {
      if (reqId === reqIdRef.current) {
        setEvaluating(false);
      }
    }
  }

  function resetBoard() {
    clearDelayTimers();
    if (soundEnabled) {
      playMoveSound('reset');
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    reqIdRef.current++;
    const newGame = new Chess();
    setGame(newGame);
    setRedoStack([]);
    setBestMoves([]);
    setRandomGoodMoves([]);
    setWorstMoves([]);
    setPositionEval(null);
    setMoveFrom(null);
    setOptionSquares({});
    setErrorMessage('');
    setHoveredMove(null);
    setConsecutiveGoodMoves(0);
    setIsBadMoveActive(false);
    setActiveBadMove(null);
  }

  function loadCustomFen(fenString: string) {
    try {
      let cleanFen = fenString.trim();
      if (!cleanFen) {
        setFenLoadError('Please enter a valid FEN string.');
        return;
      }

      // If user pasted fewer than 6 fields, add standard defaults
      const parts = cleanFen.split(/\s+/);
      if (parts.length === 1) {
        cleanFen = `${parts[0]} w KQkq - 0 1`;
      } else if (parts.length === 2) {
        cleanFen = `${parts[0]} ${parts[1]} KQkq - 0 1`;
      } else if (parts.length === 3) {
        cleanFen = `${parts[0]} ${parts[1]} ${parts[2]} - 0 1`;
      } else if (parts.length === 4) {
        cleanFen = `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} 0 1`;
      } else if (parts.length === 5) {
        cleanFen = `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]} 1`;
      }

      const newGame = new Chess(cleanFen);

      clearDelayTimers();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      reqIdRef.current++;
      setGame(newGame);
      setRedoStack([]);
      setBestMoves([]);
      setRandomGoodMoves([]);
      setWorstMoves([]);
      setPositionEval(null);
      setMoveFrom(null);
      setOptionSquares({});
      setErrorMessage('');
      setHoveredMove(null);
      setConsecutiveGoodMoves(0);
      setIsBadMoveActive(false);
      setActiveBadMove(null);
      setShowLoadFenModal(false);
      setFenLoadError(null);
      if (stockfishEnabled) {
        evaluatePosition(newGame.fen());
      }
    } catch (err: any) {
      setFenLoadError('Invalid FEN position string. Please verify the format.');
    }
  }

  function undoMove() {
    clearDelayTimers();
    const gameCopy = cloneGame(game);
    const undone = gameCopy.undo();
    if (!undone) return;
    if (soundEnabled) {
      playMoveSound('move');
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    reqIdRef.current++;
    setRedoStack((prev) => [...prev, undone]);
    setGame(gameCopy);
    setBestMoves([]);
    setRandomGoodMoves([]);
    setWorstMoves([]);
    setMoveFrom(null);
    setOptionSquares({});
    setErrorMessage('');
    setHoveredMove(null);
    setConsecutiveGoodMoves((prev) => Math.max(0, prev - 1));
    setIsBadMoveActive(false);
    setActiveBadMove(null);
  }

  function redoMove() {
    if (redoStack.length === 0) return;
    clearDelayTimers();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    reqIdRef.current++;
    const nextMove = redoStack[redoStack.length - 1];
    const gameCopy = cloneGame(game);
    try {
      const result = gameCopy.move(nextMove);
      if (result) {
        if (soundEnabled) {
          let soundType: 'move' | 'capture' | 'check' | 'checkmate' | 'castle' | 'promote' = 'move';
          if (gameCopy.isCheckmate()) {
            soundType = 'checkmate';
          } else if (gameCopy.inCheck()) {
            soundType = 'check';
          } else if (result.captured) {
            soundType = 'capture';
          } else if (result.flags && (result.flags.includes('k') || result.flags.includes('q'))) {
            soundType = 'castle';
          } else if (result.promotion) {
            soundType = 'promote';
          }
          playMoveSound(soundType);
        }
        setRedoStack((prev) => prev.slice(0, -1));
        setGame(gameCopy);
        setErrorMessage('');
        setMoveFrom(null);
        setOptionSquares({});
        setHoveredMove(null);
        setBestMoves([]);
        setRandomGoodMoves([]);
        setWorstMoves([]);
        setIsBadMoveActive(false);
        setActiveBadMove(null);
      } else {
        setRedoStack((prev) => prev.slice(0, -1));
      }
    } catch {
      setRedoStack((prev) => prev.slice(0, -1));
    }
  }

  const currentSideColor = boardOrientation === 'white' ? 'w' : 'b';
  const isPlayerTurnInRandom = gameMode !== 'random' || game.turn() === currentSideColor || showOpponentMoves;

  // Ensure moves strictly belong to the current legal moves for the active position
  const legalMovesMap = useMemo(() => {
    const moves = game.moves({ verbose: true });
    const uciSet = new Set<string>();
    moves.forEach((m) => {
      uciSet.add(m.from + m.to);
      if (m.promotion) {
        uciSet.add(m.from + m.to + m.promotion);
      }
    });
    return uciSet;
  }, [game]);

  const validBestMoves = useMemo(() => {
    return bestMoves.filter(
      (m) => m.move && (legalMovesMap.has(m.move) || legalMovesMap.has(m.move.substring(0, 4)))
    );
  }, [bestMoves, legalMovesMap]);

  const validWorstMoves = useMemo(() => {
    return worstMoves.filter(
      (m) => m.move && (legalMovesMap.has(m.move) || legalMovesMap.has(m.move.substring(0, 4)))
    );
  }, [worstMoves, legalMovesMap]);

  const positionDiff = getPositionDifficulty(validBestMoves);
  const isObviousPosition = positionDiff?.catName === 'Obvious';

  // Human candidate moves computation:
  const getHumanCandidateMoves = () => {
    if (validBestMoves.length === 0) return [];
    if (isObviousPosition) {
      const details = getHumanMoveDetails(validBestMoves[0].move, game, 0);
      return [{
        ...validBestMoves[0],
        humanDetails: details,
        san: details.san,
      }];
    }
    const poolLimit = humanSkillLevel === 'master' ? 3 : humanSkillLevel === 'advanced' ? 4 : 5;
    const pool = validBestMoves.slice(0, poolLimit);

    const analyzed = pool.map((m, idx) => {
      const details = getHumanMoveDetails(m.move, game, idx);
      return {
        ...m,
        humanDetails: details,
        san: details.san,
      };
    });

    return analyzed.slice(0, 3);
  };

  // Good moves:
  // - Standard Mode: Full Top 5 or 10 moves (strictly according to moveLimit, unaffected by Obvious condition)
  // - Full Control (Random) Mode:
  //    - If Random Good Moves ON: In Obvious positions / Forced Mate <= 3, strictly 1 top move; otherwise 2 random moves from top pool (or triggered bad move). (hidden on opponent turn or during delay)
  //    - If Random Good Moves OFF: Full Top 5 or 10 moves (like Standard mode), or triggered bad move if Human Mistakes is active. (hidden on opponent turn or during delay)
  // - Human Mode: Human candidate lines (1 move in Obvious positions, up to 3 candidate moves based on skill level)
  const displayedBestMoves = (() => {
    if (gameMode === 'standard') {
      return validBestMoves.slice(0, moveLimit);
    }
    if (gameMode === 'human') {
      if (timingEnabled && isDelaying) return [];
      return getHumanCandidateMoves();
    }
    if (gameMode === 'random') {
      if (!isPlayerTurnInRandom || (timingEnabled && isDelaying)) return [];
      if (isBadMoveActive) {
        return randomGoodMoves;
      }
      if (!randomGoodMovesEnabled) {
        return validBestMoves.slice(0, moveLimit);
      }
      return isObviousPosition ? validBestMoves.slice(0, 1) : randomGoodMoves;
    }
    return validBestMoves.slice(0, moveLimit);
  })();

  // Bad moves:
  // - If showWorst is OFF or Human Mode: Completely disabled (empty list & arrows)
  // - Standard Mode: Full Top 5 or 10 worst moves
  // - Random Mode: Hidden on opponent's turn or during Obvious positions (when random good moves is ON)
  const displayedWorstMoves =
    !showWorst || gameMode === 'human'
      ? []
      : gameMode === 'standard'
      ? validWorstMoves.slice(0, moveLimit)
      : gameMode === 'random'
      ? (!isPlayerTurnInRandom || (randomGoodMovesEnabled && isObviousPosition) ? [] : validWorstMoves.slice(0, moveLimit))
      : [];

  // Build custom numbered arrows list
  const customNumberedArrows = useMemo(() => {
    const arrows: CustomArrowData[] = [];

    const bestColors = [
      '#22c55e', '#10b981', '#16a34a', '#059669', '#15803d',
      '#047857', '#166534', '#0f766e', '#14532d', '#115e59'
    ];
    const bestBadgeBgs = [
      '#16a34a', '#059669', '#15803d', '#047857', '#166534',
      '#0f766e', '#14532d', '#115e59', '#064e3b', '#134e4a'
    ];

    const worstColors = [
      '#ef4444', '#f43f5e', '#dc2626', '#e11d48', '#b91c1c',
      '#be123c', '#991b1b', '#9f1239', '#7f1d1d', '#881337'
    ];
    const worstBadgeBgs = [
      '#dc2626', '#e11d48', '#b91c1c', '#be123c', '#991b1b',
      '#9f1239', '#7f1d1d', '#881337', '#6b1212', '#4c0519'
    ];

    if (showBest) {
      displayedBestMoves.forEach((moveData, index) => {
        const source = moveData.move.substring(0, 2);
        const target = moveData.move.substring(2, 4);
        const rankNum = moveData.rank || index + 1;
        const colorIdx = Math.max(0, Math.min(bestColors.length - 1, rankNum - 1));
        const isTriggeredBad = moveData.isTriggeredBadMove;

        const humanColors = ['#0ea5e9', '#06b6d4', '#3b82f6'];
        const humanBadges = ['#0284c7', '#0891b2', '#2563eb'];

        arrows.push({
          id: `best-${moveData.move}-${index}`,
          startSquare: source,
          endSquare: target,
          color: gameMode === 'human'
            ? (humanColors[index % humanColors.length] || '#0ea5e9')
            : isTriggeredBad ? '#f59e0b' : (bestColors[colorIdx] || '#22c55e'),
          badgeBg: gameMode === 'human'
            ? (humanBadges[index % humanBadges.length] || '#0284c7')
            : isTriggeredBad ? '#d97706' : (bestBadgeBgs[colorIdx] || '#16a34a'),
          badgeText: '#ffffff',
          badgeBorder: gameMode === 'human' ? '#082f49' : isTriggeredBad ? '#78350f' : '#052e16',
          label: gameMode === 'human' ? `${index + 1}` : isTriggeredBad ? '⚠️' : `${rankNum}`,
          type: isTriggeredBad ? 'worst' : 'best',
          moveString: moveData.move,
        });
      });
    }

    if (showWorst) {
      displayedWorstMoves.forEach((moveData, index) => {
        const source = moveData.move.substring(0, 2);
        const target = moveData.move.substring(2, 4);
        arrows.push({
          id: `worst-${index}`,
          startSquare: source,
          endSquare: target,
          color: worstColors[index] || '#ef4444',
          badgeBg: worstBadgeBgs[index] || '#dc2626',
          badgeText: '#ffffff',
          badgeBorder: '#450a0a',
          label: `${index + 1}`,
          type: 'worst',
          moveString: moveData.move,
        });
      });
    }

    return arrows;
  }, [showBest, displayedBestMoves, showWorst, displayedWorstMoves, gameMode]);


  // Eval bar percentage calculation (White percentage: 0% = black winning, 50% = equal, 100% = white winning)
  // Uses official Lichess/Chess.com winning-probability sigmoid curve: 2 / (1 + exp(-0.00368208 * cp)) - 1
  const getEvalBarWidth = () => {
    if (game.isCheckmate()) {
      return game.turn() === 'w' ? 0 : 100;
    }
    if (game.isDraw() || game.isStalemate()) {
      return 50;
    }
    if (!positionEval || !positionEval.evalWhiteStr) return 50;
    const str = positionEval.evalWhiteStr;
    if (positionEval.scoreType === 'mate' || str.includes('#M')) {
      return str.startsWith('-') ? 0 : 100;
    }
    const val = parseFloat(str);
    if (isNaN(val)) return 50;

    const cp = val * 100;
    // Deadband for equal/drawish positions (within ±0.15 pawns) to prevent jitter and false advantage display
    if (Math.abs(cp) <= 15) return 50;

    const winProb = (2 / (1 + Math.exp(-0.00368208 * cp))) - 1;
    const barPercent = 50 + (winProb * 50);
    return Math.max(0, Math.min(100, barPercent));
  };

  const activeTheme = useMemo(() => {
    return BOARD_THEMES.find((t) => t.id === boardTheme) || BOARD_THEMES[0];
  }, [boardTheme]);

  const combinedSquareStyles = useMemo(() => {
    const styles: Record<string, any> = { ...(isEditingPosition ? {} : optionSquares) };

    if (!isEditingPosition) {
      if (game.isCheckmate()) {
        const matedKingSq = getKingSquareFromGame(game, game.turn());
        if (matedKingSq) {
          styles[matedKingSq] = {
            background: 'radial-gradient(circle, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.8) 45%, rgba(185, 28, 28, 0.4) 75%, transparent 100%)',
            boxShadow: 'inset 0 0 16px 4px rgba(239, 68, 68, 0.9), 0 0 24px 6px rgba(220, 38, 38, 0.85)',
            borderRadius: '8px',
          };
        }
      } else if (game.inCheck()) {
        const checkedKingSq = getKingSquareFromGame(game, game.turn());
        if (checkedKingSq) {
          styles[checkedKingSq] = {
            background: 'radial-gradient(circle, rgba(239, 68, 68, 0.85) 0%, rgba(220, 38, 38, 0.45) 50%, transparent 80%)',
            borderRadius: '8px',
          };
        }
      }
    }
    return styles;
  }, [isEditingPosition, optionSquares, game]);

  const currentBoardPosition = useMemo(() => {
    return isEditingPosition ? boardToFen(editBoard, editTurn, editCastling) : game.fen();
  }, [isEditingPosition, editBoard, editTurn, editCastling, game]);

  const chessboardOptions: ChessboardOptions = useMemo(() => {
    return {
      position: currentBoardPosition,
      onPieceDrop: onDrop,
      onPieceClick: onPieceClick,
      onSquareClick: onSquareClick,
      onSquareRightClick: isEditingPosition ? onSquareRightClick : undefined,
      arrows: [],
      squareStyles: combinedSquareStyles,
      darkSquareStyle: { backgroundColor: activeTheme.darkSquare },
      lightSquareStyle: { backgroundColor: activeTheme.lightSquare },
      showNotation: showCoordinates,
      allowDragging: true,
      allowDragOffBoard: true,
      boardOrientation: boardOrientation,
      animationDurationInMs: 150,
    };
  }, [
    currentBoardPosition,
    onDrop,
    onPieceClick,
    onSquareClick,
    onSquareRightClick,
    isEditingPosition,
    combinedSquareStyles,
    activeTheme.darkSquare,
    activeTheme.lightSquare,
    showCoordinates,
    boardOrientation,
  ]);

  return (
    <div className={`w-full text-slate-100 flex flex-col items-center font-sans select-none ${isEmbedded ? 'py-1 sm:py-2' : 'min-h-screen bg-[#030612] py-8'}`}>
      {!isEmbedded && (
        <div className="text-center mb-6 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/25 bg-violet-500/10 text-violet-300 text-xs font-mono mb-2 shadow-sm">
            Live Stockfish NNUE AI
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Chess Mastery Analyzer
          </h1>
          <p className="text-neutral-400 text-sm mt-1">Interactive board • Real-time Stockfish live evaluation & move analysis</p>
        </div>
      )}

      {/* Game Mode Switcher (Sleek capsule matching Image 2 & 4) */}
      <div className="inline-flex items-center gap-1.5 p-1 rounded-full bg-[#070a1a]/90 border border-white/[0.08] backdrop-blur-md mb-6 shadow-xl relative z-10">
        <button
          type="button"
          onClick={() => setGameMode('standard')}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full text-xs font-semibold tracking-wide transition-all cursor-pointer ${
            gameMode === 'standard'
              ? 'bg-white/[0.12] text-white border border-white/20 shadow-[0_0_18px_rgba(139,92,246,0.35)]'
              : 'text-neutral-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${gameMode === 'standard' ? 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.9)]' : 'bg-transparent'}`} />
          <span>Standard Mode</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setGameMode('human');
            const ourColor = boardOrientation === 'white' ? 'w' : 'b';
            if (timingEnabled && bestMoves.length > 0) {
              if (thinkOurTurnOnly && game.turn() !== ourColor) {
                clearDelayTimers();
              } else {
                triggerSuggestionDelay(undefined, undefined, bestMoves);
              }
            }
          }}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full text-xs font-semibold tracking-wide transition-all cursor-pointer ${
            gameMode === 'human'
              ? 'bg-white/[0.12] text-white border border-white/20 shadow-[0_0_18px_rgba(56,189,248,0.35)]'
              : 'text-neutral-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${gameMode === 'human' ? 'bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]' : 'bg-transparent'}`} />
          <span>Human Mode</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setGameMode('random');
            const ourColor = boardOrientation === 'white' ? 'w' : 'b';
            if (timingEnabled && bestMoves.length > 0) {
              if (thinkOurTurnOnly && game.turn() !== ourColor) {
                clearDelayTimers();
              } else {
                triggerSuggestionDelay(undefined, undefined, bestMoves);
              }
            }
          }}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full text-xs font-semibold tracking-wide transition-all cursor-pointer ${
            gameMode === 'random'
              ? 'bg-white/[0.12] text-white border border-white/20 shadow-[0_0_18px_rgba(232,121,249,0.35)]'
              : 'text-neutral-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${gameMode === 'random' ? 'bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.9)]' : 'bg-transparent'}`} />
          <span>⚙️ Full Control</span>
        </button>
      </div>

      {/* Main Tool Container Card with Ambient Bottom Glow (from Reference Images) */}
      <div className="w-full max-w-6xl rounded-[28px] sm:rounded-[32px] border border-white/[0.08] bg-[#050715]/90 backdrop-blur-2xl p-4 sm:p-6 lg:p-7 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_25px_60px_-15px_rgba(0,0,0,0.7)] relative overflow-hidden">
        {/* Ambient Violet Luminous Field at Bottom */}
        <div className="absolute -bottom-28 left-1/2 -translate-x-1/2 w-[650px] sm:w-[850px] h-[300px] bg-gradient-to-t from-violet-600/25 via-indigo-600/12 to-transparent blur-3xl pointer-events-none rounded-full" />
        
        {/* Subtle Top Rim Highlight */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 w-full relative z-10">
          {/* Left Column: Board & Palettes */}
          <div className="flex-1 flex flex-col items-center">
            {/* Board Column */}
            <div className="flex flex-col items-center max-w-[530px] w-full">
              {/* If Editing Position: Position Editor Top Header & Action Controls Bar */}
              {isEditingPosition && (
                <div className="w-full max-w-[530px] mb-2 p-3 bg-violet-950/40 border border-violet-500/30 rounded-2xl shadow-xl flex flex-col gap-2.5 backdrop-blur-md animate-in fade-in">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">✏️</span>
                      <div>
                        <h3 className="font-extrabold text-sm text-violet-200">{t.customPositionSetup}</h3>
                        <p className="text-[11px] text-violet-300/80">
                          {selectedPaletteTool === 'delete' ? (
                            <span className="text-rose-300 font-bold">{t.eraserTool}</span>
                          ) : selectedPaletteTool ? (
                            <span>{t.turn} <span className="font-bold text-white font-mono">{selectedPaletteTool === selectedPaletteTool.toUpperCase() ? t.white : t.black} {getPieceFullName(selectedPaletteTool, t)} {getPieceSymbol(selectedPaletteTool)}</span></span>
                          ) : (
                            <span>{t.customPositionDesc}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={cancelEditingPosition}
                        className="px-3 py-1 bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 rounded-lg text-xs font-semibold transition-all border border-white/10 cursor-pointer"
                      >
                        {t.cancel}
                      </button>
                      <button
                        type="button"
                        onClick={finishEditingPosition}
                        className="px-3.5 py-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-violet-950/60 flex items-center gap-1 cursor-pointer active:scale-95"
                      >
                        <span>✓</span>
                        <span>{t.done}</span>
                      </button>
                    </div>
                  </div>

                  {/* Validation warning if any */}
                  {editValidationWarning && (
                    <div className="p-2 bg-rose-950/90 border border-rose-600/80 rounded-xl text-xs text-rose-200 flex items-center gap-2 font-medium">
                      <span>⚠️</span>
                      <span className="flex-1">{editValidationWarning}</span>
                    </div>
                  )}
                </div>
              )}

            {/* Chessboard Context Provider for Drag & Drop with SparePiece Palettes */}
            <ChessboardProvider options={chessboardOptions}>
              {/* Top Player Difficulty Badge Bar (Normal Mode) */}
              {!isEditingPosition && (
                (() => {
                  const topColor = boardOrientation === 'white' ? 'b' : 'w';
                  const topName = topColor === 'w' ? t.white : t.black;
                  const topIcon = topColor === 'w' ? '♔' : '♚';
                  const isTurn = game.turn() === topColor;
                  const isCheckmated = game.isCheckmate();
                  const diffInfo = getSideDifficultyInfo(topColor);

                  return (
                    <div className={`w-full max-w-[530px] mb-2 px-3.5 h-11 rounded-xl border flex items-center justify-between shadow-sm select-none shrink-0 transition-all ${
                      isTurn
                        ? 'bg-violet-950/25 border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.15)]'
                        : 'bg-white/[0.02] border-white/[0.08]'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          topColor === 'w' ? 'bg-white text-black shadow-sm' : 'bg-white/10 text-white border border-white/20'
                        }`}>
                          {topIcon}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-xs tracking-wider text-white uppercase">
                            {topName}
                          </span>
                          {isTurn && (
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shadow-[0_0_8px_rgba(167,139,250,0.9)]" />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center min-h-[26px]">
                        {isCheckmated ? (
                          game.turn() === topColor ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/30 text-[10px] font-mono font-bold uppercase tracking-wider">
                              ❌ {t.checkmated}
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold uppercase tracking-wider animate-bounce shadow-md">
                              🏆 {t.winner}
                            </span>
                          )
                        ) : isTurn && diffInfo ? (
                          <div className="flex items-center gap-1.5 animate-in fade-in duration-100">
                            <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">{t.difficulty}</span>
                            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-neutral-200 text-xs font-mono font-semibold shadow-sm">
                              <span>{diffInfo.icon}</span>
                              <span>{diffInfo.label}</span>
                            </div>
                          </div>
                        ) : isTurn && evaluating ? (
                          <div className="flex items-center gap-1.5 text-neutral-400 text-[10px] font-mono font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shadow-[0_0_6px_rgba(167,139,250,0.8)]"></span>
                            <span>{t.thinkingDots}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Top Piece Palette Bar (When in Edit Mode) */}
              {isEditingPosition && (() => {
                const topPieces = boardOrientation === 'white' ? BLACK_PALETTE : WHITE_PALETTE;
                const isTopBlack = boardOrientation === 'white';
                return (
                  <div className="w-full max-w-[530px] mb-2 p-1.5 bg-[#060818] border border-white/10 rounded-2xl shadow-xl flex items-center justify-between gap-1.5 backdrop-blur-md">
                    <div className="flex items-center gap-1 sm:gap-1.5 flex-1 justify-around">
                      {topPieces.map((piece) => {
                        const isSelected = selectedPaletteTool === piece;
                        return (
                          <div
                            key={`top-palette-${piece}`}
                            onClick={() => setSelectedPaletteTool(isSelected ? null : piece)}
                            className={`relative p-1 sm:p-1.5 rounded-xl transition-all cursor-grab active:cursor-grabbing flex items-center justify-center aspect-square h-10 w-10 sm:h-11 sm:w-11 select-none ${
                              isSelected
                                ? 'bg-violet-500/20 border-2 border-violet-400 ring-2 ring-violet-400/40 scale-105 shadow-lg shadow-violet-950/60'
                                : 'bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20'
                            }`}
                            title={`Select or drag ${isTopBlack ? 'Black' : 'White'} ${getPieceFullName(piece)} onto board`}
                          >
                            <div className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center">
                              <SparePiece pieceType={pieceCharToSparePieceType(piece)} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="w-[1px] h-7 bg-white/10" />

                    {/* Eraser Tool */}
                    <button
                      type="button"
                      onClick={() => setSelectedPaletteTool(selectedPaletteTool === 'delete' ? null : 'delete')}
                      className={`p-1 sm:p-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center aspect-square h-10 w-10 sm:h-11 sm:w-11 shrink-0 ${
                        selectedPaletteTool === 'delete'
                          ? 'bg-rose-500/25 border-2 border-rose-400 ring-2 ring-rose-400/50 scale-105 shadow-lg shadow-rose-950/60 text-rose-300'
                          : 'bg-white/[0.03] hover:bg-rose-950/40 text-neutral-400 hover:text-rose-300 border border-white/[0.08] hover:border-rose-500/40'
                      }`}
                      title="Eraser: Click piece to remove from board"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                );
              })()}

              {/* Chessboard and Vertical Evaluation Bar */}
              <div className="flex items-stretch gap-2 w-full max-w-[530px]">
                {/* Chessboard Container */}
                <div className={`flex-1 shadow-2xl rounded-2xl border relative bg-[#040612] overflow-hidden group transition-[border-color,box-shadow] duration-200 ${
                  isEditingPosition ? 'border-violet-500/80 ring-2 ring-violet-500/30 shadow-[0_0_30px_rgba(139,92,246,0.3)]' : 'border-white/[0.12] shadow-[0_12px_36px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)]'
                }`}>
                  <Chessboard />
                  {!isEditingPosition && (
                    <CustomChessArrows arrows={customNumberedArrows} hoveredMove={hoveredMove} orientation={boardOrientation} />
                  )}

                  {/* On-Board Natural Thinking Indicator HUD Overlay */}
                  {!isEditingPosition && (gameMode === 'random' || gameMode === 'human') && timingEnabled && isDelaying && !game.isCheckmate() && (
                    <>
                      {/* Subtle board ambient glow / radar rim */}
                      <div className="absolute inset-0 pointer-events-none rounded-lg border-2 border-violet-400/40 shadow-[inset_0_0_24px_rgba(139,92,246,0.25)] animate-pulse z-10" />

                      {/* Floating HUD Elements */}
                      <div className="absolute inset-0 pointer-events-none flex flex-col justify-end p-2.5 sm:p-3 z-20">

                        {/* Bottom Simplified Thought Bar with Difficulty & Inline Skip Option */}
                        <div className="pointer-events-auto bg-[#060816]/95 backdrop-blur-md border border-white/10 rounded-xl p-2.5 shadow-2xl flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            {/* Human Thinking Message with Moving Brain Icon & Realistic Human Thought Lines */}
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-base animate-bounce select-none shrink-0 drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]">
                                🧠
                              </span>
                              <div className="flex flex-col min-w-0 flex-1">
                                {(() => {
                                  const diff = getPositionDifficulty(bestMoves);
                                  const cat = diff?.catName || 'Normal';
                                  const inCheck = game.inCheck();

                                  let thoughtLine = 'Standard position, finding a plan...';
                                  if (inCheck) {
                                    thoughtLine = 'In check! Finding safe escape...';
                                  } else if (cat === 'Obvious') {
                                    thoughtLine = 'Automatic move, playing instantly...';
                                  } else if (cat === 'Easy') {
                                    thoughtLine = 'Easy spot, multiple good moves...';
                                  } else if (cat === 'Tricky') {
                                    thoughtLine = 'Sharp & tricky! Avoiding traps...';
                                  } else if (cat === 'Hard') {
                                    thoughtLine = 'Hard position! Calculating deeply...';
                                  } else {
                                    thoughtLine = 'Standard spot, finding best plan...';
                                  }

                                  return (
                                    <>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-violet-300">
                                          Human Thinking
                                        </span>
                                        <span className="text-neutral-600 text-[10px]">•</span>
                                        <span className="text-[10px] font-mono font-semibold text-neutral-300">
                                          {diff?.iconTag || '🟢'} {cat}
                                        </span>
                                      </div>
                                      <p className="text-xs text-neutral-200 font-medium truncate italic">
                                        "{thoughtLine}"
                                      </p>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Right Action: Countdown & Inline Skip Button */}
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-violet-300 bg-violet-950/90 px-2 py-0.5 rounded border border-violet-800/80 font-mono text-xs font-bold">
                                {delayRemaining}s
                              </span>
                              <button
                                type="button"
                                onClick={() => clearDelayTimers()}
                                className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs transition-all active:scale-95 flex items-center gap-1 shadow-md cursor-pointer"
                                title="Skip natural thinking time"
                              >
                                <span>⚡</span>
                                <span>Skip</span>
                              </button>
                            </div>
                          </div>

                          {/* Animated Thinking Progress Bar */}
                          <div className="w-full bg-black/60 h-1.5 rounded-full overflow-hidden border border-white/10">
                            <div
                              className="h-full bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-400 transition-all duration-300 ease-linear rounded-full"
                              style={{
                                width: `${totalDelay > 0 ? Math.min(100, Math.max(0, ((totalDelay - delayRemaining) / totalDelay) * 100)) : 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Vertical Evaluation Bar Beside Board (Hidden during edit mode) */}
                {!isEditingPosition && stockfishEnabled && (
                  <div 
                    className="w-5 sm:w-6.5 rounded-xl border border-white/[0.12] bg-[#0c1024] overflow-hidden flex flex-col justify-between shadow-xl relative select-none shrink-0"
                    title={`Position Evaluation: ${game.isCheckmate() ? (game.turn() === 'w' ? '0-1 (Black won by checkmate)' : '1-0 (White won by checkmate)') : positionEval ? positionEval.evalWhiteStr : '+0.00'}`}
                  >
                    {(() => {
                      const whitePct = getEvalBarWidth();
                      const topIsBlack = boardOrientation === 'white';
                      const topPct = topIsBlack ? (100 - whitePct) : whitePct;
                      const bottomPct = topIsBlack ? whitePct : (100 - whitePct);
                      const topColorClass = topIsBlack ? 'bg-[#101428]' : 'bg-[#f8fafc]';
                      const bottomColorClass = topIsBlack ? 'bg-[#f8fafc]' : 'bg-[#101428]';
                      
                      let topDisplayScore = '';
                      let bottomDisplayScore = '';

                      if (game.isCheckmate()) {
                        const whiteWon = game.turn() === 'b';
                        if (topIsBlack) {
                          topDisplayScore = whiteWon ? '' : 'M';
                          bottomDisplayScore = whiteWon ? 'M' : '';
                        } else {
                          topDisplayScore = whiteWon ? 'M' : '';
                          bottomDisplayScore = whiteWon ? '' : 'M';
                        }
                      } else if (game.isDraw() || game.isStalemate()) {
                        topDisplayScore = '0.0';
                        bottomDisplayScore = '0.0';
                      } else {
                        const str = positionEval?.evalWhiteStr || '+0.00';
                        const isMate = positionEval?.scoreType === 'mate' || str.includes('#M');
                        const val = isMate ? (str.includes('-') ? -999 : 999) : parseFloat(str);

                        // If within ±0.15 pawns, the position is dead equal — avoid displaying tiny numbers like 0.07 on one side
                        if (!isMate && Math.abs(val) <= 0.15) {
                          topDisplayScore = '';
                          bottomDisplayScore = '';
                        } else {
                          topDisplayScore = topIsBlack 
                            ? (str.startsWith('-') ? str.replace('-', '') : '') 
                            : (str.startsWith('+') || str.startsWith('#M') ? str.replace('+', '') : '');
                            
                          bottomDisplayScore = topIsBlack 
                            ? (str.startsWith('+') || str.startsWith('#M') ? str.replace('+', '') : '') 
                            : (str.startsWith('-') ? str.replace('-', '') : '');
                        }
                      }

                      return (
                        <div className="w-full h-full flex flex-col justify-between relative overflow-hidden">
                          {/* Top Segment */}
                          <div
                            className={`w-full ${topColorClass} relative flex items-start justify-center overflow-hidden`}
                            style={{ 
                              height: `${topPct}%`,
                              paddingTop: topPct > 5 ? '0.375rem' : '0',
                              transition: 'height 0.65s cubic-bezier(0.25, 1, 0.5, 1)'
                            }}
                          >
                            {topPct > 12 && topDisplayScore && (
                              <span className={`text-[9px] font-black font-mono leading-none tracking-tighter ${topIsBlack ? 'text-neutral-300' : 'text-neutral-900'}`}>
                                {topDisplayScore}
                              </span>
                            )}
                          </div>

                          {/* Subtle Horizontal Rank Divider Grid Lines */}
                          <div className="absolute inset-0 flex flex-col justify-between py-1.5 pointer-events-none opacity-20">
                            <div className="w-full h-[1px] bg-white/40" />
                            <div className="w-full h-[1px] bg-white/40" />
                            <div className="w-full h-[1px] bg-white/40" />
                            <div className="w-full h-[1px] bg-white/40" />
                            <div className="w-full h-[1px] bg-white/40" />
                            <div className="w-full h-[1px] bg-white/40" />
                            <div className="w-full h-[1px] bg-white/40" />
                          </div>

                          {/* Center Zero Line */}
                          {topPct > 0 && bottomPct > 0 && (
                            <div className="absolute top-1/2 left-0 right-0 h-[1.5px] bg-violet-400/60 shadow-[0_0_6px_rgba(167,139,250,0.8)] pointer-events-none z-10" />
                          )}

                          {/* Bottom Segment */}
                          <div
                            className={`w-full ${bottomColorClass} relative flex items-end justify-center overflow-hidden`}
                            style={{ 
                              height: `${bottomPct}%`,
                              paddingBottom: bottomPct > 5 ? '0.375rem' : '0',
                              transition: 'height 0.65s cubic-bezier(0.25, 1, 0.5, 1)'
                            }}
                          >
                            {bottomPct > 12 && bottomDisplayScore && (
                              <span className={`text-[9px] font-black font-mono leading-none tracking-tighter ${topIsBlack ? 'text-neutral-900' : 'text-neutral-300'}`}>
                                {bottomDisplayScore}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Bottom Piece Palette Bar (When in Edit Mode) */}
              {isEditingPosition ? (() => {
                const bottomPieces = boardOrientation === 'white' ? WHITE_PALETTE : BLACK_PALETTE;
                const isBottomWhite = boardOrientation === 'white';
                return (
                  <div className="w-full max-w-[530px] mt-2 p-1.5 bg-[#060818] border border-white/10 rounded-2xl shadow-xl flex items-center justify-between gap-1.5 backdrop-blur-md">
                    <div className="flex items-center gap-1 sm:gap-1.5 flex-1 justify-around">
                      {bottomPieces.map((piece) => {
                        const isSelected = selectedPaletteTool === piece;
                        return (
                          <div
                            key={`bottom-palette-${piece}`}
                            onClick={() => setSelectedPaletteTool(isSelected ? null : piece)}
                            className={`relative p-1 sm:p-1.5 rounded-xl transition-all cursor-grab active:cursor-grabbing flex items-center justify-center aspect-square h-10 w-10 sm:h-11 sm:w-11 select-none ${
                              isSelected
                                ? 'bg-violet-500/20 border-2 border-violet-400 ring-2 ring-violet-400/40 scale-105 shadow-lg shadow-violet-950/60'
                                : 'bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20'
                            }`}
                            title={`Select or drag ${isBottomWhite ? 'White' : 'Black'} ${getPieceFullName(piece)} onto board`}
                          >
                            <div className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center">
                              <SparePiece pieceType={pieceCharToSparePieceType(piece)} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="w-[1px] h-7 bg-white/10" />

                    {/* Eraser Tool */}
                    <button
                      type="button"
                      onClick={() => setSelectedPaletteTool(selectedPaletteTool === 'delete' ? null : 'delete')}
                      className={`p-1 sm:p-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center aspect-square h-10 w-10 sm:h-11 sm:w-11 shrink-0 ${
                        selectedPaletteTool === 'delete'
                          ? 'bg-rose-500/25 border-2 border-rose-400 ring-2 ring-rose-400/50 scale-105 shadow-lg shadow-rose-950/60 text-rose-300'
                          : 'bg-white/[0.03] hover:bg-rose-950/40 text-neutral-400 hover:text-rose-300 border border-white/[0.08] hover:border-rose-500/40'
                      }`}
                      title="Eraser: Click piece to remove from board"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                );
              })() : (
                /* Bottom Player Difficulty Badge Bar */
                (() => {
                  const bottomColor = boardOrientation === 'white' ? 'w' : 'b';
                  const bottomName = bottomColor === 'w' ? t.white : t.black;
                  const bottomIcon = bottomColor === 'w' ? '♔' : '♚';
                  const isTurn = game.turn() === bottomColor;
                  const isCheckmated = game.isCheckmate();
                  const diffInfo = getSideDifficultyInfo(bottomColor);

                  return (
                    <div className={`w-full max-w-[530px] mt-2 px-3.5 h-11 rounded-xl border flex items-center justify-between shadow-sm select-none shrink-0 transition-all ${
                      isTurn
                        ? 'bg-violet-950/25 border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.15)]'
                        : 'bg-white/[0.02] border-white/[0.08]'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          bottomColor === 'w' ? 'bg-white text-black shadow-sm' : 'bg-white/10 text-white border border-white/20'
                        }`}>
                          {bottomIcon}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-xs tracking-wider text-white uppercase">
                            {bottomName}
                          </span>
                          {isTurn && (
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shadow-[0_0_8px_rgba(167,139,250,0.9)]" />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center min-h-[26px]">
                        {isCheckmated ? (
                          game.turn() === bottomColor ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/30 text-[10px] font-mono font-bold uppercase tracking-wider">
                              ❌ {t.checkmated}
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold uppercase tracking-wider animate-bounce shadow-md">
                              🏆 {t.winner}
                            </span>
                          )
                        ) : isTurn && diffInfo ? (
                          <div className="flex items-center gap-1.5 animate-in fade-in duration-100">
                            <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">{t.difficulty}</span>
                            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-neutral-200 text-xs font-mono font-semibold shadow-sm">
                              <span>{diffInfo.icon}</span>
                              <span>{diffInfo.label}</span>
                            </div>
                          </div>
                        ) : isTurn && evaluating ? (
                          <div className="flex items-center gap-1.5 text-neutral-400 text-[10px] font-mono font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shadow-[0_0_6px_rgba(167,139,250,0.8)]"></span>
                            <span>{t.thinkingDots}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })()
              )}
            </ChessboardProvider>

            {/* Position Editor Quick Config Bar vs Normal Action Toolbar */}
            {isEditingPosition ? (
              <div className="w-full max-w-[530px] mt-3 p-3 bg-[#060818] border border-white/10 rounded-2xl shadow-xl flex flex-col gap-3">
                {/* Turn and Castling Options */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/[0.08]">
                  {/* Side to Move Toggle */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono font-bold text-neutral-400 uppercase tracking-wider">{t.turn}</span>
                    <div className="inline-flex p-0.5 bg-black/40 border border-white/[0.08] rounded-lg">
                      <button
                        type="button"
                        onClick={() => setEditTurn('w')}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                          editTurn === 'w'
                            ? 'bg-white text-black font-bold shadow'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <span>♔</span>
                        <span>{t.white}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditTurn('b')}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                          editTurn === 'b'
                            ? 'bg-white/15 text-white border border-white/20 shadow'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <span>♚</span>
                        <span>{t.black}</span>
                      </button>
                    </div>
                  </div>

                  {/* Castling Rights */}
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-wider mr-1">{t.castling}</span>
                    <button
                      type="button"
                      onClick={() => setEditCastling(p => ({ ...p, K: !p.K }))}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all border cursor-pointer ${
                        editCastling.K ? 'bg-violet-950/80 text-violet-300 border-violet-600/80 shadow-sm' : 'bg-black/30 text-neutral-600 border-white/[0.06]'
                      }`}
                      title="White Kingside (O-O)"
                    >
                      W O-O
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditCastling(p => ({ ...p, Q: !p.Q }))}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all border cursor-pointer ${
                        editCastling.Q ? 'bg-violet-950/80 text-violet-300 border-violet-600/80 shadow-sm' : 'bg-black/30 text-neutral-600 border-white/[0.06]'
                      }`}
                      title="White Queenside (O-O-O)"
                    >
                      W O-O-O
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditCastling(p => ({ ...p, k: !p.k }))}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all border cursor-pointer ${
                        editCastling.k ? 'bg-indigo-950/80 text-indigo-300 border-indigo-600/80 shadow-sm' : 'bg-black/30 text-neutral-600 border-white/[0.06]'
                      }`}
                      title="Black Kingside (O-O)"
                    >
                      B O-O
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditCastling(p => ({ ...p, q: !p.q }))}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all border cursor-pointer ${
                        editCastling.q ? 'bg-indigo-950/80 text-indigo-300 border-indigo-600/80 shadow-sm' : 'bg-black/30 text-neutral-600 border-white/[0.06]'
                      }`}
                      title="Black Queenside (O-O-O)"
                    >
                      B O-O-O
                    </button>
                  </div>
                </div>

                {/* Editor Action Buttons */}
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={clearEditBoard}
                    className="py-2 px-2 bg-white/[0.03] hover:bg-rose-950/40 text-neutral-300 hover:text-rose-200 border border-white/[0.08] hover:border-rose-500/40 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    title={t.clearTitle}
                  >
                    <span>🗑️</span>
                    <span>{t.clear}</span>
                  </button>

                  <button
                    type="button"
                    onClick={resetEditStartingPosition}
                    className="py-2 px-2 bg-white/[0.03] hover:bg-white/[0.08] text-neutral-300 border border-white/[0.08] hover:border-white/20 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    title={t.startingTitle}
                  >
                    <span>🔄</span>
                    <span>{t.starting}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
                    className="py-2 px-2 bg-white/[0.03] hover:bg-white/[0.08] text-neutral-300 border border-white/[0.08] hover:border-white/20 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    title={t.flipTitle}
                  >
                    <span>🔄</span>
                    <span>{t.flip} ({boardOrientation === 'white' ? 'W' : 'B'})</span>
                  </button>

                  <button
                    type="button"
                    onClick={finishEditingPosition}
                    className="py-2 px-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-violet-950/60 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    title={t.doneTitle}
                  >
                    <span>✓</span>
                    <span>{t.done}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Action Control Hub Below Board */
              <div className="w-full max-w-[530px] mt-3 space-y-2">
                {/* Row 1: Primary Move & Setup Navigation */}
                <div className="grid grid-cols-12 gap-2">
                  {/* Move History / Flip Segmented Group */}
                  <div className="col-span-7 flex items-center bg-black/40 border border-white/[0.08] rounded-xl p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={undoMove}
                      disabled={game.history().length === 0}
                      className={`flex-1 h-9 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 active:scale-95 ${
                        game.history().length === 0
                          ? 'text-neutral-600 cursor-not-allowed'
                          : 'text-neutral-300 hover:text-white hover:bg-white/[0.06] cursor-pointer'
                      }`}
                      title={t.undoTitle}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 14L4 9l5-5" />
                        <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
                      </svg>
                      <span className="hidden xs:inline sm:inline">{t.undo}</span>
                    </button>

                    <div className="w-[1px] h-4 bg-white/10 shrink-0" />

                    <button
                      type="button"
                      onClick={redoMove}
                      disabled={redoStack.length === 0}
                      className={`flex-1 h-9 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 active:scale-95 ${
                        redoStack.length === 0
                          ? 'text-neutral-600 cursor-not-allowed'
                          : 'text-neutral-300 hover:text-white hover:bg-white/[0.06] cursor-pointer'
                      }`}
                      title={t.redoTitle}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 14l5-5-5-5" />
                        <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" />
                      </svg>
                      <span className="hidden xs:inline sm:inline">{t.redo}</span>
                    </button>

                    <div className="w-[1px] h-4 bg-white/10 shrink-0" />

                    <button
                      type="button"
                      onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
                      className="flex-1 h-9 rounded-lg text-xs font-semibold text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                      title={t.flipTitle}
                    >
                      <svg className="w-3.5 h-3.5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                      <span>{t.flip}</span>
                    </button>
                  </div>

                  {/* Edit Position Action Button */}
                  <button
                    type="button"
                    onClick={startEditingPosition}
                    className="col-span-5 h-11 bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-600 hover:brightness-110 text-white rounded-xl text-xs font-bold transition-all shadow-[0_0_20px_rgba(139,92,246,0.35)] border border-violet-400/30 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    title={t.editBoardTitle}
                  >
                    <span className="text-sm">✏️</span>
                    <span>{t.editBoard}</span>
                  </button>
                </div>

                {/* Row 2: Secondary Utilities (3 equal grid pills with comfortable touch targets) */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowResetConfirmModal(true)}
                    className="h-10 bg-white/[0.03] hover:bg-rose-500/10 text-neutral-300 hover:text-rose-300 border border-white/[0.08] hover:border-rose-500/30 rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 group"
                    title={t.resetTitle}
                  >
                    <svg className="w-3.5 h-3.5 text-neutral-400 group-hover:text-rose-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    <span>{t.reset}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(true)}
                    className="h-10 bg-white/[0.03] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.08] hover:border-white/20 rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    title={t.settingsTitle}
                  >
                    <span className="text-sm">⚙️</span>
                    <span>{t.settings}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowShareModal(true)}
                    className="h-10 bg-white/[0.03] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.08] hover:border-white/20 rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    title={t.shareTitle}
                  >
                    <span className="text-sm">🔗</span>
                    <span>{t.share}</span>
                  </button>
                </div>

                {/* FEN Bar: Spacious and cleanly structured */}
                <div className="flex items-center justify-between gap-2 p-1.5 bg-white/[0.02] border border-white/[0.08] rounded-xl shadow-sm">
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-black/40 border border-white/[0.06] rounded-lg min-w-0 flex-1 h-9">
                    <span className="font-mono text-xs text-neutral-300 truncate select-all flex-1" title={isEditingPosition ? boardToFen(editBoard, editTurn, editCastling) : game.fen()}>
                      <span className="text-neutral-500 mr-1.5 font-bold">FEN:</span>{isEditingPosition ? boardToFen(editBoard, editTurn, editCastling) : game.fen()}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const str = isEditingPosition ? boardToFen(editBoard, editTurn, editCastling) : game.fen();
                        navigator.clipboard.writeText(str);
                        setCopiedFen(true);
                        setTimeout(() => setCopiedFen(false), 2000);
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer border shrink-0 ${
                        copiedFen
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                          : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border-white/10 hover:border-white/20'
                      }`}
                      title={t.copyFenTitle}
                    >
                      <span>{copiedFen ? '✓' : '📋'}</span>
                      <span>{copiedFen ? t.copied : t.copy}</span>
                    </button>
                  </div>

                  {!isEditingPosition && (
                    <button
                      type="button"
                      onClick={() => {
                        setFenInput(game.fen());
                        setFenLoadError(null);
                        setShowLoadFenModal(true);
                      }}
                      className="h-9 px-3.5 bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/10 hover:border-white/20 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0 active:scale-95"
                      title={t.loadFenTitle}
                    >
                      <span>📥</span>
                      <span>{t.loadFen}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
            
            {errorMessage && (
              <div className="mt-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm font-semibold max-w-[530px] w-full text-center">
                {errorMessage}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Engine Analysis OR Position Editor Panel */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="bg-[#060818]/90 p-5 sm:p-6 rounded-2xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-md h-full flex flex-col justify-between relative overflow-hidden">
            {/* Ambient violet background aura */}
            <div className="pointer-events-none absolute -bottom-24 -right-24 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl" />
            <div className="pointer-events-none absolute -top-24 -left-24 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl" />

            {isEditingPosition ? (
              <div className="flex flex-col h-full justify-between gap-6 relative z-10">
                <div>
                  {/* Position Editor Header */}
                  <div className="mb-5 p-4 rounded-xl bg-gradient-to-r from-violet-950/40 via-[#070b22] to-indigo-950/30 border border-violet-500/30 flex items-center justify-between shadow-md">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">♟️</span>
                      <div>
                        <h2 className="font-extrabold text-base text-violet-200">{t.customPositionSetup}</h2>
                        <p className="text-xs text-violet-300/70">{t.customPositionDesc}</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 border border-violet-400/40 text-[10px] font-mono font-bold tracking-wider animate-pulse">
                      {t.editing}
                    </span>
                  </div>

                  {/* Step by Step Instructions */}
                  <div className="p-4 bg-white/[0.02] border border-white/[0.08] rounded-xl space-y-3 mb-5">
                    <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span>💡</span> {t.quickSetupGuide}
                    </h3>
                    <ul className="text-xs text-gray-400 space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                        <span><strong className="text-gray-200">{t.setupStep1Title}</strong> {t.setupStep1Desc}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                        <span><strong className="text-gray-200">{t.setupStep2Title}</strong> {t.setupStep2Desc}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</span>
                        <span><strong className="text-gray-200">{t.setupStep3Title}</strong> {t.setupStep3Desc}</span>
                      </li>
                    </ul>
                  </div>

                  {/* Piece Inventory / Counts */}
                  {(() => {
                    let wK = 0, wQ = 0, wR = 0, wB = 0, wN = 0, wP = 0;
                    let bK = 0, bQ = 0, bR = 0, bB = 0, bN = 0, bP = 0;
                    Object.values(editBoard).forEach((p) => {
                      if (!p) return;
                      if (p.color === 'w') {
                        if (p.type === 'k') wK++;
                        else if (p.type === 'q') wQ++;
                        else if (p.type === 'r') wR++;
                        else if (p.type === 'b') wB++;
                        else if (p.type === 'n') wN++;
                        else if (p.type === 'p') wP++;
                      } else {
                        if (p.type === 'k') bK++;
                        else if (p.type === 'q') bQ++;
                        else if (p.type === 'r') bR++;
                        else if (p.type === 'b') bB++;
                        else if (p.type === 'n') bN++;
                        else if (p.type === 'p') bP++;
                      }
                    });

                    const totalWhite = wK + wQ + wR + wB + wN + wP;
                    const totalBlack = bK + bQ + bR + bB + bN + bP;

                    return (
                      <div className="p-4 bg-white/[0.02] border border-white/[0.08] rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                            Piece Summary:
                          </h3>
                          <span className="text-[11px] font-mono text-gray-400">
                            Total: {totalWhite + totalBlack} pieces
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {/* White Pieces */}
                          <div className="p-2.5 bg-black/40 border border-white/[0.06] rounded-xl">
                            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/[0.06]">
                              <span className="font-bold text-xs text-slate-200">White ({totalWhite})</span>
                              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${wK === 1 ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60' : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'}`}>
                                {wK === 1 ? '1 King ✓' : `${wK} King ⚠️`}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-xs font-mono text-gray-300">
                              <span className="px-1.5 py-0.5 bg-white/[0.04] rounded border border-white/[0.08]">♕ {wQ}</span>
                              <span className="px-1.5 py-0.5 bg-white/[0.04] rounded border border-white/[0.08]">♖ {wR}</span>
                              <span className="px-1.5 py-0.5 bg-white/[0.04] rounded border border-white/[0.08]">♗ {wB}</span>
                              <span className="px-1.5 py-0.5 bg-white/[0.04] rounded border border-white/[0.08]">♘ {wN}</span>
                              <span className="px-1.5 py-0.5 bg-white/[0.04] rounded border border-white/[0.08]">♙ {wP}</span>
                            </div>
                          </div>

                          {/* Black Pieces */}
                          <div className="p-2.5 bg-black/40 border border-white/[0.06] rounded-xl">
                            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/[0.06]">
                              <span className="font-bold text-xs text-slate-200">Black ({totalBlack})</span>
                              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${bK === 1 ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60' : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'}`}>
                                {bK === 1 ? '1 King ✓' : `${bK} King ⚠️`}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-xs font-mono text-gray-300">
                              <span className="px-1.5 py-0.5 bg-white/[0.04] rounded border border-white/[0.08]">♛ {bQ}</span>
                              <span className="px-1.5 py-0.5 bg-white/[0.04] rounded border border-white/[0.08]">♜ {bR}</span>
                              <span className="px-1.5 py-0.5 bg-white/[0.04] rounded border border-white/[0.08]">♝ {bB}</span>
                              <span className="px-1.5 py-0.5 bg-white/[0.04] rounded border border-white/[0.08]">♞ {bN}</span>
                              <span className="px-1.5 py-0.5 bg-white/[0.04] rounded border border-white/[0.08]">♟ {bP}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Bottom Action Footer */}
                <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={cancelEditingPosition}
                    className="px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white rounded-xl text-xs font-bold transition-all border border-white/[0.08] cursor-pointer"
                  >
                    Cancel Editing
                  </button>
                  <button
                    type="button"
                    onClick={finishEditingPosition}
                    className="flex-1 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition-all shadow-[0_0_20px_rgba(139,92,246,0.35)] border border-violet-400/40 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <span>✓</span>
                    <span>Apply & Analyze Position</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative z-10 flex flex-col justify-between h-full">
                <div>
                  {/* Header with Stockfish ON/OFF Toggle Switch & Position Eval Display */}
                <div className="mb-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] flex flex-col gap-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Toggle Switch */}
                    <button
                      onClick={() => setStockfishEnabled(!stockfishEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all focus:outline-none cursor-pointer ${
                        stockfishEnabled ? 'bg-violet-600 shadow-[0_0_12px_rgba(139,92,246,0.6)]' : 'bg-gray-800/80 border border-white/10'
                      }`}
                      title={stockfishEnabled ? "Turn Stockfish Engine OFF" : "Turn Stockfish Engine ON"}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                          stockfishEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-200 tracking-tight">Stockfish Engine</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${stockfishEnabled ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-gray-600'}`} />
                    </div>
                  </div>

                  {/* Position Eval Score Badge */}
                  {stockfishEnabled && (() => {
                    if (game.isCheckmate()) {
                      const winner = game.turn() === 'w' ? 'Black' : 'White';
                      return (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono font-bold text-xs shadow-sm bg-rose-950/80 text-rose-300 border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse">
                          <span>🏆</span>
                          <span>Checkmate ({winner} Won)</span>
                        </div>
                      );
                    }
                    if (game.isDraw() || game.isStalemate()) {
                      return (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono font-bold text-xs shadow-sm bg-white/[0.04] text-amber-300 border-amber-500/40">
                          <span>½-½</span>
                          <span>Draw ({game.isStalemate() ? 'Stalemate' : 'Draw'})</span>
                        </div>
                      );
                    }
                    const str = positionEval?.evalWhiteStr || '+0.00';
                    const isMate = positionEval?.scoreType === 'mate' || str.includes('#M');
                    const val = isMate ? (str.includes('-') ? -999 : 999) : parseFloat(str);
                    const isEqual = !isMate && Math.abs(val) <= 0.15;
                    const isWhiteAhead = !isEqual && val > 0.15;
                    const isBlackAhead = !isEqual && val < -0.15;

                    let badgeClass = 'bg-white/[0.03] text-gray-300 border-white/[0.08]';
                    let displayEval = '+0.00';

                    if (!positionEval) {
                      badgeClass = 'bg-white/[0.02] text-gray-500 border-white/[0.06]';
                      displayEval = '...';
                    } else if (isEqual) {
                      badgeClass = 'bg-white/[0.04] text-slate-200 border-white/[0.1]';
                      displayEval = '0.00 (Equal)';
                    } else if (isWhiteAhead) {
                      badgeClass = 'bg-violet-950/70 text-violet-200 border-violet-500/40 shadow-[0_0_12px_rgba(139,92,246,0.25)]';
                      displayEval = `⚪ ${isMate ? str : (val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2))}`;
                    } else if (isBlackAhead) {
                      badgeClass = 'bg-indigo-950/80 text-indigo-200 border-indigo-500/40 shadow-[0_0_12px_rgba(99,102,241,0.25)]';
                      displayEval = `⚫ +${isMate ? str.replace('-', '') : Math.abs(val).toFixed(2)}`;
                    }

                    return (
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono font-bold text-xs shadow-sm transition-colors duration-300 ${badgeClass}`}>
                        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-sans">Eval</span>
                        <span className="text-xs">{displayEval}</span>
                      </div>
                    );
                  })()}

                  {evaluating && (
                    <span className="animate-spin text-violet-400 text-lg font-bold">⚙</span>
                  )}
                </div>


                {/* Move Count Switcher (Top 5 vs Top 10) - Standard & Random Modes */}
                {gameMode !== 'human' && (
                  <div className="pt-2.5 mt-0.5 border-t border-white/[0.06] flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-gray-300 font-medium">
                      <svg className="w-3.5 h-3.5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 6h16M4 12h16M4 18h7" />
                      </svg>
                      <span className="text-gray-400">Moves to display:</span>
                      <span className="font-bold text-violet-300 font-mono">Top {moveLimit}</span>
                    </div>
                    <div className="inline-flex p-0.5 bg-black/50 border border-white/[0.08] rounded-lg shadow-inner">
                      <button
                        type="button"
                        onClick={() => setMoveLimit(5)}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          moveLimit === 5
                            ? 'bg-violet-600 text-white shadow-sm shadow-violet-950'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                        }`}
                        title="Show top 5 best and worst moves"
                      >
                        Top 5
                      </button>
                      <button
                        type="button"
                        onClick={() => setMoveLimit(10)}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          moveLimit === 10
                            ? 'bg-violet-600 text-white shadow-sm shadow-violet-950'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                        }`}
                        title="Show top 10 best and worst moves"
                      >
                        Top 10
                      </button>
                    </div>
                  </div>
                )}

                {/* Bad Moves Visibility Control Card - Standard & Random Modes */}
                {gameMode !== 'human' && (
                  <div className="pt-3 mt-1 border-t border-white/[0.06] flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const nextVal = !showWorst;
                            setShowWorst(nextVal);
                            if (!nextVal) {
                              setWorstMoves([]);
                            }
                          }}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                            showWorst ? 'bg-rose-600 shadow-[0_0_10px_rgba(225,29,72,0.4)]' : 'bg-gray-800 border border-white/10'
                          }`}
                          title={showWorst ? "Click to hide bad moves" : "Click to show bad moves"}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              showWorst ? 'translate-x-4.5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <div>
                          <span className="font-bold text-xs text-gray-200">Show Bad Moves</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Human Mode Controls (Human Mode Only) */}
                {gameMode === 'human' && (
                  <div className="pt-3.5 mt-1 border-t border-white/[0.06] flex flex-col gap-3">
                    {/* Target Skill Level / Elo Selector */}
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-sm font-bold text-violet-300 flex items-center gap-2">
                          Skill Level:
                        </span>
                        <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 border border-violet-400/40 uppercase shadow-sm">
                          {humanSkillLevel === 'club' ? 'Club' : humanSkillLevel === 'intermediate' ? 'Intermediate' : humanSkillLevel === 'advanced' ? 'Advanced' : 'Master'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 bg-black/40 border border-white/[0.08] rounded-2xl shadow-inner">
                        {([
                          { lvl: 'club', label: 'Club', elo: '1200–1500', icon: '🥉' },
                          { lvl: 'intermediate', label: 'Intermediate', elo: '1500–1800', icon: '🥈' },
                          { lvl: 'advanced', label: 'Advanced', elo: '1800–2100', icon: '🥇' },
                          { lvl: 'master', label: 'Master', elo: '2200+', icon: '👑' },
                        ] as const).map(({ lvl, label, elo, icon }) => {
                          const isSel = humanSkillLevel === lvl;
                          return (
                            <button
                              key={lvl}
                              type="button"
                              onClick={() => setHumanSkillLevel(lvl)}
                              className={`py-2.5 px-2 rounded-xl transition-all flex flex-col items-center justify-center gap-1 text-center cursor-pointer ${
                                isSel
                                  ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-950/80 border border-violet-400/50 scale-[1.02]'
                                  : 'text-gray-400 hover:text-white hover:bg-white/[0.04] border border-white/[0.04] hover:border-white/[0.1]'
                              }`}
                            >
                              <span className="text-xl">{icon}</span>
                              <span className="text-xs font-bold tracking-tight">{label}</span>
                              <span className={`text-[10px] font-mono ${isSel ? 'text-violet-100 font-bold' : 'text-gray-400'}`}>{elo}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Natural Thinking Time (Human Mode Only) */}
                    <div className="pt-3 border-t border-white/[0.06] flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              const nextState = !timingEnabled;
                              setTimingEnabled(nextState);
                              setConnectDifficultyDelay(true);
                              if (!nextState) {
                                clearDelayTimers();
                              } else {
                                triggerSuggestionDelay();
                              }
                            }}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 cursor-pointer ${
                              timingEnabled ? 'bg-violet-600 shadow-[0_0_10px_rgba(139,92,246,0.5)]' : 'bg-gray-800 border border-white/10'
                            }`}
                            title={timingEnabled ? "Turn Natural Thinking Time OFF" : "Turn Natural Thinking Time ON"}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                timingEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                          <div>
                            <span className="font-bold text-xs text-gray-200">Natural Thinking Time</span>
                          </div>
                        </div>

                        {timingEnabled && (
                          <button
                            type="button"
                            onClick={() => setShowDifficultyPresetsEditor((prev) => !prev)}
                            className="text-xs font-semibold text-violet-300 hover:text-violet-200 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 hover:bg-violet-500/20 border border-violet-400/30 transition-all shadow-sm active:scale-95 shrink-0 cursor-pointer"
                            title={showDifficultyPresetsEditor ? "Hide custom time presets" : "Edit delay range for each difficulty"}
                          >
                            <span>⚙️</span>
                            <span>{showDifficultyPresetsEditor ? 'Hide Times' : 'Edit Times'}</span>
                            <span className="text-[9px] text-violet-400">{showDifficultyPresetsEditor ? '▲' : '▼'}</span>
                          </button>
                        )}
                      </div>

                      {timingEnabled && (
                        <div className="flex flex-col gap-2.5">
                          {/* Think on Our Moves Only (Nested Sub-option) */}
                          <div className="ml-3 pl-3.5 border-l-2 border-violet-500/40 py-0.5 flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextVal = !thinkOurTurnOnly;
                                    setThinkOurTurnOnly(nextVal);
                                    const ourColor = boardOrientation === 'white' ? 'w' : 'b';
                                    if (nextVal && game.turn() !== ourColor) {
                                      clearDelayTimers();
                                    }
                                  }}
                                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-none shrink-0 cursor-pointer ${
                                    thinkOurTurnOnly ? 'bg-violet-600 shadow-sm shadow-violet-950' : 'bg-gray-800 border border-white/10'
                                  }`}
                                  title={thinkOurTurnOnly ? "Thinking enabled for our moves only (opponent moves instant)" : "Thinking enabled for all moves (both white and black)"}
                                >
                                  <span
                                    className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                                      thinkOurTurnOnly ? 'translate-x-3.5' : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                                <div>
                                  <span className="font-medium text-xs text-gray-300">Think On Our Moves Only</span>
                                </div>
                              </div>
                            </div>

                          {/* Compact Active Rating Pill */}
                          {bestMoves && bestMoves.length > 0 && (() => {
                            const diff = getPositionDifficulty(bestMoves);
                            const cat = diff?.catName || 'Normal';
                            const activePreset = getEffectiveDifficultyPreset(cat, difficultyPresets, game);
                            return (
                              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.08] text-xs shadow-inner">
                                <div className="flex items-center gap-2">
                                  <span className="text-base">{diff?.iconTag || '🟢'}</span>
                                  <span className="text-gray-400 font-medium">Difficulty:</span>
                                  <span className={`font-bold ${diff?.bTxt || 'text-violet-300'}`}>{cat}</span>
                                </div>
                                <div className="flex items-center gap-2 font-mono text-xs">
                                  <span className="text-gray-400 font-sans text-[11px]">Thinking Delay:</span>
                                  <span className="font-bold text-violet-200 bg-violet-500/15 px-2.5 py-0.5 rounded-full border border-violet-400/30 shadow-sm">
                                    {activePreset.min}s – {activePreset.max}s
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Custom Presets Table / Editor (Expanded) */}
                          {showDifficultyPresetsEditor && (
                            <div className="p-3 bg-black/50 border border-white/[0.08] rounded-xl flex flex-col gap-2 shadow-inner">
                              <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
                                <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1.5">
                                  <span>⚙️</span> Customize Delay per Difficulty
                                </span>
                                <button
                                  type="button"
                                  onClick={handleResetDifficultyPresets}
                                  className="text-[10px] text-violet-400 hover:text-violet-300 underline font-semibold transition-colors cursor-pointer"
                                >
                                  Reset Defaults
                                </button>
                              </div>

                              <div className="grid grid-cols-1 gap-1.5 pt-1">
                                {(['Obvious', 'Easy', 'Normal', 'Tricky', 'Hard'] as DifficultyCategory[]).map((cat) => {
                                  const preset = getEffectiveDifficultyPreset(cat, difficultyPresets, game);
                                  const activeCat = getPositionDifficulty(bestMoves)?.catName;
                                  const isActive = activeCat === cat;

                                  const badgeStyles: Record<DifficultyCategory, { bg: string; txt: string; bdr: string; icon: string }> = {
                                    Obvious: { bg: 'bg-emerald-950/80', txt: 'text-emerald-300', bdr: 'border-emerald-700/80', icon: '⚡' },
                                    Easy: { bg: 'bg-green-950/80', txt: 'text-green-300', bdr: 'border-green-700/80', icon: '🟢' },
                                    Normal: { bg: 'bg-amber-950/80', txt: 'text-amber-300', bdr: 'border-amber-700/80', icon: '🟡' },
                                    Tricky: { bg: 'bg-rose-950/80', txt: 'text-rose-300', bdr: 'border-rose-700/80', icon: '🔴' },
                                    Hard: { bg: 'bg-purple-950/80', txt: 'text-purple-300', bdr: 'border-purple-700/80', icon: '🟣' },
                                  };
                                  const style = badgeStyles[cat];

                                  return (
                                    <div
                                      key={cat}
                                      className={`p-2 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                                        isActive
                                          ? `${style.bg} ${style.bdr} ring-1 ring-violet-400/50 shadow-sm`
                                          : 'bg-white/[0.02] border-white/[0.06]'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-[100px]">
                                        <span className="text-xs">{style.icon}</span>
                                        <span className={`text-xs font-bold ${style.txt}`}>{cat}</span>
                                        {isActive && (
                                          <span className="text-[9px] bg-violet-500/20 text-violet-300 border border-violet-400/40 px-1.5 py-0.2 rounded-full font-bold uppercase">
                                            ACTIVE
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 font-mono text-xs">
                                        <div className="flex items-center gap-1">
                                          <span className="text-[10px] text-gray-400 font-sans">Min:</span>
                                          <input
                                            type="number"
                                            min={0}
                                            max={60}
                                            value={preset.min}
                                            onChange={(e) => handleDifficultyPresetChange(cat, 'min', parseInt(e.target.value, 10))}
                                            className="w-12 bg-black/60 border border-white/[0.1] rounded px-1.5 py-0.5 text-center text-gray-200 font-bold focus:outline-none focus:border-violet-500"
                                          />
                                          <span className="text-gray-400 text-[10px] font-sans">s</span>
                                        </div>

                                        <span className="text-gray-500 font-mono">–</span>

                                        <div className="flex items-center gap-1">
                                          <span className="text-[10px] text-gray-400 font-sans">Max:</span>
                                          <input
                                            type="number"
                                            min={0}
                                            max={60}
                                            value={preset.max}
                                            onChange={(e) => handleDifficultyPresetChange(cat, 'max', parseInt(e.target.value, 10))}
                                            className="w-12 bg-black/60 border border-white/[0.1] rounded px-1.5 py-0.5 text-center text-gray-200 font-bold focus:outline-none focus:border-violet-500"
                                          />
                                          <span className="text-gray-400 text-[10px] font-sans">s</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Random Good Move Selection Feature Control Card (Full Control Mode Only) */}
                {gameMode === 'random' && (
                  <div className="pt-3 mt-1 border-t border-white/[0.06] flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const nextVal = !randomGoodMovesEnabled;
                            setRandomGoodMovesEnabled(nextVal);
                            if (nextVal && bestMoves.length > 0 && randomGoodMoves.length === 0) {
                              setRandomGoodMoves(pickTwoRandomGoodMoves(bestMoves));
                            }
                          }}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 cursor-pointer ${
                            randomGoodMovesEnabled ? 'bg-fuchsia-600 shadow-[0_0_10px_rgba(217,70,239,0.5)]' : 'bg-gray-800 border border-white/10'
                          }`}
                          title={randomGoodMovesEnabled ? "Turn Random Good Moves OFF (suggest standard top moves)" : "Turn Random Good Moves ON (randomly pick from top pool)"}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              randomGoodMovesEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-gray-200">Random Good Moves</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              randomGoodMovesEnabled ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-400/40' : 'bg-white/[0.04] text-gray-500'
                            }`}>
                              {randomGoodMovesEnabled ? 'ON' : 'OFF'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Opponent Move Suggestions Feature Control Card (Full Control Mode Only) */}
                {gameMode === 'random' && (
                  <div className="pt-3 mt-1 border-t border-white/[0.06] flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const nextState = !showOpponentMoves;
                            setShowOpponentMoves(nextState);
                            if (nextState) {
                              if (stockfishEnabled && !game.isGameOver()) {
                                evaluatePosition();
                              }
                            } else {
                              const ourColor = boardOrientation === 'white' ? 'w' : 'b';
                              if (game.turn() !== ourColor) {
                                setRandomGoodMoves([]);
                                setIsBadMoveActive(false);
                                setActiveBadMove(null);
                                clearDelayTimers();
                              }
                            }
                          }}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 cursor-pointer ${
                            showOpponentMoves ? 'bg-violet-600 shadow-[0_0_10px_rgba(139,92,246,0.5)]' : 'bg-gray-800 border border-white/10'
                          }`}
                          title={showOpponentMoves ? "Turn Opponent Suggestions OFF" : "Turn Opponent Suggestions ON"}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              showOpponentMoves ? 'translate-x-4.5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-gray-200">Opponent Suggestions</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              showOpponentMoves ? 'bg-violet-500/20 text-violet-300 border border-violet-400/40' : 'bg-white/[0.04] text-gray-500'
                            }`}>
                              {showOpponentMoves ? 'ON' : 'OFF'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Random Bad Move Feature Control Card (Full Control Mode Only) */}
                {gameMode === 'random' && (
                  <div className="pt-3 mt-1 border-t border-white/[0.06] flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setRandomBadMoveEnabled(!randomBadMoveEnabled)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 cursor-pointer ${
                            randomBadMoveEnabled ? 'bg-amber-600 shadow-[0_0_10px_rgba(217,119,6,0.5)]' : 'bg-gray-800 border border-white/10'
                          }`}
                          title={randomBadMoveEnabled ? "Turn Random Human Mistake OFF" : "Turn Random Human Mistake ON"}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              randomBadMoveEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-gray-200">Random Human Mistake</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              randomBadMoveEnabled ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-white/[0.04] text-gray-500'
                            }`}>
                              {randomBadMoveEnabled ? 'ON' : 'OFF'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Move Suggestion Timing Feature Control Card (Full Control Mode Only) */}
                {gameMode === 'random' && (
                  <div className="pt-3 mt-1 border-t border-white/[0.06] flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const nextState = !timingEnabled;
                            setTimingEnabled(nextState);
                            setConnectDifficultyDelay(true);
                            if (!nextState) {
                              clearDelayTimers();
                            } else if (randomGoodMoves.length > 0) {
                              triggerSuggestionDelay();
                            }
                          }}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 cursor-pointer ${
                            timingEnabled ? 'bg-violet-600 shadow-[0_0_10px_rgba(139,92,246,0.5)]' : 'bg-gray-800 border border-white/10'
                          }`}
                          title={timingEnabled ? "Turn Thinking Delay OFF" : "Turn Thinking Delay ON"}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              timingEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <div>
                          <span className="font-bold text-xs text-gray-200">Natural Thinking Time</span>
                        </div>
                      </div>

                      {timingEnabled && (
                        <button
                          type="button"
                          onClick={() => setShowDifficultyPresetsEditor((prev) => !prev)}
                          className="text-xs font-semibold text-violet-300 hover:text-violet-200 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 hover:bg-violet-500/20 border border-violet-400/30 transition-all shadow-sm active:scale-95 shrink-0 cursor-pointer"
                          title={showDifficultyPresetsEditor ? "Hide custom time presets" : "Edit delay range for each difficulty"}
                        >
                          <span>⚙️</span>
                          <span>{showDifficultyPresetsEditor ? 'Hide Times' : 'Edit Times'}</span>
                          <span className="text-[9px] text-violet-400">{showDifficultyPresetsEditor ? '▲' : '▼'}</span>
                        </button>
                      )}
                    </div>

                    {timingEnabled && (
                      <div className="flex flex-col gap-2.5">
                        {/* Think on Our Moves Only (Nested Sub-option in Full Control Mode) */}
                        <div className="ml-3 pl-3.5 border-l-2 border-violet-500/40 py-0.5 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                const nextVal = !thinkOurTurnOnly;
                                setThinkOurTurnOnly(nextVal);
                                const ourColor = boardOrientation === 'white' ? 'w' : 'b';
                                if (nextVal && game.turn() !== ourColor) {
                                  clearDelayTimers();
                                }
                              }}
                              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-none shrink-0 cursor-pointer ${
                                thinkOurTurnOnly ? 'bg-violet-600 shadow-sm shadow-violet-950' : 'bg-gray-800 border border-white/10'
                              }`}
                              title={thinkOurTurnOnly ? "Thinking enabled for our moves only (opponent moves instant)" : "Thinking enabled for all moves (both white and black)"}
                            >
                              <span
                                className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                                  thinkOurTurnOnly ? 'translate-x-3.5' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                            <div>
                              <span className="font-medium text-xs text-gray-300">Think On Our Moves Only</span>
                            </div>
                          </div>
                        </div>

                        {/* Compact Active Rating Pill */}
                        {bestMoves && bestMoves.length > 0 && (() => {
                          const diff = getPositionDifficulty(bestMoves);
                          const cat = diff?.catName || 'Normal';
                          const activePreset = getEffectiveDifficultyPreset(cat, difficultyPresets, game);
                          return (
                            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.08] text-xs shadow-inner">
                              <div className="flex items-center gap-2">
                                <span className="text-base">{diff?.iconTag || '🟢'}</span>
                                <span className="text-gray-400 font-medium">Difficulty:</span>
                                <span className={`font-bold ${diff?.bTxt || 'text-violet-300'}`}>{cat}</span>
                              </div>
                              <div className="flex items-center gap-2 font-mono text-xs">
                                <span className="text-gray-400 font-sans text-[11px]">Thinking Delay:</span>
                                <span className="font-bold text-violet-200 bg-violet-500/15 px-2.5 py-0.5 rounded-full border border-violet-400/30 shadow-sm">
                                  {activePreset.min}s – {activePreset.max}s
                                </span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Collapsible Presets Table / Editor */}
                        {showDifficultyPresetsEditor && (
                          <div className="p-3 bg-black/50 border border-white/[0.08] rounded-xl flex flex-col gap-2 shadow-inner">
                            <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
                              <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1.5">
                                <span>⚙️</span> Customize Delay per Difficulty
                              </span>
                              <button
                                type="button"
                                onClick={handleResetDifficultyPresets}
                                className="text-[10px] text-violet-400 hover:text-violet-300 underline font-semibold transition-colors cursor-pointer"
                              >
                                Reset Defaults
                              </button>
                            </div>

                            <div className="grid grid-cols-1 gap-1.5 pt-1">
                              {(['Obvious', 'Easy', 'Normal', 'Tricky', 'Hard'] as DifficultyCategory[]).map((cat) => {
                                const preset = getEffectiveDifficultyPreset(cat, difficultyPresets, game);
                                const activeCat = getPositionDifficulty(bestMoves)?.catName;
                                const isActive = activeCat === cat;

                                const badgeStyles: Record<DifficultyCategory, { bg: string; txt: string; bdr: string; icon: string }> = {
                                  Obvious: { bg: 'bg-emerald-950/80', txt: 'text-emerald-300', bdr: 'border-emerald-700/80', icon: '⚡' },
                                  Easy: { bg: 'bg-green-950/80', txt: 'text-green-300', bdr: 'border-green-700/80', icon: '🟢' },
                                  Normal: { bg: 'bg-amber-950/80', txt: 'text-amber-300', bdr: 'border-amber-700/80', icon: '🟡' },
                                  Tricky: { bg: 'bg-rose-950/80', txt: 'text-rose-300', bdr: 'border-rose-700/80', icon: '🔴' },
                                  Hard: { bg: 'bg-purple-950/80', txt: 'text-purple-300', bdr: 'border-purple-700/80', icon: '🟣' },
                                };
                                const style = badgeStyles[cat];

                                return (
                                  <div
                                    key={cat}
                                    className={`p-2 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                                      isActive
                                        ? `${style.bg} ${style.bdr} ring-1 ring-violet-400/50 shadow-sm`
                                        : 'bg-white/[0.02] border-white/[0.06]'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-[100px]">
                                      <span className="text-xs">{style.icon}</span>
                                      <span className={`text-xs font-bold ${style.txt}`}>{cat}</span>
                                      {isActive && (
                                        <span className="text-[9px] bg-violet-500/20 text-violet-300 border border-violet-400/40 px-1.5 py-0.2 rounded-full font-bold uppercase">
                                          ACTIVE
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 font-mono text-xs">
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-gray-400 font-sans">Min:</span>
                                        <input
                                          type="number"
                                          min={0}
                                          max={60}
                                          value={preset.min}
                                          onChange={(e) => handleDifficultyPresetChange(cat, 'min', parseInt(e.target.value, 10))}
                                          className="w-12 bg-black/60 border border-white/[0.1] rounded px-1.5 py-0.5 text-center text-gray-200 font-bold focus:outline-none focus:border-violet-500"
                                        />
                                        <span className="text-gray-400 text-[10px] font-sans">s</span>
                                      </div>

                                      <span className="text-gray-500 font-mono">–</span>

                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-gray-400 font-sans">Max:</span>
                                        <input
                                          type="number"
                                          min={0}
                                          max={60}
                                          value={preset.max}
                                          onChange={(e) => handleDifficultyPresetChange(cat, 'max', parseInt(e.target.value, 10))}
                                          className="w-12 bg-black/60 border border-white/[0.1] rounded px-1.5 py-0.5 text-center text-gray-200 font-bold focus:outline-none focus:border-violet-500"
                                        />
                                        <span className="text-gray-400 text-[10px] font-sans">s</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Best Moves */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-base font-bold flex items-center gap-2 text-gray-200">
                      <span className="relative flex h-2 w-2">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${gameMode === 'human' ? 'bg-cyan-400' : 'bg-emerald-400'}`}></span>
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${gameMode === 'human' ? 'bg-cyan-500' : 'bg-emerald-500'}`}></span>
                      </span>
                      {gameMode === 'human' ? (
                        <span>{t.humanCandidateMoves}</span>
                      ) : gameMode === 'random' ? (
                        <span className="flex items-center gap-2 flex-wrap">
                          <span>{randomGoodMovesEnabled ? t.suggestedGoodMoves : t.topBestMoves.replace('{limit}', String(moveLimit))}</span>
                          {game.turn() !== (boardOrientation === 'white' ? 'w' : 'b') && showOpponentMoves && (
                            <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-400/30 text-[10px] font-mono font-bold tracking-wide shadow-sm">
                              {t.opponentsTurn.replace('{color}', game.turn() === 'w' ? t.white : t.black)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span>{t.topBestMoves.replace('{limit}', String(moveLimit))}</span>
                      )}
                    </h2>
                  </div>

                  {gameMode === 'random' &&
                    randomGoodMovesEnabled &&
                    bestMoves.length > 2 &&
                    displayedBestMoves.length > 0 &&
                    !(
                      displayedBestMoves.length === 1 &&
                      ((displayedBestMoves[0]?.scoreType === 'mate' &&
                        displayedBestMoves[0]?.rawScore > 0 &&
                        displayedBestMoves[0]?.rawScore <= 3) ||
                        getPositionDifficulty(bestMoves)?.catName === 'Obvious')
                    ) && (
                      <button
                        type="button"
                        onClick={() => {
                          setRandomGoodMoves(pickTwoRandomGoodMoves(bestMoves));
                          if (timingEnabled) {
                            triggerSuggestionDelay();
                          }
                        }}
                        className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white border border-white/[0.08] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 shrink-0 cursor-pointer"
                        title={t.rerollTitle}
                      >
                        <span>🎲</span>
                        <span>{t.reroll}</span>
                      </button>
                    )}
                </div>
                
                {/* Suggested Moves section banner when Random Bad Move Feature triggers a bad move */}
                {randomBadMoveEnabled && isBadMoveActive && (
                  <div className="p-3 bg-amber-950/30 border border-amber-500/40 rounded-xl text-xs text-amber-200 flex items-center justify-between shadow-md mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl animate-bounce">🎲</span>
                      <div>
                        <p className="font-bold text-amber-100 flex items-center gap-2">
                          {t.randomBadMoveTriggered}
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-900/60 text-[10px] text-amber-300 font-mono font-bold border border-amber-600/40">{t.mistakeIntroduced}</span>
                        </p>
                        <p className="text-[11px] text-amber-300/80">
                          {t.engineMistakeDesc.replace('{count}', String(consecutiveGoodMoves))}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="min-h-[320px] flex flex-col justify-start">
                  {!stockfishEnabled ? (
                    <div className="min-h-[320px] flex flex-col items-center justify-center text-center p-6 bg-white/[0.01] rounded-xl border border-white/[0.06]">
                      <span className="text-3xl mb-2 opacity-40">⚙️</span>
                      <p className="text-gray-300 text-sm font-semibold">{t.stockfishOff}</p>
                      <p className="text-gray-500 text-xs mt-1 max-w-xs">{t.stockfishOffDesc}</p>
                    </div>
                  ) : gameMode === 'random' && !showOpponentMoves && game.turn() !== (boardOrientation === 'white' ? 'w' : 'b') ? (
                    <div className="min-h-[320px] flex flex-col items-center justify-center text-center p-6 bg-violet-950/20 rounded-xl border border-violet-500/30 text-violet-200/90">
                      <span className="text-3xl mb-2 animate-pulse">⏳</span>
                      <p className="font-bold text-sm text-violet-200">{t.opponentsTurn.replace('{color}', game.turn() === 'w' ? t.white : t.black)}</p>
                      <p className="text-xs text-violet-300/70 mt-1 max-w-xs">
                        {t.opponentsTurnDesc}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowOpponentMoves(true);
                          if (stockfishEnabled && !game.isGameOver()) {
                            evaluatePosition();
                          }
                        }}
                        className="mt-4 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border border-violet-400/40 rounded-xl text-xs font-bold transition-all shadow-lg shadow-violet-950/60 flex items-center gap-2 cursor-pointer active:scale-95"
                      >
                        <span>👁️</span>
                        <span>{t.turnOnOpponentMoves}</span>
                      </button>
                    </div>
                  ) : (gameMode === 'random' || gameMode === 'human') && timingEnabled && isDelaying ? (
                    <div className="p-4 bg-gradient-to-r from-violet-950/40 via-[#070b22] to-indigo-950/40 border border-violet-500/40 rounded-2xl shadow-xl flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl animate-spin text-violet-400">⏳</span>
                          <div>
                            <p className="font-bold text-sm text-violet-100 flex items-center gap-2">
                              {t.naturalThinkingTime}
                              <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-[10px] text-violet-300 font-mono font-bold animate-pulse border border-violet-400/40">
                                {t.thinking}
                              </span>
                            </p>
                            <p className="text-xs text-violet-300/70 mt-0.5">
                              {t.nextMoveShowsIn} <span className="font-bold text-white font-mono text-sm">{delayRemaining}s</span>
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => clearDelayTimers()}
                          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white border border-violet-400/40 rounded-lg text-xs font-bold transition-all active:scale-95 shadow-md flex items-center gap-1 cursor-pointer"
                          title={t.skipTitle}
                        >
                          <span>⚡</span>
                          <span>{t.skip}</span>
                        </button>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-black/60 h-2 rounded-full overflow-hidden border border-white/[0.08]">
                        <div
                          className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-400 transition-all duration-300 ease-linear"
                          style={{
                            width: `${totalDelay > 0 ? Math.min(100, Math.max(0, ((totalDelay - delayRemaining) / totalDelay) * 100)) : 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : game.isCheckmate() ? (() => {
                    const winner = game.turn() === 'w' ? t.black : t.white;
                    return (
                      <div className="min-h-[320px] flex flex-col items-center justify-center text-center p-6 bg-gradient-to-b from-rose-950/30 via-[#070b1e] to-black/80 rounded-2xl border border-rose-500/40 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 rounded-2xl bg-rose-950/60 border border-rose-500/50 flex items-center justify-center text-3xl mb-3 shadow-[0_0_25px_rgba(225,29,72,0.4)] animate-bounce">
                          👑
                        </div>
                        <span className="px-3 py-1 rounded-full bg-rose-950/80 text-rose-300 border border-rose-700/60 text-xs font-mono font-bold tracking-widest uppercase mb-1">
                          {t.checkmate}
                        </span>
                        <h3 className="text-xl font-extrabold text-white mt-1">
                          {t.wonByCheckmate.replace('{winner}', winner)}
                        </h3>
                        <p className="text-gray-400 text-xs mt-1.5 max-w-xs">
                          {t.trappedInCheck.replace('{color}', game.turn() === 'w' ? t.white : t.black)}
                        </p>

                        <div className="flex items-center gap-2 mt-5">
                          <button
                            type="button"
                            onClick={() => resetBoard()}
                            className="px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer active:scale-95"
                          >
                            {t.newGame}
                          </button>
                          <button
                            type="button"
                            onClick={() => undoMove()}
                            className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-gray-200 font-semibold text-xs rounded-xl border border-white/[0.08] transition-all cursor-pointer"
                          >
                            {t.undo}
                          </button>
                        </div>
                      </div>
                    );
                  })() : game.isDraw() || game.isStalemate() ? (() => {
                    const reason = game.isStalemate()
                      ? t.stalemate
                      : game.isThreefoldRepetition()
                      ? t.threefoldRepetition
                      : game.isInsufficientMaterial()
                      ? t.insufficientMaterial
                      : t.draw;
                    return (
                      <div className="min-h-[320px] flex flex-col items-center justify-center text-center p-6 bg-[#070b1e] rounded-2xl border border-amber-500/40 shadow-xl">
                        <div className="w-16 h-16 rounded-2xl bg-amber-950/50 border border-amber-600/60 flex items-center justify-center text-3xl mb-3">
                          🤝
                        </div>
                        <span className="px-3 py-1 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700/60 text-xs font-mono font-bold tracking-widest uppercase mb-1">
                          {t.gameDrawn}
                        </span>
                        <h3 className="text-xl font-extrabold text-white mt-1">
                          {reason}
                        </h3>
                        <div className="flex items-center gap-2 mt-5">
                          <button
                            type="button"
                            onClick={() => resetBoard()}
                            className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-white font-bold text-xs rounded-xl border border-white/[0.08] transition-all cursor-pointer active:scale-95"
                          >
                            {t.newGame}
                          </button>
                        </div>
                      </div>
                    );
                  })() : displayedBestMoves.length === 0 ? (
                    <div className="min-h-[320px] flex flex-col items-center justify-center text-center p-6 bg-white/[0.01] rounded-xl border border-white/[0.06]">
                      {evaluating ? (
                        <>
                          <span className="animate-spin text-3xl text-violet-400 mb-3">⚙</span>
                          <p className="text-gray-300 text-sm font-semibold">{t.calculatingBestMoves}</p>
                          <p className="text-gray-500 text-xs mt-1">{t.stockfishAnalyzing}</p>
                        </>
                      ) : (
                        <>
                          <span className="text-3xl mb-2 text-gray-600">♟️</span>
                          <p className="text-gray-400 text-sm font-semibold">{t.noEvaluations}</p>
                          <p className="text-gray-500 text-xs mt-1">{t.checkPositionStatus}</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <ul className="space-y-2 min-h-[320px] max-h-[380px] overflow-y-auto pr-1">
                      {displayedBestMoves.map((moveData, i) => {
                        if (gameMode === 'human') {
                          const details = moveData.humanDetails || getHumanMoveDetails(moveData.move, game, i);
                          return (
                            <li
                              key={`human-move-${moveData.move}-${i}`}
                              onMouseEnter={() => setHoveredMove(moveData.move)}
                              onMouseLeave={() => setHoveredMove(null)}
                              onClick={() => makeAMoveFromUCI(moveData.move)}
                              className={`flex justify-between items-center p-2.5 rounded-xl border transition-all cursor-pointer group ${
                                hoveredMove === moveData.move
                                  ? 'bg-violet-500/10 border-violet-400/80 shadow-[0_0_15px_rgba(139,92,246,0.25)] scale-[1.01]'
                                  : 'bg-black/40 hover:bg-white/[0.04] border-white/[0.06] hover:border-violet-500/30'
                              }`}
                              title={t.playMoveTitle}
                            >
                              <div className="flex items-center gap-3">
                                <span className="flex items-center justify-center w-6 h-6 rounded-lg font-mono font-bold text-xs bg-violet-500/15 text-violet-300 border border-violet-400/30 shrink-0">
                                  {i + 1}
                                </span>
                                <span className="font-mono text-sm font-bold text-gray-100 group-hover:text-white tracking-wide">
                                  {details.san}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 font-mono text-xs">
                                {(() => {
                                  const parsedH = parseFloat(moveData.scoreStr);
                                  const isHEq = !isNaN(parsedH) && Math.abs(parsedH) <= 0.15;
                                  const hScore = isHEq ? '0.00' : (parsedH > 0 ? `+${moveData.scoreStr}` : moveData.scoreStr);
                                  return (
                                    <span className="px-2.5 py-0.5 rounded-full bg-white/[0.04] text-gray-300 border border-white/[0.08] font-mono text-xs">
                                      {t.eval}: {hScore}
                                    </span>
                                  );
                                })()}
                              </div>
                            </li>
                          );
                        }

                        const parsed = parseFloat(moveData.scoreStr);
                        const isEq = !isNaN(parsed) && Math.abs(parsed) <= 0.15;
                        const isLoss = !isNaN(parsed) && parsed < -1.0;
                        const isHeavyLoss = !isNaN(parsed) && parsed < -2.5;

                        let moveEvalBadgeClass = 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40';
                        if (moveData.isTriggeredBadMove || isHeavyLoss) {
                          moveEvalBadgeClass = 'bg-rose-950/70 text-rose-300 border-rose-500/50';
                        } else if (isLoss) {
                          moveEvalBadgeClass = 'bg-amber-950/70 text-amber-300 border-amber-500/50';
                        } else if (isEq) {
                          moveEvalBadgeClass = 'bg-white/[0.04] text-slate-300 border-white/[0.08]';
                        }

                        const displayScore = isEq ? '0.00' : (parsed > 0 ? `+${moveData.scoreStr}` : moveData.scoreStr);
                        const moveSan = getHumanMoveDetails(moveData.move, game, i).san;
                        const continuationLine = (moveData.pv && moveData.pv.length > 1)
                          ? moveData.pv.slice(1, 4).join(' ')
                          : '';

                        return (
                          <li
                            key={`best-move-${moveData.move || 'unknown'}-${moveData.rank || i}-${i}`}
                            onMouseEnter={() => setHoveredMove(moveData.move)}
                            onMouseLeave={() => setHoveredMove(null)}
                            onClick={() => makeAMoveFromUCI(moveData.move)}
                            className={`flex justify-between items-center p-2.5 rounded-xl border transition-all cursor-pointer group ${
                              moveData.isTriggeredBadMove
                                ? 'bg-amber-950/30 border-amber-500/60 scale-[1.01] shadow-lg shadow-amber-950/40'
                                : hoveredMove === moveData.move
                                ? 'bg-violet-500/10 border-violet-400/80 shadow-[0_0_15px_rgba(139,92,246,0.25)] scale-[1.01]'
                                : 'bg-black/40 hover:bg-white/[0.04] border-white/[0.06] hover:border-violet-500/30'
                            }`}
                            title={t.playMoveTitle}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`flex items-center justify-center w-6 h-6 rounded-lg font-mono font-bold text-xs shrink-0 ${
                                moveData.isTriggeredBadMove
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-white/[0.05] text-gray-300 border border-white/[0.08] group-hover:border-violet-500/40 group-hover:text-violet-300'
                              }`}>
                                {moveData.isTriggeredBadMove ? '⚠️' : `#${moveData.rank || i + 1}`}
                              </span>
                              <div className="flex flex-col">
                                <div className="flex items-baseline gap-2">
                                  <span className={`font-mono text-sm font-bold tracking-wide ${
                                    moveData.isTriggeredBadMove ? 'text-amber-400' : 'text-gray-100 group-hover:text-white'
                                  }`}>{moveSan}</span>
                                  {moveSan !== moveData.move && (
                                    <span className="font-mono text-[11px] text-gray-500 group-hover:text-gray-400 font-normal">
                                      {moveData.move}
                                    </span>
                                  )}
                                  {moveData.isTriggeredBadMove && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-950 text-amber-300 border border-amber-700/60 font-bold">
                                      {t.randomBadMove}
                                    </span>
                                  )}
                                </div>
                                {continuationLine && (
                                  <span className="text-[10px] font-mono text-gray-400/80">
                                    ↳ {continuationLine}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className={`font-mono px-2.5 py-0.5 rounded-full text-xs font-semibold border ${moveEvalBadgeClass}`}>
                              {t.eval}: {displayScore}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* Bad Moves Section (Standard & Random Modes when showWorst is ON) */}
              {showWorst && gameMode !== 'human' && (
                <div className="mb-6 pt-5 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                      </span>
                      <h2 className="text-sm font-bold text-rose-300">
                        {t.topBadMoves.replace('{limit}', String(moveLimit))}
                      </h2>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-rose-950/60 text-rose-400 border border-rose-800/60 text-[10px] font-mono font-bold uppercase tracking-wider">
                      {t.avoidTheseMoves}
                    </span>
                  </div>

                  <div className="min-h-[100px] flex flex-col justify-start">
                    {!stockfishEnabled ? (
                      <div className="p-4 bg-white/[0.01] rounded-xl border border-white/[0.06] text-center">
                        <p className="text-gray-400 text-xs">{t.stockfishOff}</p>
                      </div>
                    ) : gameMode === 'random' && game.turn() !== (boardOrientation === 'white' ? 'w' : 'b') ? (
                      <div className="p-4 bg-violet-950/20 rounded-xl border border-violet-500/30 text-center">
                        <p className="text-xs text-violet-300">{t.opponentsTurn.replace('{color}', game.turn() === 'w' ? t.white : t.black)}</p>
                      </div>
                    ) : displayedWorstMoves.length === 0 ? (
                      <div className="p-4 bg-white/[0.01] rounded-xl border border-white/[0.06] text-center">
                        {evaluating ? (
                          <div className="flex items-center justify-center gap-2 text-gray-400 text-xs">
                            <span className="animate-spin text-sm text-rose-400">⚙</span>
                            <span>{t.calculatingBadMoves}</span>
                          </div>
                        ) : (
                          <p className="text-gray-500 text-xs">{t.noEvaluations}</p>
                        )}
                      </div>
                    ) : (
                      <ul className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {displayedWorstMoves.map((moveData, i) => (
                          <li
                            key={`worst-move-${moveData.move || 'unknown'}-${i}`}
                            onMouseEnter={() => setHoveredMove(moveData.move)}
                            onMouseLeave={() => setHoveredMove(null)}
                            onClick={() => makeAMoveFromUCI(moveData.move)}
                            className={`flex justify-between items-center p-2.5 rounded-xl border transition-all cursor-pointer group ${
                              hoveredMove === moveData.move
                                ? 'bg-rose-950/40 border-rose-500/60 scale-[1.01] shadow-lg shadow-rose-950/40'
                                : 'bg-black/40 hover:bg-rose-950/20 border-rose-900/30'
                            }`}
                            title={t.worstBlunderTitle}
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex items-center justify-center w-6 h-6 rounded-lg font-mono font-bold text-xs bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0">
                                #{i + 1}
                              </span>
                              <span className="font-mono text-sm font-bold tracking-wide text-rose-300 group-hover:text-rose-200">
                                {moveData.move}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-rose-950/80 text-rose-400 border border-rose-800/60 font-bold">
                                {t.worst.replace('{rank}', String(i + 1))}
                              </span>
                            </div>
                            <span className="font-mono px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/50">
                              {t.eval}: {parseFloat(moveData.scoreStr) > 0 ? '+' : ''}{moveData.scoreStr}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-white/[0.06] text-xs text-gray-500 flex justify-between items-center font-mono">
              <span className="flex items-center gap-2 text-gray-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-gray-300 text-xs">{t.stockfishNnue}</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-gray-400">
                {t.realTimeAnalysis}
              </span>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  </div>

      {/* Confirmation Modal for Reset Board */}
      {showResetConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setShowResetConfirmModal(false)}
        >
          <div
            className="bg-[#060818]/95 border border-white/[0.12] rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 text-center transform transition-all scale-100 relative overflow-hidden backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute -bottom-16 -right-16 w-40 h-40 bg-rose-600/15 rounded-full blur-2xl" />
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto text-xl shadow-inner relative z-10">
              ⚠️
            </div>
            <div className="relative z-10">
              <h3 className="text-base font-bold text-gray-100">{t.resetConfirmTitle}</h3>
              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                {t.resetConfirmDesc}
              </p>
            </div>
            <div className="flex gap-2.5 justify-center pt-2 relative z-10">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white rounded-xl text-xs font-semibold transition-all border border-white/[0.08] cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResetConfirmModal(false);
                  resetBoard();
                }}
                className="px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(244,63,94,0.4)] cursor-pointer active:scale-95"
              >
                {t.yesReset}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Loading Custom FEN */}
      {showLoadFenModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setShowLoadFenModal(false)}
        >
          <div
            className="bg-[#060818]/95 border border-white/[0.12] rounded-3xl p-6 shadow-2xl max-w-lg w-full space-y-4 transform transition-all text-left relative overflow-hidden backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute -bottom-20 -right-20 w-60 h-60 bg-violet-600/15 rounded-full blur-3xl" />
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] relative z-10">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📥</span>
                <h3 className="text-base font-bold text-gray-100">{t.loadFenTitleModal}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLoadFenModal(false)}
                className="text-gray-400 hover:text-gray-200 text-base font-bold p-1 cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-400 relative z-10">
              {t.loadFenDesc}
            </p>

            <div className="relative z-10">
              <textarea
                value={fenInput}
                onChange={(e) => {
                  setFenInput(e.target.value);
                  setFenLoadError(null);
                }}
                placeholder="e.g. rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
                rows={3}
                className="w-full p-3.5 bg-black/60 border border-white/[0.1] focus:border-violet-500/80 focus:ring-1 focus:ring-violet-500/40 rounded-xl text-xs font-mono text-gray-200 placeholder-gray-600 resize-none outline-none transition-all"
              />
              {fenLoadError && (
                <p className="text-xs text-rose-400 mt-1 font-semibold flex items-center gap-1">
                  <span>⚠️</span>
                  <span>{fenLoadError}</span>
                </p>
              )}
            </div>

            {/* Quick Presets */}
            <div className="relative z-10">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-2 font-mono">
                Quick Presets:
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setFenInput('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')}
                  className="px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-violet-500/40 rounded-lg text-xs font-mono text-gray-300 transition-colors cursor-pointer"
                >
                  Starting Board
                </button>
                <button
                  type="button"
                  onClick={() => setFenInput('rnbqkbnr/pppp1ppp/8/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 3')}
                  className="px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-violet-500/40 rounded-lg text-xs font-mono text-violet-300 transition-colors cursor-pointer"
                >
                  Scholar's Mate Threat
                </button>
                <button
                  type="button"
                  onClick={() => setFenInput('r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 5')}
                  className="px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-violet-500/40 rounded-lg text-xs font-mono text-indigo-300 transition-colors cursor-pointer"
                >
                  Italian Game (Giuoco Piano)
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end pt-3 border-t border-white/[0.08] relative z-10">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                      setFenInput(text.trim());
                      setFenLoadError(null);
                    }
                  } catch (e) {
                    setFenLoadError('Clipboard read permission denied. Please paste manually.');
                  }
                }}
                className="px-3.5 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white rounded-xl text-xs font-semibold transition-colors border border-white/[0.08] flex items-center gap-1.5 cursor-pointer"
              >
                <span>📋</span>
                <span>{t.pasteFenString}</span>
              </button>
              <button
                type="button"
                onClick={() => loadCustomFen(fenInput)}
                className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(139,92,246,0.4)] flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <span>✓</span>
                <span>{t.loadPosition}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Board & Interface Settings Modal */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            className="bg-[#060818]/95 border border-white/[0.12] rounded-3xl p-6 shadow-2xl max-w-lg w-full space-y-6 transform transition-all text-left max-h-[90vh] overflow-y-auto relative backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute -bottom-20 -right-20 w-60 h-60 bg-violet-600/15 rounded-full blur-3xl" />
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] relative z-10">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">⚙️</span>
                <div>
                  <h3 className="text-base font-bold text-gray-100">{t.boardSettingsTitle}</h3>
                  <p className="text-xs text-gray-400">{t.boardSettingsDesc}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-gray-400 hover:text-gray-200 text-base font-bold p-1.5 rounded-lg hover:bg-white/[0.05] cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Board Themes Grid */}
            <div className="space-y-3 relative z-10">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-200 uppercase tracking-wider font-mono">
                  {t.boardColorTheme}
                </label>
                <span className="text-[11px] font-mono text-violet-400 font-bold">
                  {BOARD_THEMES.find(t => t.id === boardTheme)?.name}
                </span>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {BOARD_THEMES.map((theme) => {
                  const isSelected = boardTheme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => updateBoardTheme(theme.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${
                        isSelected
                          ? 'bg-violet-950/30 border-violet-500 ring-1 ring-violet-500/40 shadow-lg shadow-violet-950/50'
                          : 'bg-black/40 hover:bg-white/[0.04] border-white/[0.08]'
                      }`}
                    >
                      {/* Checkered 2x2 Mini Preview Box */}
                      <div className="w-full h-12 rounded-lg overflow-hidden border border-black/40 grid grid-cols-2 shadow-inner">
                        <div style={{ backgroundColor: theme.lightSquare }} />
                        <div style={{ backgroundColor: theme.darkSquare }} />
                        <div style={{ backgroundColor: theme.darkSquare }} />
                        <div style={{ backgroundColor: theme.lightSquare }} />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-200 truncate">
                          {theme.name}
                        </span>
                        {isSelected && (
                          <span className="text-xs text-violet-400 font-bold">✓</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Board Coordinates Toggle */}
            <div className="p-4 bg-white/[0.02] border border-white/[0.08] rounded-xl flex items-center justify-between relative z-10">
              <div>
                <h4 className="text-sm font-bold text-gray-200">{t.boardCoordinates}</h4>
                <p className="text-xs text-gray-400 mt-0.5">{t.boardCoordinatesDesc}</p>
              </div>
              <button
                type="button"
                onClick={() => updateShowCoordinates(!showCoordinates)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                  showCoordinates ? 'bg-violet-600 shadow-[0_0_10px_rgba(139,92,246,0.5)]' : 'bg-gray-800 border border-white/10'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    showCoordinates ? 'translate-x-4.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Move Sound Audio Toggle */}
            <div className="p-4 bg-white/[0.02] border border-white/[0.08] rounded-xl flex items-center justify-between relative z-10">
              <div>
                <h4 className="text-sm font-bold text-gray-200">{t.audioFeedback}</h4>
                <p className="text-xs text-gray-400 mt-0.5">{t.audioFeedbackDesc}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextVal = !soundEnabled;
                  updateSoundEnabled(nextVal);
                  if (nextVal) playMoveSound('move');
                }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                  soundEnabled ? 'bg-violet-600 shadow-[0_0_10px_rgba(139,92,246,0.5)]' : 'bg-gray-800 border border-white/10'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    soundEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Action Footer */}
            <div className="flex justify-end pt-3 border-t border-white/[0.08] relative z-10">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(139,92,246,0.4)] cursor-pointer active:scale-95"
              >
                {t.saveAndClose}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Position Modal */}
      {showShareModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="bg-[#060818]/95 border border-white/[0.12] rounded-3xl p-6 shadow-2xl max-w-lg w-full space-y-5 transform transition-all text-left relative overflow-hidden backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute -bottom-20 -right-20 w-60 h-60 bg-violet-600/15 rounded-full blur-3xl" />
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] relative z-10">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🔗</span>
                <div>
                  <h3 className="text-base font-bold text-gray-100">{t.sharePositionTitle}</h3>
                  <p className="text-xs text-gray-400">{t.sharePositionDesc}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-gray-200 text-base font-bold p-1.5 rounded-lg hover:bg-white/[0.05] cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Position Summary Card */}
            <div className="p-3.5 bg-black/40 border border-white/[0.08] rounded-xl flex items-center justify-between relative z-10">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{game.turn() === 'w' ? '♔' : '♚'}</span>
                <div>
                  <div className="text-xs font-bold text-gray-200">
                    {game.turn() === 'w' ? t.whiteToMove : t.blackToMove}
                  </div>
                  <div className="text-[11px] text-gray-400 font-mono truncate max-w-[220px] sm:max-w-xs">
                    {game.fen()}
                  </div>
                </div>
              </div>

              {positionEval && (
                <span className="px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 border border-violet-400/40 text-xs font-mono font-bold">
                  {positionEval.evalWhiteStr}
                </span>
              )}
            </div>

            {/* Direct URL Share Box */}
            <div className="space-y-1.5 relative z-10">
              <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block font-mono">
                {t.directShareLink}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={typeof window !== 'undefined' ? window.location.href : 'https://nextmovechesss.com'}
                  className="flex-1 p-3 bg-black/60 border border-white/[0.1] rounded-xl text-xs font-mono text-gray-300 outline-none select-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      navigator.clipboard.writeText(window.location.href);
                      setCopiedShareUrl(true);
                      setTimeout(() => setCopiedShareUrl(false), 2000);
                    }
                  }}
                  className={`px-4 py-3 rounded-xl text-xs font-bold transition-all border shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    copiedShareUrl
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                      : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-violet-400/40 shadow-[0_0_15px_rgba(139,92,246,0.4)]'
                  }`}
                >
                  <span>{copiedShareUrl ? '✓' : '📋'}</span>
                  <span>{copiedShareUrl ? t.copied : t.copyLink}</span>
                </button>
              </div>
            </div>

            {/* Social Share 1-Click Buttons */}
            <div className="space-y-2 relative z-10">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block font-mono">
                {t.shareToSocial}
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {/* 𝕏 / Twitter */}
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('Analyze this chess position with Stockfish on Next Move Chess:')}&url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : 'https://nextmovechesss.com')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 bg-black/40 hover:bg-white/[0.04] text-gray-200 border border-white/[0.08] hover:border-violet-500/40 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm group"
                >
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span>{t.postOnX}</span>
                </a>

                {/* WhatsApp */}
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent('Check out this chess position on Next Move Chess: ' + (typeof window !== 'undefined' ? window.location.href : 'https://nextmovechesss.com'))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 bg-black/40 hover:bg-white/[0.04] text-emerald-300 border border-white/[0.08] hover:border-emerald-500/40 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm group"
                >
                  <svg className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                  </svg>
                  <span>{t.whatsapp}</span>
                </a>

                {/* Facebook */}
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : 'https://nextmovechesss.com')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 bg-black/40 hover:bg-white/[0.04] text-blue-300 border border-white/[0.08] hover:border-blue-500/40 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm group"
                >
                  <svg className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  <span>{t.facebook}</span>
                </a>
              </div>
            </div>

            {/* Action Footer */}
            <div className="flex justify-end pt-3 border-t border-white/[0.08] relative z-10">
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white rounded-xl text-xs font-bold transition-all border border-white/[0.08] cursor-pointer"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



