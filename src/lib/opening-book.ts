import type { EngineMoveData, EngineEvalResult } from './stockfish-client';

export interface BookMoveEntry {
  move: string;        // UCI notation, e.g. "e2e4"
  san: string;         // SAN notation, e.g. "e4"
  scoreCp: number;     // Centipawn relative score from mover's perspective (e.g. +25 for +0.25)
  pv: string[];        // Continuation line
  openingName?: string;
}

// Master opening book indexed by normalized FEN (first 4 tokens: pieces activeColor castling enPassant)
const OPENING_BOOK: Record<string, BookMoveEntry[]> = {
  // 1. Initial Starting Position
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': [
    { move: 'e2e4', san: 'e4', scoreCp: 25, pv: ['e2e4', 'e7e5', 'g1f3', 'b8c6'], openingName: "King's Pawn Opening" },
    { move: 'd2d4', san: 'd4', scoreCp: 25, pv: ['d2d4', 'd7d5', 'c2c4', 'e7e6'], openingName: "Queen's Pawn Opening" },
    { move: 'g1f3', san: 'Nf3', scoreCp: 20, pv: ['g1f3', 'd7d5', 'g2g3', 'g8f6'], openingName: "Zukertort / Réti Opening" },
    { move: 'c2c4', san: 'c4', scoreCp: 18, pv: ['c2c4', 'e7e5', 'b1c3', 'g8f6'], openingName: "English Opening" },
    { move: 'g2g3', san: 'g3', scoreCp: 10, pv: ['g2g3', 'd7d5', 'f1g2', 'g8f6'], openingName: "King's Fianchetto Opening" },
    { move: 'b2b3', san: 'b3', scoreCp: 8, pv: ['b2b3', 'e7e5', 'c1b2', 'b8c6'], openingName: "Nimzo-Larsen Attack" },
    { move: 'b1c3', san: 'Nc3', scoreCp: 5, pv: ['b1c3', 'd7d5', 'd2d4', 'g8f6'], openingName: "Van Geet Opening" },
    { move: 'f2f4', san: 'f4', scoreCp: 0, pv: ['f2f4', 'd7d5', 'g1f3', 'g8f6'], openingName: "Bird's Opening" },
  ],

  // 2. Responses to 1. e4
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3': [
    { move: 'c7c5', san: 'c5', scoreCp: 20, pv: ['c7c5', 'g1f3', 'd7d6', 'd2d4'], openingName: 'Sicilian Defense' },
    { move: 'e7e5', san: 'e5', scoreCp: 22, pv: ['e7e5', 'g1f3', 'b8c6', 'f1c4'], openingName: "King's Pawn Game" },
    { move: 'e7e6', san: 'e6', scoreCp: 25, pv: ['e7e6', 'd2d4', 'd7d5', 'b1c3'], openingName: 'French Defense' },
    { move: 'c7c6', san: 'c6', scoreCp: 24, pv: ['c7c6', 'd2d4', 'd7d5', 'b1c3'], openingName: 'Caro-Kann Defense' },
    { move: 'd7d6', san: 'd6', scoreCp: 28, pv: ['d7d6', 'd2d4', 'g8f6', 'b1c3'], openingName: 'Pirc Defense' },
    { move: 'd7d5', san: 'd5', scoreCp: 30, pv: ['d7d5', 'e4d5', 'd8d5', 'b1c3'], openingName: 'Scandinavian Defense' },
    { move: 'g7g6', san: 'g6', scoreCp: 30, pv: ['g7g6', 'd2d4', 'f8g7', 'g1f3'], openingName: 'Modern Defense' },
    { move: 'g8f6', san: 'Nf6', scoreCp: 32, pv: ['g8f6', 'e4e5', 'f6d5', 'd2d4'], openingName: "Alekhine's Defense" },
  ],
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -': [
    { move: 'c7c5', san: 'c5', scoreCp: 20, pv: ['c7c5', 'g1f3', 'd7d6', 'd2d4'], openingName: 'Sicilian Defense' },
    { move: 'e7e5', san: 'e5', scoreCp: 22, pv: ['e7e5', 'g1f3', 'b8c6', 'f1c4'], openingName: "King's Pawn Game" },
    { move: 'e7e6', san: 'e6', scoreCp: 25, pv: ['e7e6', 'd2d4', 'd7d5', 'b1c3'], openingName: 'French Defense' },
    { move: 'c7c6', san: 'c6', scoreCp: 24, pv: ['c7c6', 'd2d4', 'd7d5', 'b1c3'], openingName: 'Caro-Kann Defense' },
  ],

  // 3. Responses to 1. d4
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3': [
    { move: 'g8f6', san: 'Nf6', scoreCp: 20, pv: ['g8f6', 'c2c4', 'e7e6', 'g1f3'], openingName: 'Indian Defense' },
    { move: 'd7d5', san: 'd5', scoreCp: 22, pv: ['d7d5', 'c2c4', 'e7e6', 'b1c3'], openingName: "Queen's Pawn Game" },
    { move: 'e7e6', san: 'e6', scoreCp: 25, pv: ['e7e6', 'c2c4', 'g8f6', 'b1c3'], openingName: "Horwitz Defense / Queen's Pawn" },
    { move: 'f7f5', san: 'f5', scoreCp: 30, pv: ['f7f5', 'c2c4', 'g8f6', 'g2g3'], openingName: 'Dutch Defense' },
    { move: 'c7c5', san: 'c5', scoreCp: 32, pv: ['c7c5', 'd4d5', 'e7e6', 'b1c3'], openingName: 'Old Benoni Defense' },
    { move: 'g7g6', san: 'g6', scoreCp: 30, pv: ['g7g6', 'c2c4', 'f8g7', 'b1c3'], openingName: "King's Indian setup" },
  ],
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -': [
    { move: 'g8f6', san: 'Nf6', scoreCp: 20, pv: ['g8f6', 'c2c4', 'e7e6', 'g1f3'], openingName: 'Indian Defense' },
    { move: 'd7d5', san: 'd5', scoreCp: 22, pv: ['d7d5', 'c2c4', 'e7e6', 'b1c3'], openingName: "Queen's Pawn Game" },
    { move: 'e7e6', san: 'e6', scoreCp: 25, pv: ['e7e6', 'c2c4', 'g8f6', 'b1c3'], openingName: "Horwitz Defense" },
  ],

  // 4. Responses to 1. Nf3
  'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -': [
    { move: 'd7d5', san: 'd5', scoreCp: 20, pv: ['d7d5', 'g2g3', 'g8f6', 'f1g2'], openingName: 'Réti Opening' },
    { move: 'g8f6', san: 'Nf6', scoreCp: 20, pv: ['g8f6', 'c2c4', 'g7g6', 'b1c3'], openingName: 'Symmetrical / King\'s Indian setup' },
    { move: 'c7c5', san: 'c5', scoreCp: 20, pv: ['c7c5', 'g2g3', 'b8c6', 'f1g2'], openingName: 'English / Réti' },
    { move: 'e7e6', san: 'e6', scoreCp: 22, pv: ['e7e6', 'c2c4', 'd7d5', 'd2d4'], openingName: 'Queen\'s Gambit setup' },
  ],

  // 5. Responses to 1. c4
  'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3': [
    { move: 'e7e5', san: 'e5', scoreCp: 20, pv: ['e7e5', 'b1c3', 'g8f6', 'g1f3'], openingName: 'King\'s English' },
    { move: 'c7c5', san: 'c5', scoreCp: 20, pv: ['c7c5', 'b1c3', 'b8c6', 'g1f3'], openingName: 'Symmetrical English' },
    { move: 'g8f6', san: 'Nf6', scoreCp: 20, pv: ['g8f6', 'b1c3', 'e7e6', 'g1f3'], openingName: 'Anglo-Indian' },
    { move: 'e7e6', san: 'e6', scoreCp: 22, pv: ['e7e6', 'g1f3', 'd7d5', 'd2d4'], openingName: 'Agincourt Defense' },
    { move: 'c7c6', san: 'c6', scoreCp: 22, pv: ['c7c6', 'g1f3', 'd7d5', 'b2b3'], openingName: 'Caro-Kann setup / Slav English' },
  ],
  'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq -': [
    { move: 'e7e5', san: 'e5', scoreCp: 20, pv: ['e7e5', 'b1c3', 'g8f6', 'g1f3'], openingName: 'King\'s English' },
    { move: 'c7c5', san: 'c5', scoreCp: 20, pv: ['c7c5', 'b1c3', 'b8c6', 'g1f3'], openingName: 'Symmetrical English' },
    { move: 'g8f6', san: 'Nf6', scoreCp: 20, pv: ['g8f6', 'b1c3', 'e7e6', 'g1f3'], openingName: 'Anglo-Indian' },
  ],

  // 6. After 1. e4 e5
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6': [
    { move: 'g1f3', san: 'Nf3', scoreCp: 25, pv: ['g1f3', 'b8c6', 'f1b5', 'a7a6'], openingName: "King's Knight Opening" },
    { move: 'f1c4', san: 'Bc4', scoreCp: 20, pv: ['f1c4', 'g8f6', 'd2d3', 'c7c6'], openingName: "Bishop's Opening" },
    { move: 'b1c3', san: 'Nc3', scoreCp: 18, pv: ['b1c3', 'g8f6', 'f2f4', 'd7d5'], openingName: 'Vienna Game' },
    { move: 'd2d4', san: 'd4', scoreCp: 15, pv: ['d2d4', 'e5d4', 'd8d4', 'b8c6'], openingName: 'Center Game' },
    { move: 'f2f4', san: 'f4', scoreCp: 15, pv: ['f2f4', 'e5f4', 'g1f3', 'g7g5'], openingName: "King's Gambit" },
  ],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': [
    { move: 'g1f3', san: 'Nf3', scoreCp: 25, pv: ['g1f3', 'b8c6', 'f1b5', 'a7a6'], openingName: "King's Knight Opening" },
    { move: 'f1c4', san: 'Bc4', scoreCp: 20, pv: ['f1c4', 'g8f6', 'd2d3', 'c7c6'], openingName: "Bishop's Opening" },
    { move: 'b1c3', san: 'Nc3', scoreCp: 18, pv: ['b1c3', 'g8f6', 'f2f4', 'd7d5'], openingName: 'Vienna Game' },
  ],

  // 7. After 1. e4 c5 (Sicilian)
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6': [
    { move: 'g1f3', san: 'Nf3', scoreCp: 25, pv: ['g1f3', 'd7d6', 'd2d4', 'c5d4'], openingName: 'Open Sicilian' },
    { move: 'b1c3', san: 'Nc3', scoreCp: 20, pv: ['b1c3', 'b8c6', 'g2g3', 'g7g6'], openingName: 'Closed Sicilian' },
    { move: 'c2c3', san: 'c3', scoreCp: 20, pv: ['c2c3', 'd7d5', 'e4d5', 'd8d5'], openingName: 'Alapin Sicilian' },
    { move: 'd2d4', san: 'd4', scoreCp: 15, pv: ['d2d4', 'c5d4', 'c2c3', 'd4c3'], openingName: 'Smith-Morra Gambit' },
  ],
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': [
    { move: 'g1f3', san: 'Nf3', scoreCp: 25, pv: ['g1f3', 'd7d6', 'd2d4', 'c5d4'], openingName: 'Open Sicilian' },
    { move: 'b1c3', san: 'Nc3', scoreCp: 20, pv: ['b1c3', 'b8c6', 'g2g3', 'g7g6'], openingName: 'Closed Sicilian' },
    { move: 'c2c3', san: 'c3', scoreCp: 20, pv: ['c2c3', 'd7d5', 'e4d5', 'd8d5'], openingName: 'Alapin Sicilian' },
  ],

  // 8. After 1. d4 d5
  'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6': [
    { move: 'c2c4', san: 'c4', scoreCp: 25, pv: ['c2c4', 'e7e6', 'b1c3', 'g8f6'], openingName: "Queen's Gambit" },
    { move: 'g1f3', san: 'Nf3', scoreCp: 22, pv: ['g1f3', 'g8f6', 'c1f4', 'c7c5'], openingName: "Queen's Pawn Game" },
    { move: 'c1f4', san: 'Bf4', scoreCp: 20, pv: ['c1f4', 'g8f6', 'e2e3', 'c7c5'], openingName: 'London System' },
    { move: 'e2e3', san: 'e3', scoreCp: 18, pv: ['e2e3', 'g8f6', 'f1d3', 'c7c5'], openingName: 'Colle System' },
  ],
  'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -': [
    { move: 'c2c4', san: 'c4', scoreCp: 25, pv: ['c2c4', 'e7e6', 'b1c3', 'g8f6'], openingName: "Queen's Gambit" },
    { move: 'g1f3', san: 'Nf3', scoreCp: 22, pv: ['g1f3', 'g8f6', 'c1f4', 'c7c5'], openingName: "Queen's Pawn Game" },
    { move: 'c1f4', san: 'Bf4', scoreCp: 20, pv: ['c1f4', 'g8f6', 'e2e3', 'c7c5'], openingName: 'London System' },
  ],

  // 9. After 1. d4 Nf6
  'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -': [
    { move: 'c2c4', san: 'c4', scoreCp: 25, pv: ['c2c4', 'e7e6', 'g1f3', 'd7d5'], openingName: 'Indian Defense Main Line' },
    { move: 'g1f3', san: 'Nf3', scoreCp: 22, pv: ['g1f3', 'g7g6', 'c1f4', 'f8g7'], openingName: 'King\'s Indian / London' },
    { move: 'c1f4', san: 'Bf4', scoreCp: 20, pv: ['c1f4', 'd7d5', 'e2e3', 'c7c5'], openingName: 'London System' },
    { move: 'c1g5', san: 'Bg5', scoreCp: 18, pv: ['c1g5', 'd7d5', 'b1d2', 'c7c5'], openingName: 'Trompowsky Attack' },
  ],

  // 10. After 1. e4 e5 2. Nf3 Nc6
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': [
    { move: 'f1b5', san: 'Bb5', scoreCp: 25, pv: ['f1b5', 'a7a6', 'b5a4', 'g8f6'], openingName: 'Ruy Lopez (Spanish Opening)' },
    { move: 'f1c4', san: 'Bc4', scoreCp: 24, pv: ['f1c4', 'f8c5', 'c2c3', 'g8f6'], openingName: 'Italian Game (Giuoco Piano)' },
    { move: 'd2d4', san: 'd4', scoreCp: 22, pv: ['d2d4', 'e5d4', 'f3d4', 'g8f6'], openingName: 'Scotch Game' },
    { move: 'b1c3', san: 'Nc3', scoreCp: 20, pv: ['b1c3', 'g8f6', 'f1b5', 'f8b4'], openingName: 'Four Knights Game' },
  ],

  // 11. After 1. e4 e5 2. Nf3 Nf6 (Petrov)
  'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': [
    { move: 'f3e5', san: 'Nxe5', scoreCp: 25, pv: ['f3e5', 'd7d6', 'e5f3', 'f6e4'], openingName: 'Petrov Defense Classical' },
    { move: 'd2d4', san: 'd4', scoreCp: 22, pv: ['d2d4', 'f6e4', 'f1d3', 'd7d5'], openingName: 'Petrov Steinitz Attack' },
    { move: 'b1c3', san: 'Nc3', scoreCp: 18, pv: ['b1c3', 'b8c6', 'f1b5', 'f8b4'], openingName: 'Four Knights Petrov' },
  ],

  // 12. After 1. e4 c5 2. Nf3 d6
  'rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': [
    { move: 'd2d4', san: 'd4', scoreCp: 25, pv: ['d2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3'], openingName: 'Open Sicilian (Najdorf / Dragon)' },
    { move: 'f1b5', san: 'Bb5+', scoreCp: 20, pv: ['f1b5', 'c8d7', 'b5d7', 'd8d7'], openingName: 'Moscow / Canal-Sokolsky Attack' },
    { move: 'c2c3', san: 'c3', scoreCp: 18, pv: ['c2c3', 'g8f6', 'f1d3', 'g7g6'], openingName: 'Delayed Alapin' },
  ],

  // 13. After 1. e4 c5 2. Nf3 Nc6
  'r1bqkbnr/pp1ppppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': [
    { move: 'd2d4', san: 'd4', scoreCp: 25, pv: ['d2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3'], openingName: 'Open Sicilian (Classical / Taimanov)' },
    { move: 'f1b5', san: 'Bb5', scoreCp: 22, pv: ['f1b5', 'g7g6', 'b5c6', 'b7c6'], openingName: 'Rossolimo Attack' },
    { move: 'c2c3', san: 'c3', scoreCp: 18, pv: ['c2c3', 'g8f6', 'e4e5', 'f6d5'], openingName: 'Delayed Alapin' },
  ],

  // 14. After 1. d4 d5 2. c4 e6 (QGD)
  'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -': [
    { move: 'b1c3', san: 'Nc3', scoreCp: 25, pv: ['b1c3', 'g8f6', 'c1g5', 'f8e7'], openingName: "Queen's Gambit Declined" },
    { move: 'g1f3', san: 'Nf3', scoreCp: 24, pv: ['g1f3', 'g8f6', 'b1c3', 'c7c6'], openingName: "Queen's Gambit Declined / Semi-Slav" },
    { move: 'c4d5', san: 'cxd5', scoreCp: 20, pv: ['c4d5', 'e6d5', 'b1c3', 'c7c6'], openingName: 'QGD Exchange Variation' },
  ],

  // 15. After 1. d4 d5 2. c4 c6 (Slav)
  'rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -': [
    { move: 'g1f3', san: 'Nf3', scoreCp: 25, pv: ['g1f3', 'g8f6', 'b1c3', 'd5c4'], openingName: 'Slav Defense Main Line' },
    { move: 'b1c3', san: 'Nc3', scoreCp: 24, pv: ['b1c3', 'g8f6', 'g1f3', 'e7e6'], openingName: 'Slav Defense / Semi-Slav' },
    { move: 'c4d5', san: 'cxd5', scoreCp: 18, pv: ['c4d5', 'c6d5', 'b1c3', 'g8f6'], openingName: 'Slav Exchange Variation' },
  ],

  // 16. After 1. d4 Nf6 2. c4 e6
  'rnbqkb1r/pppp1ppp/4pn2/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -': [
    { move: 'b1c3', san: 'Nc3', scoreCp: 25, pv: ['b1c3', 'f8b4', 'e2e3', 'O-O'], openingName: 'Nimzo-Indian Defense' },
    { move: 'g1f3', san: 'Nf3', scoreCp: 24, pv: ['g1f3', 'b7b6', 'g2g3', 'c8b7'], openingName: "Queen's Indian / Bogo-Indian" },
    { move: 'g2g3', san: 'g3', scoreCp: 22, pv: ['g2g3', 'd7d5', 'f1g2', 'f8e7'], openingName: 'Catalan Opening' },
  ],

  // 17. After 1. d4 Nf6 2. c4 g6
  'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -': [
    { move: 'b1c3', san: 'Nc3', scoreCp: 25, pv: ['b1c3', 'd7d5', 'c4d5', 'f6d5'], openingName: "King's Indian / Grünfeld Defense" },
    { move: 'g1f3', san: 'Nf3', scoreCp: 22, pv: ['g1f3', 'f8g7', 'g2g3', 'O-O'], openingName: "King's Indian Fianchetto" },
    { move: 'g2g3', san: 'g3', scoreCp: 20, pv: ['g2g3', 'f8g7', 'f1g2', 'O-O'], openingName: 'King\'s Indian Fianchetto' },
    { move: 'f2f3', san: 'f3', scoreCp: 18, pv: ['f2f3', 'd7d5', 'c4d5', 'f6d5'], openingName: 'King\'s Indian Sämisch Setup' },
  ],
};

