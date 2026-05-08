#!/usr/bin/env node
/*
 * Pre-generate curated Arrow Escape puzzles for the web app.
 *
 * Arrow Escape rules:
 * - Rectangular grid; pieces are rigid multi-cell shapes with a direction arrow.
 * - Tapping a piece slides it in its arrow direction until blocked or off-board.
 * - If a piece slides fully off the board edge, it is removed.
 * - One red "target" piece; goal = target exits the board.
 *
 * Usage:
 *   node tools/generate-arrow-puzzles.js                # default 40s/tier
 *   node tools/generate-arrow-puzzles.js --budget 60000 # 60s per tier
 *
 * Output: arrow-puzzles.js at repo root.
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ---- CLI args ----
let TIME_BUDGET_MS = 40000;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--budget") TIME_BUDGET_MS = parseInt(argv[i + 1], 10);
}

// ---- Difficulty tiers ----
const TIERS = {
  simple:    { gridW: 7, gridH: 7, obstMin: 3, obstMax: 5, tapMin: 3, tapMax: 6,  target: 30 },
  moderate:  { gridW: 8, gridH: 8, obstMin: 5, obstMax: 8, tapMin: 5, tapMax: 10, target: 30 },
  difficult: { gridW: 9, gridH: 9, obstMin: 7, obstMax: 12, tapMin: 7, tapMax: 16, target: 30 },
};

const BFS_STATE_CAP = 150000;
const DIRS = ["n", "s", "e", "w"];
const DIR_DR = { n: -1, s: 1, e: 0, w: 0 };
const DIR_DC = { n: 0, s: 0, e: 1, w: -1 };

// ---- Shape templates (relative offsets: [row, col]) ----
const SHAPE_TEMPLATES = {
  straight2: [[0,0],[0,1]],
  straight3: [[0,0],[0,1],[0,2]],
  lShape:    [[0,0],[1,0],[1,1]],
  bigL:      [[0,0],[1,0],[2,0],[2,1]],
  corner:    [[0,0],[0,1],[1,0]],
};

const TARGET_SHAPES = ["straight2", "straight3"];
const ALL_SHAPE_NAMES = Object.keys(SHAPE_TEMPLATES);

// ---- Utilities ----
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Rotate a set of relative cells by 90° clockwise: (r,c) -> (c, -r), then normalize. */
function rotateCells90(cells) {
  const rotated = cells.map(([r, c]) => [c, -r]);
  const minR = Math.min(...rotated.map(([r]) => r));
  const minC = Math.min(...rotated.map(([, c]) => c));
  return rotated.map(([r, c]) => [r - minR, c - minC]);
}

function getShapeVariant(shapeName, rotation) {
  let cells = SHAPE_TEMPLATES[shapeName].map(([r, c]) => [r, c]);
  for (let i = 0; i < rotation; i++) {
    cells = rotateCells90(cells);
  }
  return cells;
}

/** Build an occupancy grid from pieces list. -1 = empty, else piece id. */
function buildOccupancy(gridH, gridW, pieces) {
  const g = Array.from({ length: gridH }, () => new Int16Array(gridW).fill(-1));
  for (const p of pieces) {
    for (const [r, c] of p.cells) {
      if (r >= 0 && r < gridH && c >= 0 && c < gridW) {
        g[r][c] = p.id;
      }
    }
  }
  return g;
}

// ---- Solver ----

/**
 * Encode a state as a string. Pieces sorted by id; exited pieces omitted.
 * Format: "id:r0,c0;r1,c1|id:r0,c0;..."
 */
function encodeState(pieces) {
  const parts = [];
  for (const p of pieces) {
    const cellStr = p.cells.map(([r, c]) => `${r},${c}`).join(";");
    parts.push(`${p.id}:${cellStr}`);
  }
  // pieces are already sorted by id in the arrays we maintain
  return parts.join("|");
}

/**
 * Compute legal taps from a given state.
 * Returns array of { newPieces (sorted by id), tappedId }.
 */
