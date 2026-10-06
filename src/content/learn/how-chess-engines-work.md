---
title: "How Chess Engines Work: From Alpha-Beta Search to NNUE Neural Networks"
description: "A deep dive into the technology powering modern chess engines like Stockfish — how they evaluate millions of positions per second and pick the perfect next move."
pubDate: 2026-03-05
category: "Engine Technology"
readTime: "8 min read"
author: "Next Move Chess AI Lab"
featured: false
---

Modern chess engines are among the most sophisticated heuristic and neural software systems ever built. Today, standard engines running inside a mobile web browser can defeat World Champions.

Here is a breakdown of how engines calculate millions of branches and determine the optimal next move.

---

## 1. Bitboards: Representing 64 Squares in 64 Bits

At the foundation, engines don't use 2D arrays. Instead, they use **Bitboards** — 64-bit unsigned integers where each bit represents a square on the chessboard:
- 1 bitboard for White Pawns
- 1 bitboard for White Knights
- ...and so on for all 12 piece types plus occupancy masks.

Using low-level bitwise operations (`AND`, `OR`, `XOR`, `Bit Shifts`), the engine generates all pseudo-legal moves in single CPU cycles.

---

## 2. Tree Search & Alpha-Beta Pruning

In a standard chess position, there are roughly **30 to 40 legal moves**. Searching 10 moves deep creates trillions of potential states (`Shannon's Number`).

To solve this combinatorial explosion, engines use:
* **Alpha-Beta Pruning**: Discards entire subtrees if a branch is mathematically proven to be worse than an already examined line.
* **Transposition Tables**: Caches already evaluated positions using Zobrist hashing.
* **Null Move Heuristics & Quiescence Search**: Continues searching tactical exchanges at leaf nodes to avoid the "horizon effect".

---

## 3. The NNUE Revolution (Efficiently Updatable Neural Networks)

Historically, engines used handcrafted evaluation functions (HCE) with hundreds of manual weights for king safety, pawn structure, and piece mobility.

In 2020, Stockfish integrated **NNUE** (Efficiently Updatable Neural Network). NNUE computes evaluation through shallow neural network layers directly connected to piece-square inputs, combining the raw speed of traditional search with deep intuitive positional understanding.

---

## Experience Stockfish in Your Browser

With WebAssembly (WASM) and Web Workers, you can run pure engine calculation locally with zero lag. Test it on **[Next Move Chess](/chess-next-move)**.