/**
 * Normalizes a full FEN string to its canonical 4-part form:
 * "<pieces> <turn> <castling> <en_passant>"
 */
export function normalizeFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return fen.trim();
  return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
}

/**
 * Returns opening book moves if available for the given FEN, converted to EngineEvalResult format.
 */
export function getOpeningBookResult(fen: string, limit: number = 5): EngineEvalResult | null {
  const normFen = normalizeFen(fen);
  let bookEntries = OPENING_BOOK[normFen];

  // Try fallback without en-passant if not matched
  if (!bookEntries) {
    const parts = normFen.split(' ');
    if (parts.length >= 4 && parts[3] !== '-') {
      const fallbackFen = `${parts[0]} ${parts[1]} ${parts[2]} -`;
      bookEntries = OPENING_BOOK[fallbackFen];
    }
  }

  if (!bookEntries || bookEntries.length === 0) {
    return null;
  }

  const activeColor = fen.split(' ')[1] || 'w';
  const bestMoves: EngineMoveData[] = bookEntries.slice(0, limit).map((entry, index) => {
    const rawScore = entry.scoreCp;
    const numericScore = rawScore;
    const whiteCp = activeColor === 'b' ? -rawScore : rawScore;
    const val = whiteCp / 100;
    const evalWhiteStr = val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2);

    return {
      move: entry.move,
      rawScore: rawScore,
      scoreType: 'cp',
      scoreStr: (rawScore / 100).toFixed(2),
      evalWhiteStr: evalWhiteStr,
      numericScore: numericScore,
      multiPvIndex: index + 1,
      pv: entry.pv,
      rank: index + 1,
    };
  });

  const topMove = bestMoves[0];
  const positionEval = topMove ? {
    scoreStr: topMove.scoreStr,
    evalWhiteStr: topMove.evalWhiteStr,
    numericScore: topMove.numericScore,
    scoreType: topMove.scoreType,
    rawScore: topMove.rawScore
  } : {
    scoreStr: '0.25',
    evalWhiteStr: '+0.25',
    numericScore: 25,
    scoreType: 'cp',
    rawScore: 25
  };

  return {
    best: bestMoves,
    worst: [],
    positionEval
  };
}