function legalMoves(pieces, gridH, gridW) {
  const moves = [];
  const occ = buildOccupancy(gridH, gridW, pieces);

  for (const piece of pieces) {
    const dr = DIR_DR[piece.dir];
    const dc = DIR_DC[piece.dir];

    // Try sliding step by step
    let steps = 0;
    let canExit = false;

    outer:
    for (let s = 1; ; s++) {
      // Check if ALL cells at offset s are either off-board or unoccupied by others
      let allOffBoard = true;
      for (const [r, c] of piece.cells) {
        const nr = r + dr * s;
        const nc = c + dc * s;
        if (nr >= 0 && nr < gridH && nc >= 0 && nc < gridW) {
          allOffBoard = false;
          // Check collision with other piece
          if (occ[nr][nc] !== -1 && occ[nr][nc] !== piece.id) {
            break outer; // blocked
          }
        }
      }
      if (allOffBoard) {
        canExit = true;
        break;
      }
      steps = s;
    }

    if (canExit) {
      // Piece exits: remove it from state
      const newPieces = pieces.filter(p => p.id !== piece.id);
      moves.push({ newPieces, tappedId: piece.id });
    } else if (steps > 0) {
      // Piece slides to new position
      const newCells = piece.cells.map(([r, c]) => [r + dr * steps, c + dc * steps]);
      const newPieces = pieces.map(p =>
        p.id === piece.id ? { ...p, cells: newCells } : p
      );
      moves.push({ newPieces, tappedId: piece.id });
    }
    // else: blocked immediately, skip
  }

  return moves;
}

/**
 * BFS solver. Returns minTaps to remove the target piece, or -1 if unsolvable.
 */
function solve(initialPieces, gridH, gridW, targetId) {
  const startKey = encodeState(initialPieces);
  const visited = new Set([startKey]);
  let queue = [{ pieces: initialPieces, taps: 0 }];

  while (queue.length > 0) {
    if (visited.size > BFS_STATE_CAP) return -1; // too complex

    const nextQueue = [];
    for (const { pieces, taps } of queue) {
      const moves = legalMoves(pieces, gridH, gridW);
      for (const { newPieces } of moves) {
        // Check if target has exited
        if (!newPieces.some(p => p.id === targetId)) {
          return taps + 1;
        }
        const key = encodeState(newPieces);
        if (!visited.has(key)) {
          visited.add(key);
          nextQueue.push({ pieces: newPieces, taps: taps + 1 });
        }
      }
    }
    queue = nextQueue;
  }

  return -1; // unsolvable
}

// ---- Puzzle Generation ----

/**
 * Compute cells in the sliding path of a piece (in its dir) up to the board edge.
 * Returns array of [r,c] positions that the piece's cells would sweep through.
 */
function pathCells(piece, gridH, gridW) {
  const dr = DIR_DR[piece.dir];
  const dc = DIR_DC[piece.dir];
  const cells = new Set();
  for (let s = 1; s < Math.max(gridH, gridW); s++) {
    for (const [r, c] of piece.cells) {
      const nr = r + dr * s;
      const nc = c + dc * s;
      if (nr >= 0 && nr < gridH && nc >= 0 && nc < gridW) {
        cells.add(`${nr},${nc}`);
      }
    }
  }
  // Remove cells occupied by the piece itself
  for (const [r, c] of piece.cells) {
    cells.delete(`${r},${c}`);
  }
  return [...cells].map(s => s.split(",").map(Number));
}

/**
 * Choose a direction that's hard to exit from this position.
 * Picks the direction where the piece has the most distance to travel to the edge,
 * with some randomness.
 */
function pickHardDir(cells, gridH, gridW) {
  const dirs = ["n", "s", "e", "w"];
  const distances = dirs.map(d => {
    const dr = DIR_DR[d], dc = DIR_DC[d];
    // Min distance any cell would need to travel to exit
    let minDist = Infinity;
    for (const [r, c] of cells) {
      let dist;
      if (d === "n") dist = r + 1;
      else if (d === "s") dist = gridH - r;
      else if (d === "w") dist = c + 1;
      else dist = gridW - c;
      minDist = Math.min(minDist, dist);
    }
    return minDist;
  });

  // Weight toward farther directions (harder to exit)
  // But still allow some randomness
  if (Math.random() < 0.6) {
    // Pick the direction with max distance (hardest to exit)
    let best = 0;
    for (let i = 1; i < 4; i++) {
      if (distances[i] > distances[best]) best = i;
    }
    return dirs[best];
  }
  return pick(dirs);
}

/**
 * Try to place an obstacle piece at a specific position.
 * Returns the piece object or null if placement fails.
 * If hardDir is true, picks a direction that makes the piece hard to remove.
 */
function tryPlaceAt(occ, gridH, gridW, pieceId, targetRow, targetCol, hardDir) {
  const shapeName = pick(ALL_SHAPE_NAMES);
  const rotation = randInt(0, 3);
  const relCells = getShapeVariant(shapeName, rotation);

  // Try to position the shape so that one of its cells lands on (targetRow, targetCol)
  const anchorIdx = randInt(0, relCells.length - 1);
  const or = targetRow - relCells[anchorIdx][0];
  const oc = targetCol - relCells[anchorIdx][1];

  // Bounds check
  for (const [r, c] of relCells) {
    const ar = or + r, ac = oc + c;
    if (ar < 0 || ar >= gridH || ac < 0 || ac >= gridW) return null;
    if (occ[ar][ac] !== -1) return null;
  }

  const obstCells = relCells.map(([r, c]) => [or + r, oc + c]);
  const obstDir = hardDir ? pickHardDir(obstCells, gridH, gridW) : pick(DIRS);
  return {
    id: pieceId,
    cells: obstCells,
    dir: obstDir,
    isTarget: false,
    shape: shapeName,
  };
}

function tryGeneratePuzzle(tier) {
  const { gridW, gridH, obstMin, obstMax, tapMin, tapMax } = tier;
  const numObst = randInt(obstMin, obstMax);

  // 1. Place target piece
  const targetShapeName = pick(TARGET_SHAPES);
  const targetRotation = randInt(0, 3);
  const targetRelCells = getShapeVariant(targetShapeName, targetRotation);

  const maxR = Math.max(...targetRelCells.map(([r]) => r));
  const maxC = Math.max(...targetRelCells.map(([, c]) => c));

  const targetDir = pick(DIRS);

  // Position target toward center with distance from exit edge proportional to difficulty
  let tr, tc;
  const margin = Math.max(2, Math.floor(tapMin / 2));
  let placed = false;

  for (let a = 0; a < 50; a++) {
    tr = randInt(1, gridH - 1 - maxR);
    tc = randInt(1, gridW - 1 - maxC);

    let tooClose = false;
    for (const [r, c] of targetRelCells) {
      const ar = tr + r, ac = tc + c;
      if (targetDir === "n" && ar < margin) tooClose = true;
      if (targetDir === "s" && ar >= gridH - margin) tooClose = true;
      if (targetDir === "w" && ac < margin) tooClose = true;
      if (targetDir === "e" && ac >= gridW - margin) tooClose = true;
    }
    if (!tooClose) { placed = true; break; }
  }
  if (!placed) return null;

  const targetCells = targetRelCells.map(([r, c]) => [tr + r, tc + c]);
  const targetPiece = {
    id: 0,
    cells: targetCells,
    dir: targetDir,
    isTarget: true,
    shape: targetShapeName,
  };

  // 2. Place obstacle pieces with strategic blocking
  const pieces = [targetPiece];
  const occ = buildOccupancy(gridH, gridW, pieces);

  // Compute cells in target's path - we want obstacles here
  const targetPath = pathCells(targetPiece, gridH, gridW);
  const blockingTarget = Math.min(Math.ceil(numObst * 0.4), targetPath.length);

  // Phase A: place blockers in the target's path (with hard-to-exit directions)
  let blockers = 0;
  const shuffledPath = targetPath.sort(() => Math.random() - 0.5);
  for (const [pr, pc] of shuffledPath) {
    if (blockers >= blockingTarget) break;
    for (let a = 0; a < 12; a++) {
      const piece = tryPlaceAt(occ, gridH, gridW, pieces.length, pr, pc, true);
      if (piece) {
        for (const [r, c] of piece.cells) occ[r][c] = piece.id;
        pieces.push(piece);
        blockers++;
        break;
      }
    }
  }

  // Phase B: place secondary blockers in the paths of existing obstacles
  // This creates chains: to move target, you must move A; to move A, you must move B
  const chainTarget = Math.min(Math.ceil(numObst * 0.3), numObst - (pieces.length - 1));
  let chainPlaced = 0;
  const existingObstacles = pieces.slice(1); // skip target
  for (const obst of existingObstacles.sort(() => Math.random() - 0.5)) {
    if (chainPlaced >= chainTarget) break;
    const obstPath = pathCells(obst, gridH, gridW);
    const shuffled = obstPath.sort(() => Math.random() - 0.5);
    for (const [pr, pc] of shuffled) {
      if (chainPlaced >= chainTarget) break;
      for (let a = 0; a < 8; a++) {
        const piece = tryPlaceAt(occ, gridH, gridW, pieces.length, pr, pc, true);
        if (piece) {
          for (const [r, c] of piece.cells) occ[r][c] = piece.id;
          pieces.push(piece);
          chainPlaced++;
          break;
        }
      }
    }
  }

  // Phase C: fill remaining obstacles — mix of nearby and random placement
  while (pieces.length - 1 < numObst) {
    let placedObst = false;
    for (let a = 0; a < 100; a++) {
      const shapeName = pick(ALL_SHAPE_NAMES);
      const rotation = randInt(0, 3);
      const relCells = getShapeVariant(shapeName, rotation);
      const smaxR = Math.max(...relCells.map(([r]) => r));
      const smaxC = Math.max(...relCells.map(([, c]) => c));

      let or, oc;
      if (Math.random() < 0.6 && pieces.length > 1) {
        // Place near an existing piece
        const ref = pick(pieces);
        const refCell = pick(ref.cells);
        or = refCell[0] + randInt(-2, 2) - relCells[0][0];
        oc = refCell[1] + randInt(-2, 2) - relCells[0][1];
      } else {
        or = randInt(0, gridH - 1 - smaxR);
        oc = randInt(0, gridW - 1 - smaxC);
      }

      let ok = true;
      for (const [r, c] of relCells) {
        const ar = or + r, ac = oc + c;
        if (ar < 0 || ar >= gridH || ac < 0 || ac >= gridW) { ok = false; break; }
        if (occ[ar][ac] !== -1) { ok = false; break; }
      }
      if (!ok) continue;

      const obstCells = relCells.map(([r, c]) => [or + r, oc + c]);
      const obstDir = pickHardDir(obstCells, gridH, gridW);
      const obstPiece = {
        id: pieces.length,
        cells: obstCells,
        dir: obstDir,
        isTarget: false,
        shape: shapeName,
      };

      for (const [r, c] of obstCells) occ[r][c] = obstPiece.id;
      pieces.push(obstPiece);
      placedObst = true;
      break;
    }
    if (!placedObst) break;
  }

  // Need at least obstMin total obstacles
  if (pieces.length - 1 < obstMin) return null;

  // 3. Solve
  const solverPieces = pieces.map(p => ({
    id: p.id,
    cells: p.cells.map(([r, c]) => [r, c]),
    dir: p.dir,
  }));

  const minTaps = solve(solverPieces, gridH, gridW, 0);
  if (minTaps < tapMin || minTaps > tapMax) return null;

  // 4. Return puzzle
  return {
    minTaps,
    gridW,
    gridH,
    pieces: pieces.map(p => ({
      id: p.id,
      cells: p.cells,
      dir: p.dir,
      isTarget: p.isTarget,
    })),
  };
}

// ---- Perturbation: take a valid puzzle and mutate obstacle directions ----

/**
 * Given a valid puzzle, try changing obstacle directions to find a harder variant.
 * Uses multi-step mutations: sometimes changes 1-3 pieces at once.
 * Returns the best puzzle found (highest minTaps within range), or the original.
 */
function perturbPuzzle(puzzle, tier, maxIters) {
  const { tapMin, tapMax, gridW, gridH } = tier;
  let best = puzzle;

  for (let i = 0; i < maxIters; i++) {
    // Clone pieces from the best so far (hill-climbing)
    const newPieces = best.pieces.map(p => ({
      ...p,
      cells: p.cells.map(([r, c]) => [r, c]),
    }));

    const obstacles = newPieces.filter(p => !p.isTarget);
    if (obstacles.length === 0) break;

    // Mutate 1-3 pieces at once for broader exploration
    const numMutations = Math.min(randInt(1, 3), obstacles.length);
    const shuffled = obstacles.sort(() => Math.random() - 0.5);
    for (let m = 0; m < numMutations; m++) {
      const victim = shuffled[m];
      const otherDirs = DIRS.filter(d => d !== victim.dir);
      victim.dir = pick(otherDirs);
    }

    const solverPieces = newPieces.map(p => ({
      id: p.id,
      cells: p.cells.map(([r, c]) => [r, c]),
      dir: p.dir,
    }));

    const taps = solve(solverPieces, gridH, gridW, 0);
    if (taps >= tapMin && taps <= tapMax && taps > best.minTaps) {
      best = {
        minTaps: taps,
        gridW,
        gridH,
        pieces: newPieces,
      };
    }
  }

  return best;
}

/**
 * Exhaustive direction search for a puzzle: try ALL direction combinations
 * for a subset of pieces to find the maximum minTaps.
 */
function exhaustiveDirectionSearch(puzzle, tier, count) {
  const { tapMin, tapMax, gridW, gridH } = tier;
  const obstacles = puzzle.pieces.filter(p => !p.isTarget);
  if (obstacles.length === 0) return puzzle;

  // Pick up to `count` obstacles to exhaustively search
  const searchCount = Math.min(count || 4, obstacles.length);
  const searchObstacles = obstacles.sort(() => Math.random() - 0.5).slice(0, searchCount);
  const searchIds = new Set(searchObstacles.map(p => p.id));

  let best = puzzle;
  const combos = Math.pow(4, searchCount);

  for (let combo = 0; combo < combos; combo++) {
    const newPieces = puzzle.pieces.map(p => ({
      ...p,
      cells: p.cells.map(([r, c]) => [r, c]),
    }));

    // Assign directions based on combo number
    let c = combo;
    for (const p of newPieces) {
      if (searchIds.has(p.id)) {
        p.dir = DIRS[c % 4];
        c = Math.floor(c / 4);
      }
    }

    const solverPieces = newPieces.map(p => ({
      id: p.id,
      cells: p.cells.map(([r, c]) => [r, c]),
      dir: p.dir,
    }));

    const taps = solve(solverPieces, gridH, gridW, 0);
    if (taps >= tapMin && taps <= tapMax && taps > best.minTaps) {
      best = {
        minTaps: taps,
        gridW,
        gridH,
        pieces: newPieces,
      };
    }
  }

  return best;
}

// ---- Main ----

function main() {
  console.log(`Arrow Escape puzzle generator`);
  console.log(`Budget per tier: ${TIME_BUDGET_MS}ms\n`);

  const results = {};
  const totalStart = Date.now();

  for (const [tierName, tierCfg] of Object.entries(TIERS)) {
    console.log(`--- Generating ${tierName} (grid ${tierCfg.gridW}x${tierCfg.gridH}, taps ${tierCfg.tapMin}-${tierCfg.tapMax}) ---`);

    // Collect more puzzles than needed, then curate
    const overTarget = tierCfg.target * 3;
    const candidates = [];
    const tierStart = Date.now();
    let attempts = 0;

    // Phase 1: generate raw puzzles (use 70% of time budget)
    const phase1Budget = TIME_BUDGET_MS * 0.7;
    while (candidates.length < overTarget) {
      if (Date.now() - tierStart > phase1Budget) break;
      attempts++;
      const puzzle = tryGeneratePuzzle(tierCfg);
      if (puzzle) {
        candidates.push(puzzle);
        if (candidates.length % 10 === 0) {
          const taps = candidates.map(p => p.minTaps);
          process.stdout.write(`\r  Phase 1: ${candidates.length} candidates (max taps ${Math.max(...taps)}, ${attempts} attempts, ${((Date.now() - tierStart) / 1000).toFixed(1)}s)`);
        }
      }
    }
    console.log("");

    // Phase 2: perturbation + exhaustive direction search
    const phase2Start = Date.now();
    const phase2Budget = TIME_BUDGET_MS * 0.3;
    let improved = 0;

    // Sort candidates by minTaps descending — improve the best ones first
    candidates.sort((a, b) => b.minTaps - a.minTaps);

    for (let i = 0; i < candidates.length; i++) {
      if (Date.now() - phase2Start > phase2Budget) break;

      // More perturbation iterations for higher-difficulty tiers
      const iters = tierCfg.tapMin >= 7 ? 80 : tierCfg.tapMin >= 5 ? 50 : 30;
      let better = perturbPuzzle(candidates[i], tierCfg, iters);

      // Exhaustive direction search on top candidates for moderate + difficult
      if (tierCfg.tapMin >= 5 && i < 50) {
        // Number of pieces to search exhaustively: 4 for moderate, 5 for difficult
        const searchSize = tierCfg.tapMin >= 7 ? 5 : 4;
        // Multiple rounds with different random subsets
        const rounds = tierCfg.tapMin >= 7 ? 4 : 2;
        for (let round = 0; round < rounds; round++) {
          if (Date.now() - phase2Start > phase2Budget) break;
          const exh = exhaustiveDirectionSearch(better, tierCfg, searchSize);
          if (exh.minTaps > better.minTaps) better = exh;
        }
      }

      if (better.minTaps > candidates[i].minTaps) {
        candidates[i] = better;
        improved++;
      }
    }
    console.log(`  Phase 2: ${improved} puzzles improved via perturbation/search`);

    // Curate: pick the best spread of tap counts
    // Sort by minTaps descending so we favor harder puzzles
    candidates.sort((a, b) => b.minTaps - a.minTaps);

    // Try to get a good distribution across the tap range
    const puzzles = [];
    const tapBuckets = {};
    for (let t = tierCfg.tapMin; t <= tierCfg.tapMax; t++) tapBuckets[t] = [];
    for (const p of candidates) {
      tapBuckets[p.minTaps] = tapBuckets[p.minTaps] || [];
      tapBuckets[p.minTaps].push(p);
    }

    // Round-robin from each bucket
    let filled = false;
    while (!filled && puzzles.length < tierCfg.target) {
      filled = true;
      for (let t = tierCfg.tapMax; t >= tierCfg.tapMin; t--) {
        if (puzzles.length >= tierCfg.target) break;
        if (tapBuckets[t] && tapBuckets[t].length > 0) {
          puzzles.push(tapBuckets[t].pop());
          filled = false;
        }
      }
    }

    // Fill any remaining slots from leftovers
    if (puzzles.length < tierCfg.target) {
      for (const p of candidates) {
        if (puzzles.length >= tierCfg.target) break;
        if (!puzzles.includes(p)) puzzles.push(p);
      }
    }

    // Sort final puzzles by minTaps ascending for a nice progression
    puzzles.sort((a, b) => a.minTaps - b.minTaps);

    const taps = puzzles.map(p => p.minTaps);
    console.log(`  Final: ${puzzles.length} puzzles, minTaps range ${Math.min(...taps)}-${Math.max(...taps)}, ${attempts} total gen attempts\n`);
    results[tierName] = puzzles;
  }

  const totalTime = ((Date.now() - totalStart) / 1000).toFixed(1);

  // ---- Write output ----
  const outPath = path.join(__dirname, "..", "arrow-puzzles.js");
  const content = `// Auto-generated by tools/generate-arrow-puzzles.js — do not edit by hand.\nwindow.ARROW_PUZZLES = {\n  version: 1,\n  simple: ${JSON.stringify(results.simple || [], null, 2)},\n  moderate: ${JSON.stringify(results.moderate || [], null, 2)},\n  difficult: ${JSON.stringify(results.difficult || [], null, 2)}\n};\n`;

  fs.writeFileSync(outPath, content, "utf-8");
  const fileSize = fs.statSync(outPath).size;

  console.log(`=== Done ===`);
  console.log(`Total time: ${totalTime}s`);
  console.log(`Output: ${outPath} (${(fileSize / 1024).toFixed(1)} KB)`);
  for (const [tierName, puzzles] of Object.entries(results)) {
    const taps = puzzles.map(p => p.minTaps);
    console.log(`  ${tierName}: ${puzzles.length} puzzles, minTaps ${Math.min(...taps)}-${Math.max(...taps)}`);
  }

  // ---- Verification pass ----
  console.log(`\n=== Verification ===`);
  let allOk = true;
  for (const [tierName, puzzles] of Object.entries(results)) {
    let ok = 0, fail = 0;
    for (const puzzle of puzzles) {
      const solverPieces = puzzle.pieces.map(p => ({
        id: p.id,
        cells: p.cells.map(([r, c]) => [r, c]),
        dir: p.dir,
      }));
      const taps = solve(solverPieces, puzzle.gridH, puzzle.gridW, 0);
      if (taps === puzzle.minTaps) {
        ok++;
      } else {
        fail++;
        console.log(`  FAIL ${tierName} puzzle: expected ${puzzle.minTaps}, got ${taps}`);
        allOk = false;
      }
    }
    console.log(`  ${tierName}: ${ok}/${puzzles.length} verified OK`);
  }
  if (allOk) {
    console.log(`All puzzles verified successfully!`);
  } else {
    console.log(`WARNING: Some puzzles failed verification!`);
    process.exit(1);
  }
}

main();
